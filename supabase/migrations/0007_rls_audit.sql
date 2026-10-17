-- 0007_rls_audit.sql — догоняющие колонки, недостающие таблицы ТЗ 4.0 §4, триггеры updated_at,
-- exclusion constraint броней, хелперы RLS (§4.49), политики на всех таблицах и минимальные права.
--
-- Режимы доступа (схема работает в обоих):
--   ▸ Supabase (текущий код): сервер ходит через service_role (BYPASSRLS). anon/authenticated — роли PostgREST,
--     для них действуют политики ниже и колоночные GRANT-ы.
--   ▸ Self-hosted (ТЗ 4.0): приложение под своей ролью делает SET LOCAL app.role / app.business_id.
--     Этим настройкам верим ТОЛЬКО если current_user — не anon/authenticated (их клиент мог бы подделать).
--
-- Отступления от ТЗ §4.49 (безопасность важнее, правило приоритетов):
--   ▸ шаблон tenant-таблиц ТЗ даёт is_anon() SELECT/INSERT на ВСЕ брони, админов и реквизиты — не делаем:
--     anon читает только публичные данные клиентских сайтов и вставляет только новую бронь;
--   ▸ templates и outreach_log — без business_id (данные оператора) → только super_admin;
--   ▸ authenticated правит businesses/bookings только разрешёнными колонками (колоночные GRANT).
-- Идемпотентно. Требует 0001–0006.
begin;

create extension if not exists btree_gist;

-- ===== 1. Хелперы =====

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Добавляет CHECK, если его нет. Сначала NOT VALID (новые строки проверяются сразу), затем VALIDATE;
-- если старые данные нарушают условие — предупреждение, constraint остаётся NOT VALID, миграция не падает.
create or replace function public.ensure_check(p_table text, p_name text, p_expr text)
returns void language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from pg_constraint where conname = p_name and conrelid = format('public.%I', p_table)::regclass) then
    execute format('alter table public.%I add constraint %I check (%s) not valid', p_table, p_name, p_expr);
  end if;
  begin
    execute format('alter table public.%I validate constraint %I', p_table, p_name);
  exception when check_violation then
    raise warning '%.%: есть строки, нарушающие условие; constraint оставлен NOT VALID', p_table, p_name;
  end;
end;
$$;

-- Пересоздаёт FK с явным ON DELETE (ТЗ §4.1). Сироты обнуляются, чтобы FK встал.
create or replace function public.ensure_fk(p_table text, p_col text, p_ref text, p_on_delete text)
returns void language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name text := format('%s_%s_fkey', p_table, p_col);
begin
  if exists (
    select 1 from pg_constraint
    where conname = v_name and conrelid = format('public.%I', p_table)::regclass
      and confdeltype = case p_on_delete when 'cascade' then 'c' when 'set null' then 'n' end
  ) then
    return;
  end if;
  execute format('alter table public.%I drop constraint if exists %I', p_table, v_name);
  if p_on_delete = 'set null' then
    execute format('update public.%I t set %I = null where %I is not null and not exists (select 1 from public.%I r where r.id = t.%I)',
      p_table, p_col, p_col, p_ref, p_col);
  end if;
  execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s',
    p_table, v_name, p_col, p_ref, p_on_delete);
end;
$$;

-- Пользователь Auth текущего запроса. auth.uid() есть только в Supabase; в self-hosted — sub из request.jwt.*.
do $do$
begin
  if to_regprocedure('auth.uid()') is not null then
    execute $f$create or replace function public.current_auth_uid() returns text
      language sql stable set search_path = public, pg_temp
      as 'select auth.uid()::text'$f$;
  else
    execute $f$create or replace function public.current_auth_uid() returns text
      language sql stable set search_path = public, pg_temp
      as $b$select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')$b$$f$;
  end if;
end $do$;

-- Роли PostgREST: их сессионным настройкам app.* не доверяем.
-- current_user внутри SECURITY DEFINER — владелец функции, поэтому дополнительно смотрим настройку role:
-- PostgREST делает SET LOCAL ROLE anon|authenticated, и это значение видно и внутри definer-функций.
create or replace function public.is_api_role()
returns boolean language sql stable
set search_path = public, pg_temp
as $$
  select current_user in ('anon', 'authenticated')
      or coalesce(current_setting('role', true), '') in ('anon', 'authenticated');
$$;

-- super_admins (ТЗ §4.13) создаётся здесь: на неё ссылается is_super_admin().
-- auth_user_id text: uuid Supabase Auth или id Better Auth. FK на "user" нет — таблиц Better Auth в схеме нет.
create table if not exists super_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  auth_user_id text not null unique,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ТЗ §4.49. Super admin: app.role доверенного соединения или запись в super_admins для пользователя Auth.
create or replace function public.is_super_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select (not public.is_api_role() and current_setting('app.role', true) = 'super_admin')
      or exists (select 1 from public.super_admins sa where sa.auth_user_id = public.current_auth_uid());
$$;

-- ТЗ §4.49. Бизнес текущего запроса (self-hosted). Для ролей PostgREST — всегда null.
create or replace function public.current_business()
returns uuid language sql stable
set search_path = public, pg_temp
as $$
  select case when public.is_api_role() then null
              else nullif(current_setting('app.business_id', true), '')::uuid end;
$$;

-- ТЗ §4.49. Анонимный посетитель: роль anon PostgREST или app.role = 'anon'.
create or replace function public.is_anon()
returns boolean language sql stable
set search_path = public, pg_temp
as $$
  select current_user = 'anon' or coalesce(current_setting('role', true), '') = 'anon'
      or (not public.is_api_role() and current_setting('app.role', true) = 'anon');
$$;

-- Состоит ли пользователь Auth в бизнесе b. Только пара business_id + auth uid → чужой бизнес недоступен.
create or replace function public.is_business_member(b uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users au
    where au.business_id = b and au.auth_user_id::text = public.current_auth_uid()
  );
$$;

-- Все бизнесы, доступные запросу: current_business() + членство. В политиках: business_id in (select …) —
-- вычисляется один раз на запрос (hashed subplan), а не на каждую строку.
create or replace function public.accessible_business_ids()
returns setof uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.current_business() where public.current_business() is not null
  union
  select au.business_id from public.admin_users au where au.auth_user_id::text = public.current_auth_uid();
$$;

-- Бизнесы, где пользователь — владелец (управление командой и приглашениями).
create or replace function public.owned_business_ids()
returns setof uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.current_business() where public.current_business() is not null
  union
  select au.business_id from public.admin_users au
  where au.auth_user_id::text = public.current_auth_uid() and au.role = 'owner';
$$;

-- Публичные (status = 'client') бизнесы — для anon-чтения услуг, фото, выходных.
create or replace function public.public_business_ids()
returns setof uuid language sql stable security definer
set search_path = public, pg_temp
as $$ select b.id from public.businesses b where b.status = 'client'; $$;

-- Диапазон брони. timestamptz + interval в общем случае STABLE (зависит от TimeZone для дней/месяцев),
-- но интервал только из минут от часового пояса не зависит → IMMUTABLE корректно; нужно для EXCLUDE.
create or replace function public.booking_range(p_start timestamptz, p_minutes int)
returns tstzrange language sql immutable parallel safe
set search_path = public, pg_temp
as $$ select tstzrange(p_start, p_start + make_interval(mins => greatest(coalesce(p_minutes, 60), 1)), '[)'); $$;

-- ===== 2. Недостающие колонки существующих таблиц (ТЗ §4.5–§4.46) =====

alter table vertical_templates add column if not exists updated_at timestamptz not null default now();

alter table businesses
  add column if not exists timezone text not null default 'Europe/Moscow',
  add column if not exists max_reschedules int not null default 1,
  add column if not exists generation_status text not null default 'pending',
  add column if not exists generation_error text,
  add column if not exists generation_attempts int not null default 0,
  add column if not exists updated_at timestamptz not null default now();
alter table businesses alter column socials set default '{}'::jsonb;
alter table businesses alter column custom_texts set default '{}'::jsonb;
alter table businesses alter column custom_blocks set default '[]'::jsonb;
-- working_hours намеренно без default: кабинет считает «часы заполнены» по Boolean(working_hours).

alter table services
  add column if not exists buffer_before int not null default 0,
  add column if not exists buffer_after int not null default 0,
  add column if not exists category text,
  add column if not exists max_clients int not null default 1,
  add column if not exists is_online boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table photos
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists mime_type text,
  add column if not exists size_bytes int,
  add column if not exists is_main boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

alter table bookings
  add column if not exists client_telegram_chat_id text,
  add column if not exists duration_at_booking int,
  add column if not exists price_at_booking numeric(10,2),
  add column if not exists timezone text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists rescheduled_from uuid,
  add column if not exists rescheduled_to uuid,
  add column if not exists reschedule_count int not null default 0,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists admin_comment text,
  add column if not exists source text not null default 'site',
  add column if not exists updated_at timestamptz not null default now();

alter table admin_users
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists status text not null default 'active',
  add column if not exists invited_by uuid,
  add column if not exists invited_at timestamptz,
  add column if not exists last_login timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- body (код) остаётся основным полем; body_text/body_html/variables — по ТЗ §4.14 для новых шаблонов.
alter table templates
  add column if not exists type text,
  add column if not exists vertical_template_id uuid,
  add column if not exists body_text text,
  add column if not exists body_html text,
  add column if not exists variables jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table email_accounts
  add column if not exists from_name text,
  add column if not exists reply_to text,
  add column if not exists smtp_secure text not null default 'tls',
  add column if not exists imap_secure text not null default 'tls',
  add column if not exists imap_user text,
  add column if not exists imap_pass_encrypted text,
  add column if not exists last_error text,
  add column if not exists last_checked_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table emails_outgoing
  add column if not exists booking_id uuid,
  add column if not exists message_id text,
  add column if not exists email_account_id uuid,
  add column if not exists error text,
  add column if not exists created_at timestamptz not null default now();

alter table emails_incoming
  add column if not exists body_html text,
  add column if not exists message_id text,
  add column if not exists in_reply_to text,
  add column if not exists "references" text,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists email_account_id uuid,
  add column if not exists created_at timestamptz not null default now();

alter table outreach_log
  add column if not exists subject text,
  add column if not exists error text,
  add column if not exists retry_count int not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table licenses
  add column if not exists last_ping_at timestamptz,
  add column if not exists last_ping_domain text,
  add column if not exists last_ping_ip text,
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table business_telegram_codes
  add column if not exists expires_at timestamptz not null default now() + interval '15 minutes';

alter table business_requisites
  add column if not exists bank_name text,
  add column if not exists bank_account text,
  add column if not exists card_number text,
  add column if not exists sbp_phone text;

alter table feature_flags add column if not exists updated_at timestamptz not null default now();

-- settings.value NOT NULL по ТЗ §4.34; null-значения заменяются пустым объектом.
update settings set value = '{}'::jsonb where value is null;
alter table settings alter column value set default '{}'::jsonb;
alter table settings alter column value set not null;
alter table pricing_plans alter column features set default '[]'::jsonb;

-- Деньги: numeric(10,2) (до 99 999 999.99 ₽). Повторный прогон — no-op (тип уже совпадает).
do $$
declare
  v record;
begin
  for v in select * from (values ('services', 'price'), ('businesses', 'subscription_price'),
      ('promo_codes', 'discount_value'), ('pricing_plans', 'price_monthly'), ('pricing_plans', 'price_yearly')) t(tbl, col)
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v.tbl
               and column_name = v.col and (numeric_precision is distinct from 10 or numeric_scale is distinct from 2)) then
      execute format('alter table public.%I alter column %I type numeric(10,2)', v.tbl, v.col);
    end if;
  end loop;
end $$;

-- ===== 3. Недостающие таблицы ТЗ 4.0 §4 (app_logs, analytics_events — в 0006) =====

create table if not exists business_holidays (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (business_id, date)
);

create table if not exists admin_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  role text not null default 'manager' check (role in ('owner', 'manager')),
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists templates_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  version int not null,
  subject text,
  body_text text,
  body_html text,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table if not exists email_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  template_id uuid references templates(id) on delete set null,
  email_account_id uuid references email_accounts(id) on delete set null,
  to_email text not null,
  subject text not null,
  body_text text,
  body_html text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  retry_count int not null default 0,
  max_retries int not null default 3,
  next_retry_at timestamptz not null default now(),
  error text,
  sent_at timestamptz,
  message_id text,
  in_reply_to text,
  "references" text,
  tracking_token uuid unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_bounces (
  id uuid primary key default gen_random_uuid(),
  email_account_id uuid references email_accounts(id) on delete set null,
  original_message_id text,
  bounced_email text,
  bounce_type text check (bounce_type is null or bounce_type in ('hard', 'soft', 'complaint')),
  reason text,
  raw text,
  received_at timestamptz not null default now()
);

create table if not exists email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_incoming_id uuid not null references emails_incoming(id) on delete cascade,
  filename text,
  mime_type text,
  size_bytes int,
  minio_path text,
  created_at timestamptz not null default now()
);

create table if not exists unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  token uuid not null unique default gen_random_uuid(),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists imap_state (
  email_account_id uuid primary key references email_accounts(id) on delete cascade,
  uidvalidity bigint not null,
  uidnext bigint not null default 1,
  last_check_at timestamptz
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  type text not null check (type in ('initial_5000', 'subscription', 'code_buyout', 'other')),
  period_start date,
  period_end date,
  paid_at timestamptz not null default now(),
  note text,
  receipt_url text,
  receipt_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  amount numeric(10,2),
  receipt_url text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists code_archives (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  zip_path text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists telegram_messages (
  id bigserial primary key,
  direction text not null check (direction in ('in', 'out')),
  chat_id text,
  business_id uuid references businesses(id) on delete set null,
  message_id text,
  text text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  type text not null,
  channel text not null check (channel in ('email', 'telegram', 'sms', 'push')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_id text not null unique,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('generate_prototypes', 'import_excel', 'backup', 'export_zip', 'export_business_data')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  result jsonb,
  error text,
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists job_locks (
  job_id uuid primary key references jobs(id) on delete cascade,
  worker_id text,
  heartbeat_at timestamptz
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text, phone text, email text, message text, source text,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'refused')),
  telegram_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- business_id без FK (ТЗ): запрос субъекта ПД переживает удаление бизнеса (ФЗ-152, срок ответа).
create table if not exists data_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  type text not null check (type in ('access', 'delete', 'correct')),
  business_id uuid,
  request_text text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'rejected')),
  processed_by text,
  response_text text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  email text, subject text, message text,
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cookie_consents (
  id uuid primary key default gen_random_uuid(),
  ip_hash text, ua_hash text,
  accepted boolean not null,
  policy_version text,
  created_at timestamptz not null default now()
);

create table if not exists slug_locks (
  slug text primary key,
  business_id uuid references businesses(id) on delete cascade,
  locked_at timestamptz not null default now()
);

-- ===== 4. FK с явным ON DELETE, CHECK-и =====
select public.ensure_fk('businesses', 'vertical_template_id', 'vertical_templates', 'set null');
select public.ensure_fk('outreach_log', 'email_account_id', 'email_accounts', 'set null');
select public.ensure_fk('templates', 'vertical_template_id', 'vertical_templates', 'set null');
select public.ensure_fk('emails_outgoing', 'booking_id', 'bookings', 'set null');
select public.ensure_fk('emails_outgoing', 'email_account_id', 'email_accounts', 'set null');
select public.ensure_fk('emails_incoming', 'email_account_id', 'email_accounts', 'set null');
select public.ensure_fk('bookings', 'rescheduled_from', 'bookings', 'set null');
select public.ensure_fk('bookings', 'rescheduled_to', 'bookings', 'set null');
select public.ensure_fk('admin_users', 'invited_by', 'admin_users', 'set null');

-- Статусы броней: 'done' — код (кабинет), 'completed' — ТЗ §4.10. Разрешены оба.
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in ('new', 'confirmed', 'cancelled', 'done', 'completed', 'no_show'));

select public.ensure_check('businesses', 'businesses_slug_format', $c$slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60$c$);
select public.ensure_check('businesses', 'businesses_brand_color_hex', $c$brand_color ~ '^#[0-9A-Fa-f]{6}$'$c$);
select public.ensure_check('businesses', 'businesses_ssl_status_check', $c$ssl_status in ('pending', 'active', 'error')$c$);
select public.ensure_check('businesses', 'businesses_generation_status_check', $c$generation_status in ('pending', 'running', 'done', 'failed')$c$);
select public.ensure_check('businesses', 'businesses_booking_rules_check',
  'slot_step_minutes between 5 and 1440 and cancel_hours_before >= 0 and min_hours_before >= 0 and max_days_ahead between 1 and 365 and max_reschedules >= 0');
select public.ensure_check('businesses', 'businesses_rating_check', 'rating is null or rating between 0 and 5');
select public.ensure_check('services', 'services_values_check',
  'price >= 0 and duration_minutes between 5 and 1440 and buffer_before >= 0 and buffer_after >= 0 and max_clients >= 1');
select public.ensure_check('vertical_templates', 'vertical_templates_url_prefix_format', $c$url_prefix ~ '^[a-z]{1,4}$'$c$);
select public.ensure_check('bookings', 'bookings_cancelled_by_check', $c$cancelled_by is null or cancelled_by in ('client', 'business', 'admin', 'system')$c$);
select public.ensure_check('bookings', 'bookings_source_check', $c$source in ('site', 'panel', 'telegram', 'phone', 'import')$c$);
select public.ensure_check('admin_users', 'admin_users_status_check', $c$status in ('active', 'invited', 'disabled')$c$);
select public.ensure_check('licenses', 'licenses_status_check', $c$status in ('active', 'unverified', 'unknown', 'blocked')$c$);
select public.ensure_check('outreach_log', 'outreach_log_status_check', $c$status is null or status in ('queued', 'sent', 'skipped', 'failed')$c$);
select public.ensure_check('email_accounts', 'email_accounts_limits_check', 'daily_limit >= 0 and sent_today >= 0');

-- ===== 5. Брони: снимок длительности/цены/часового пояса и запрет пересечений (ТЗ §4.10, §10.2) =====
-- Код их не передаёт → заполняет триггер: из услуги (60 мин, если услуга не найдена) и бизнеса.
create or replace function public.bookings_fill_snapshot()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.duration_at_booking is null or (tg_op = 'UPDATE' and new.service_id is distinct from old.service_id) then
    select s.duration_minutes, s.price into new.duration_at_booking, new.price_at_booking
    from public.services s where s.id = new.service_id;
    new.duration_at_booking := coalesce(new.duration_at_booking, 60);
  end if;
  if new.timezone is null then
    select b.timezone into new.timezone from public.businesses b where b.id = new.business_id;
    new.timezone := coalesce(new.timezone, 'Europe/Moscow');
  end if;
  if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
  if new.status in ('done', 'completed') and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists trg_bookings_fill on bookings;
create trigger trg_bookings_fill before insert or update on bookings
  for each row execute function public.bookings_fill_snapshot();

update bookings bk set duration_at_booking = coalesce(s.duration_minutes, 60), price_at_booking = coalesce(bk.price_at_booking, s.price)
  from (select b2.id, sv.duration_minutes, sv.price from bookings b2 left join services sv on sv.id = b2.service_id) s
  where s.id = bk.id and bk.duration_at_booking is null;
update bookings bk set timezone = coalesce(b.timezone, 'Europe/Moscow')
  from businesses b where b.id = bk.business_id and bk.timezone is null;
alter table bookings alter column duration_at_booking set not null;
alter table bookings alter column timezone set not null;
select public.ensure_check('bookings', 'bookings_duration_check', 'duration_at_booking between 1 and 1440');

-- Код ловит 23505 (bookings_slot_unique), exclusion даёт 23P01 — правка в зоне броней (notes.md).
-- Если в данных уже есть пересечения активных броней — constraint не ставится, предупреждение.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'bookings_no_overlap') then
    return;
  end if;
  if exists (
    select 1 from bookings a join bookings b on a.business_id = b.business_id and a.id < b.id
    where a.status in ('new', 'confirmed') and b.status in ('new', 'confirmed')
      and public.booking_range(a.scheduled_at, a.duration_at_booking) && public.booking_range(b.scheduled_at, b.duration_at_booking)
  ) then
    raise warning 'bookings_no_overlap не создан: есть пересекающиеся активные брони, разберите вручную (db-check покажет)';
    return;
  end if;
  alter table bookings add constraint bookings_no_overlap exclude using gist (
    business_id with =, public.booking_range(scheduled_at, duration_at_booking) with &&
  ) where (status in ('new', 'confirmed'));
end $$;

-- ===== 6. Индексы новых таблиц и колонок (ТЗ §4.51: все FK проиндексированы) =====
create index if not exists idx_holidays_business on business_holidays (business_id, date);
create index if not exists idx_admin_invites_business on admin_invites (business_id);
create index if not exists idx_admin_invites_created_by on admin_invites (created_by);
create index if not exists idx_admin_users_invited_by on admin_users (invited_by);
create index if not exists idx_templates_vertical on templates (vertical_template_id);
create index if not exists idx_email_queue_status on email_queue (status, next_retry_at) where status in ('pending', 'failed');
create index if not exists idx_email_queue_business on email_queue (business_id);
create index if not exists idx_email_queue_booking on email_queue (booking_id);
create index if not exists idx_email_queue_template on email_queue (template_id);
create index if not exists idx_email_queue_account on email_queue (email_account_id);
create index if not exists idx_emails_outgoing_message on emails_outgoing (message_id);
create index if not exists idx_emails_outgoing_booking on emails_outgoing (booking_id);
create index if not exists idx_emails_outgoing_account on emails_outgoing (email_account_id);
create unique index if not exists idx_emails_incoming_message on emails_incoming (message_id);
create index if not exists idx_emails_incoming_in_reply on emails_incoming (in_reply_to);
create index if not exists idx_emails_incoming_account on emails_incoming (email_account_id);
create index if not exists idx_email_accounts_active on email_accounts (active, sent_today);
create index if not exists idx_email_bounces_email on email_bounces (bounced_email);
create index if not exists idx_email_bounces_account on email_bounces (email_account_id);
create index if not exists idx_email_attachments_incoming on email_attachments (email_incoming_id);
create index if not exists idx_payments_business on payments (business_id, paid_at desc);
create index if not exists idx_receipts_business on receipts (business_id);
create index if not exists idx_receipts_payment on receipts (payment_id);
create index if not exists idx_code_archives_business on code_archives (business_id);
create index if not exists idx_telegram_messages_chat on telegram_messages (chat_id);
create index if not exists idx_telegram_messages_business on telegram_messages (business_id);
create index if not exists idx_notifications_business on notifications (business_id);
create index if not exists idx_notifications_status on notifications (status) where status = 'pending';
create index if not exists idx_webhook_events_source on webhook_events (source, processed_at);
create index if not exists idx_jobs_status on jobs (status, type);
create index if not exists idx_jobs_locked on jobs (locked_by, heartbeat_at);
create index if not exists idx_data_requests_status on data_requests (status);
create index if not exists idx_support_tickets_business on support_tickets (business_id);
create index if not exists idx_cookie_consents_created on cookie_consents (created_at);
create index if not exists idx_slug_locks_business on slug_locks (business_id);
create index if not exists idx_bookings_rescheduled_from on bookings (rescheduled_from) where rescheduled_from is not null;
create index if not exists idx_bookings_rescheduled_to on bookings (rescheduled_to) where rescheduled_to is not null;
create index if not exists idx_licenses_status on licenses (status);

-- ===== 7. Триггеры updated_at: на каждой таблице public с колонкой updated_at =====
do $$
declare
  v_tbl text;
begin
  for v_tbl in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || v_tbl || '_upd', v_tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'trg_' || v_tbl || '_upd', v_tbl);
  end loop;
end $$;

-- ===== 8. RLS: включить везде, снять старые политики 0001 =====
do $$
declare
  v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', v.relname);
  end loop;
  for v in select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', v.policyname, v.tablename);
  end loop;
end $$;

-- Политики через (select fn()) — initPlan: функция считается один раз на запрос, а не на строку.
-- businesses (§4.49): anon — только клиентские сайты; member — свои; super_admin — все.
create policy p_businesses_sel on businesses for select using (
  (select public.is_super_admin()) or id in (select public.accessible_business_ids())
  or (status = 'client' and (select public.is_anon())));
create policy p_businesses_ins on businesses for insert with check ((select public.is_super_admin()));
create policy p_businesses_upd on businesses for update
  using ((select public.is_super_admin()) or id in (select public.accessible_business_ids()))
  with check ((select public.is_super_admin()) or id in (select public.accessible_business_ids()));
create policy p_businesses_del on businesses for delete using ((select public.is_super_admin()));

create policy p_vertical_templates_sel on vertical_templates for select using (is_active or (select public.is_super_admin()));
create policy p_vertical_templates_admin on vertical_templates for all
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- Tenant-таблицы. p_mode: public_read — anon видит записи клиентских бизнесов; member_write — владелец/менеджер
-- пишет; owner_write — пишет только владелец; server_write — пишет только super_admin/доверенный сервер.
do $$
declare
  v record;
  v_read text;
  v_write text;
  v_admin text := '(select public.is_super_admin())';
begin
  for v in select * from (values
      ('services', 'public_read', 'member'), ('photos', 'public_read', 'member'),
      ('business_holidays', 'public_read', 'member'), ('bookings', 'private', 'member'),
      ('admin_users', 'private', 'owner'), ('admin_invites', 'private', 'owner'),
      ('business_requisites', 'private', 'owner'), ('notifications', 'private', 'server'),
      ('code_archives', 'private', 'server'), ('business_telegram_codes', 'private', 'member'),
      ('payments', 'private', 'server'), ('receipts', 'private', 'server')) t(tbl, read_mode, write_mode)
  loop
    v_read := format('%s or business_id in (select public.accessible_business_ids())', v_admin);
    if v.read_mode = 'public_read' then
      v_read := v_read || ' or business_id in (select public.public_business_ids())';
    end if;
    v_write := case v.write_mode
      when 'member' then format('%s or business_id in (select public.accessible_business_ids())', v_admin)
      when 'owner' then format('%s or business_id in (select public.owned_business_ids())', v_admin)
      else format('%s or business_id = (select public.current_business())', v_admin) end;
    execute format('create policy %I on public.%I for select using (%s)', 'p_' || v.tbl || '_sel', v.tbl, v_read);
    execute format('create policy %I on public.%I for insert with check (%s)', 'p_' || v.tbl || '_ins', v.tbl, v_write);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', 'p_' || v.tbl || '_upd', v.tbl, v_write, v_write);
    execute format('create policy %I on public.%I for delete using (%s)', 'p_' || v.tbl || '_del', v.tbl, v_write);
  end loop;
end $$;

-- Сотрудник видит свою запись admin_users (вход в кабинет), даже если бизнес ещё не выбран.
create policy p_admin_users_self on admin_users for select using (auth_user_id::text = (select public.current_auth_uid()));

-- Публичная запись (§10.3): только новая бронь клиентского бизнеса, без служебных полей.
create policy p_bookings_anon_ins on bookings for insert with check (
  (select public.is_anon()) and business_id in (select public.public_business_ids())
  and status in ('new', 'confirmed') and cancelled_at is null and reminder_24h_sent_at is null
  and reminder_2h_sent_at is null and reschedule_count = 0 and privacy_accepted_at is not null);

-- Только super_admin (§4.49), включая партиционированные журналы.
do $$
declare
  v_tbl text;
begin
  foreach v_tbl in array array['super_admins', 'email_accounts', 'email_queue', 'emails_outgoing', 'emails_incoming',
      'email_bounces', 'email_attachments', 'unsubscribes', 'imap_state', 'licenses', 'license_pings',
      'telegram_messages', 'webhook_events', 'settings', 'feature_flags', 'audit_log', 'app_logs', 'jobs',
      'job_locks', 'slug_locks', 'promo_codes', 'pricing_plans', 'templates', 'templates_versions',
      'outreach_log', 'rate_limits', 'legacy_redirects']
  loop
    execute format('create policy %I on public.%I for all using ((select public.is_super_admin())) with check ((select public.is_super_admin()))',
      'p_' || v_tbl || '_all', v_tbl);
  end loop;
  -- Формы с публичного сайта (§4.49): вставка всем, чтение super_admin. Статус при вставке — только начальный.
  foreach v_tbl in array array['analytics_events', 'cookie_consents', 'leads', 'data_requests', 'support_tickets']
  loop
    execute format('create policy %I on public.%I for insert with check (%s)', 'p_' || v_tbl || '_ins', v_tbl,
      case v_tbl when 'leads' then $c$status = 'new'$c$ when 'data_requests' then $c$status = 'new'$c$
                 when 'support_tickets' then $c$status = 'open' and assigned_to is null$c$ else 'true' end);
    execute format('create policy %I on public.%I for select using ((select public.is_super_admin()))', 'p_' || v_tbl || '_sel', v_tbl);
    execute format('create policy %I on public.%I for update using ((select public.is_super_admin())) with check ((select public.is_super_admin()))',
      'p_' || v_tbl || '_upd', v_tbl);
    execute format('create policy %I on public.%I for delete using ((select public.is_super_admin()))', 'p_' || v_tbl || '_del', v_tbl);
  end loop;
end $$;

-- Партиции: прямой доступ — только super_admin. secure_partition() (0006) теперь видит is_super_admin() и ставит политику.
select public.secure_partition(c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relispartition and c.relkind in ('r', 'p');

-- ===== 9. Права ролей PostgREST: минимум (RLS — второй рубеж) =====
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      continue;
    end if;
    execute format('revoke all on all tables in schema public from %I', v_role);
    execute format('revoke all on all sequences in schema public from %I', v_role);
    -- Публичные данные сайтов и формы.
    execute format('grant select on vertical_templates, services, photos, business_holidays to %I', v_role);
    execute format('grant insert on analytics_events, cookie_consents, leads, data_requests, support_tickets to %I', v_role);
    execute format('grant usage on sequence analytics_events_id_seq to %I', v_role);
    -- Бронь: только колонки формы записи (без статусов отмены, напоминаний, admin_comment).
    execute format('grant insert (business_id, client_name, client_phone, client_email, client_telegram, service_id, scheduled_at, comment, status, custom_fields, privacy_accepted_at, privacy_ip, privacy_version) on bookings to %I', v_role);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- anon: только публичные колонки бизнеса (без notes, reply_text, preview_token, telegram_chat_id, oferta_ip, биллинга).
    grant select (id, slug, slug_history, name, description, vertical_template_id, category, address, city, region,
      postal_code, lat, lng, timezone, working_hours, slot_step_minutes, cancel_hours_before, min_hours_before,
      max_days_ahead, max_reschedules, auto_confirm, phones, emails, websites, socials, rating, reviews_count,
      logo_url, favicon_url, brand_color, status, custom_domain, custom_texts, custom_blocks) on businesses to anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on businesses, bookings, admin_users, admin_invites, business_requisites, notifications,
      code_archives, business_telegram_codes, payments, receipts to authenticated;
    grant insert, update, delete on services, photos, business_holidays, business_telegram_codes to authenticated;
    -- Владелец меняет только настройки сайта, не статус/биллинг/домен/лицензию.
    grant update (name, description, address, city, phones, emails, websites, socials, brand_color, logo_url, favicon_url,
      timezone, working_hours, slot_step_minutes, cancel_hours_before, min_hours_before, max_days_ahead, max_reschedules,
      auto_confirm, custom_texts, custom_blocks, onboarding_completed_at) on businesses to authenticated;
    grant update (status, cancelled_at, cancelled_by, confirmed_at, completed_at, admin_comment) on bookings to authenticated;
    grant insert, update, delete on admin_invites, business_requisites to authenticated;
  end if;
end $$;

-- ===== 10. Права на функции =====
revoke all on function public.ensure_check(text, text, text) from public;
revoke all on function public.ensure_fk(text, text, text, text) from public;
revoke all on function public.secure_partition(text) from public;
revoke all on function public.bookings_fill_snapshot() from public;
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.ensure_check(text, text, text) from %I', v_role);
      execute format('revoke all on function public.ensure_fk(text, text, text, text) from %I', v_role);
      execute format('revoke all on function public.secure_partition(text) from %I', v_role);
      -- Хелперы нужны политикам: вызываются с правами вызывающего.
      execute format('grant execute on function public.is_super_admin(), public.current_business(), public.is_anon(), public.is_api_role(), public.current_auth_uid(), public.is_business_member(uuid), public.accessible_business_ids(), public.owned_business_ids(), public.public_business_ids(), public.booking_range(timestamptz, int) to %I', v_role);
    end if;
  end loop;
end $$;

comment on function public.is_super_admin() is 'RLS §4.49: app.role=super_admin доверенного соединения или пользователь Auth из super_admins.';
comment on function public.current_business() is 'RLS §4.49: app.business_id доверенного соединения; для anon/authenticated — null.';
comment on function public.is_anon() is 'RLS §4.49: роль anon PostgREST или app.role=anon доверенного соединения.';
comment on function public.accessible_business_ids() is 'Бизнесы запроса: current_business() + членство в admin_users. Для политик: business_id in (select …).';
comment on constraint bookings_status_check on bookings is 'done — код кабинета, completed — ТЗ §4.10; оба означают «услуга оказана».';

commit;
