-- 0006_partitions.sql — партиционирование журналов по месяцам (ТЗ 4.0 §4.28, §4.36, §4.37, §4.40, §4.50).
--
-- Зачем: audit_log, license_pings, app_logs, analytics_events растут без ограничений. Месячные RANGE-партиции
-- дают дешёвый retention (DROP партиции вместо DELETE миллионов строк, без bloat и vacuum) и partition pruning
-- для запросов «последние N записей / за период».
--
-- Как запускается:
--   ▸ при применении миграции — один раз: конвертация существующих audit_log и license_pings
--     (данные переносятся), создание app_logs и analytics_events, партиции на текущий месяц + 3 вперёд;
--   ▸ далее по расписанию (pg_cron, зона агента 2):
--       select public.create_monthly_partitions();   -- раз в месяц (или ежедневно — идемпотентно)
--       select public.drop_old_partitions();         -- ежедневно; retention по ТЗ §4.50
--
-- Retention (месяцев хранения, считая от начала текущего месяца):
--   audit_log 12, analytics_events 6, license_pings 6, app_logs 1 (ТЗ: 30 дней; точная очистка до дня — cron агента 2).
--
-- Страховка: у каждой таблицы есть DEFAULT-партиция. Если cron не создал партицию вовремя, вставка не упадёт,
-- строка попадёт в DEFAULT; create_monthly_partitions() затем перенесёт такие строки в нужную партицию.
--
-- Безопасность: партиции — самостоятельные таблицы. RLS родителя на прямой доступ к партиции не действует,
-- поэтому на каждой партиции включается RLS и отзываются права anon/authenticated.
--
-- Идемпотентно: повторный запуск ничего не ломает и не дублирует.
begin;

-- ===== Служебные функции =====

-- Retention по умолчанию (ТЗ §4.50). null — таблица не управляется.
create or replace function public.partition_retention_months(p_table text)
returns int
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_table
    when 'audit_log' then 12
    when 'analytics_events' then 6
    when 'license_pings' then 6
    when 'app_logs' then 1
  end;
$$;

-- Закрывает прямой доступ к партиции: RLS включён, права anon/authenticated отозваны.
-- Если хелпер is_super_admin() уже есть (0007) — явная политика «только super_admin», чтобы не было «RLS без политик».
create or replace function public.secure_partition(p_partition text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  execute format('alter table public.%I enable row level security', p_partition);
  if to_regprocedure('public.is_super_admin()') is not null then
    execute format('drop policy if exists p_partition_admin on public.%I', p_partition);
    execute format('create policy p_partition_admin on public.%I for all using ((select public.is_super_admin())) with check ((select public.is_super_admin()))', p_partition);
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute format('revoke all on table public.%I from anon', p_partition);
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute format('revoke all on table public.%I from authenticated', p_partition);
  end if;
end;
$$;

-- Создаёт месячную партицию [p_month, p_month + 1 месяц) для p_table, если её нет.
-- Строки этого диапазона, попавшие в DEFAULT-партицию, переносятся в новую партицию.
create or replace function public.ensure_month_partition(p_table text, p_key text, p_month date)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_from timestamptz := date_trunc('month', p_month::timestamp)::timestamptz;
  v_to timestamptz := (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz;
  v_name text := format('%s_%s', p_table, to_char(p_month, 'YYYY_MM'));
  v_default text := p_table || '_default';
  v_moved bigint := 0;
begin
  if to_regclass(format('public.%I', v_name)) is not null then
    return false;
  end if;

  -- Отдельная таблица той же структуры: в неё переносим строки из DEFAULT, потом подключаем как партицию.
  execute format('create table public.%I (like public.%I including defaults including constraints)', v_name, p_table);

  if to_regclass(format('public.%I', v_default)) is not null then
    execute format(
      'with moved as (delete from public.%I where %I >= $1 and %I < $2 returning *) insert into public.%I select * from moved',
      v_default, p_key, p_key, v_name)
      using v_from, v_to;
    get diagnostics v_moved = row_count;
  end if;

  execute format('alter table public.%I attach partition public.%I for values from (%L) to (%L)',
    p_table, v_name, v_from, v_to);
  perform public.secure_partition(v_name);

  if v_moved > 0 then
    raise notice '%: перенесено из DEFAULT % строк', v_name, v_moved;
  end if;
  return true;
end;
$$;

-- Создаёт партиции на текущий месяц и p_months_ahead месяцев вперёд для всех 4 журналов.
-- Возвращает число созданных партиций. Запускать по cron раз в месяц (идемпотентно — можно чаще).
create or replace function public.create_monthly_partitions(p_months_ahead int default 3)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_created int := 0;
  v_tbl record;
  v_month date;
begin
  for v_tbl in
    select * from (values
      ('audit_log', 'created_at'),
      ('app_logs', 'created_at'),
      ('analytics_events', 'created_at'),
      ('license_pings', 'pinged_at')
    ) as t(tbl, key_col)
  loop
    if to_regclass(format('public.%I', v_tbl.tbl)) is null then
      continue;
    end if;
    for i in 0..p_months_ahead loop
      v_month := (date_trunc('month', now()) + make_interval(months => i))::date;
      if public.ensure_month_partition(v_tbl.tbl, v_tbl.key_col, v_month) then
        v_created := v_created + 1;
      end if;
    end loop;
  end loop;
  return v_created;
end;
$$;

-- Удаляет месячные партиции p_table, целиком лежащие раньше, чем (начало текущего месяца − p_months_to_keep).
-- Пример: app_logs, 1 месяц, сегодня 16.10 → хранятся сентябрь и октябрь, август и раньше удаляются.
-- DEFAULT-партиция не удаляется никогда. Возвращает число удалённых партиций.
create or replace function public.drop_old_partitions(p_table text, p_months_to_keep int)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz;
  v_part record;
  v_dropped int := 0;
begin
  if p_months_to_keep is null or p_months_to_keep < 1 then
    raise exception 'drop_old_partitions: months_to_keep должен быть >= 1, получено %', p_months_to_keep;
  end if;
  v_cutoff := (date_trunc('month', now()) - make_interval(months => p_months_to_keep))::timestamptz;

  for v_part in
    select c.relname,
           -- верхняя граница из выражения партиции: FOR VALUES FROM ('…') TO ('…')
           (regexp_match(pg_get_expr(c.relpartbound, c.oid), 'TO \(''([^'']+)''\)'))[1]::timestamptz as upper_bound
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    join pg_namespace n on n.oid = p.relnamespace
    where n.nspname = 'public' and p.relname = p_table
      and pg_get_expr(c.relpartbound, c.oid) <> 'DEFAULT'
  loop
    if v_part.upper_bound is not null and v_part.upper_bound <= v_cutoff then
      execute format('drop table if exists public.%I', v_part.relname);
      v_dropped := v_dropped + 1;
    end if;
  end loop;
  return v_dropped;
end;
$$;

-- Retention для всех 4 журналов по ТЗ §4.50. Запускать по cron ежедневно.
create or replace function public.drop_old_partitions()
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_total int := 0;
  v_tbl text;
begin
  foreach v_tbl in array array['audit_log', 'app_logs', 'analytics_events', 'license_pings'] loop
    if to_regclass(format('public.%I', v_tbl)) is not null then
      v_total := v_total + public.drop_old_partitions(v_tbl, public.partition_retention_months(v_tbl));
    end if;
  end loop;
  return v_total;
end;
$$;

-- Партиционирована ли таблица.
create or replace function public.is_partitioned(p_table text)
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = p_table and c.relkind = 'p'
  );
$$;

-- Создаёт партиции под уже существующие данные legacy-таблицы (от месяца min(key) до текущего).
create or replace function public.ensure_partitions_for_range(p_table text, p_key text, p_from timestamptz)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_month date;
begin
  if p_from is null then
    return;
  end if;
  v_month := date_trunc('month', p_from)::date;
  while v_month <= date_trunc('month', now())::date loop
    perform public.ensure_month_partition(p_table, p_key, v_month);
    v_month := (v_month + interval '1 month')::date;
  end loop;
end;
$$;

-- ===== audit_log (ТЗ §4.36) =====
-- Было (0001): обычная таблица, id uuid. Стало: RANGE(created_at), id bigserial, PK (id, created_at),
-- добавлены business_id, ip, user_agent; user_id text (совместимо и с uuid Supabase Auth, и с text Better Auth).
-- action NOT NULL по ТЗ: код всегда передаёт action; старые null заменяются на 'unknown' при переносе.
do $$
declare
  v_min timestamptz;
begin
  if public.is_partitioned('audit_log') then
    return;
  end if;
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log rename to audit_log_legacy;
    -- имя PK освобождается для новой таблицы (audit_log_pkey)
    alter index if exists public.audit_log_pkey rename to audit_log_legacy_pkey;
  end if;

  create table public.audit_log (
    id bigserial,
    user_id text,
    business_id uuid,
    action text not null,
    entity text,
    entity_id uuid,
    payload jsonb not null default '{}'::jsonb,
    ip text,
    user_agent text,
    created_at timestamptz not null default now(),
    primary key (id, created_at)
  ) partition by range (created_at);
  create table public.audit_log_default partition of public.audit_log default;

  if to_regclass('public.audit_log_legacy') is not null then
    select min(created_at) into v_min from public.audit_log_legacy;
    perform public.ensure_partitions_for_range('audit_log', 'created_at', v_min);
    insert into public.audit_log (user_id, action, entity, entity_id, payload, created_at)
      select user_id::text, coalesce(action, 'unknown'), entity, entity_id, coalesce(payload, '{}'::jsonb), created_at
      from public.audit_log_legacy
      order by created_at;
    drop table public.audit_log_legacy;
  end if;
end $$;

comment on table public.audit_log is 'Журнал действий админок и ошибок (action like ''error:%''). Партиции по месяцам, хранение 12 мес (ТЗ §4.36, §4.50).';
comment on column public.audit_log.user_id is 'Кто сделал: id пользователя Auth (uuid Supabase или text Better Auth); null — система.';
comment on column public.audit_log.action is 'Код действия; префикс error: — ошибки (вкладка «Ошибки» /panel/logs).';

-- audit_log_created_idx из 0002 (при повторном прогоне 0002 создаётся уже на партиционированной таблице) дублирует индекс ниже.
drop index if exists public.audit_log_created_idx;
-- /panel/logs: order(created_at desc).limit(300) — вкладка «Аудит» (not like 'error:%').
create index if not exists idx_audit_log_created on public.audit_log (created_at desc);
-- /panel/logs: like('action','error:%') — префиксный поиск требует text_pattern_ops.
create index if not exists idx_audit_log_action on public.audit_log (action text_pattern_ops, created_at desc);
-- ТЗ §4.51.
create index if not exists idx_audit_log_business on public.audit_log (business_id, created_at);
create index if not exists idx_audit_log_entity on public.audit_log (entity, entity_id);
create index if not exists idx_audit_log_user on public.audit_log (user_id, created_at);

-- ===== license_pings (ТЗ §4.28) =====
-- Было (0001): обычная таблица, id uuid. Стало: RANGE(pinged_at), id bigserial, PK (id, pinged_at).
-- Колонка license_id сохранена (код: app/api/license/ping, /panel/licenses), в ТЗ — license_key.
-- FK на licenses не ставится: журнал должен переживать удаление лицензии, а неизвестные ключи тоже логируются.
do $$
declare
  v_min timestamptz;
begin
  if public.is_partitioned('license_pings') then
    return;
  end if;
  if to_regclass('public.license_pings') is not null then
    alter table public.license_pings rename to license_pings_legacy;
    -- имя PK освобождается для новой таблицы (license_pings_pkey)
    alter index if exists public.license_pings_pkey rename to license_pings_legacy_pkey;
  end if;

  create table public.license_pings (
    id bigserial,
    license_id uuid,
    domain text,
    version text,
    ip text,
    user_agent text,
    status text,
    pinged_at timestamptz not null default now(),
    primary key (id, pinged_at),
    constraint license_pings_status_check check (status is null or status in ('active', 'unverified', 'unknown', 'blocked'))
  ) partition by range (pinged_at);
  create table public.license_pings_default partition of public.license_pings default;

  if to_regclass('public.license_pings_legacy') is not null then
    select min(pinged_at) into v_min from public.license_pings_legacy;
    perform public.ensure_partitions_for_range('license_pings', 'pinged_at', v_min);
    insert into public.license_pings (license_id, domain, version, ip, user_agent, status, pinged_at)
      select license_id, domain, version, ip, user_agent,
             case when status in ('active', 'unverified', 'unknown', 'blocked') then status end,
             pinged_at
      from public.license_pings_legacy
      order by pinged_at;
    drop table public.license_pings_legacy;
  end if;
end $$;

comment on table public.license_pings is 'Пинги лицензий переданного кода (ТЗ §4.28). Партиции по месяцам, хранение 6 мес.';
comment on column public.license_pings.license_id is 'Ключ лицензии (licenses.license_id); null — неизвестный ключ. Без FK намеренно.';

-- /panel/licenses: order(pinged_at desc).limit(300).
create index if not exists idx_license_pings_pinged on public.license_pings (pinged_at desc);
-- История пингов конкретной лицензии.
create index if not exists idx_license_pings_license on public.license_pings (license_id, pinged_at desc);

-- ===== app_logs (ТЗ §4.37) =====
create table if not exists public.app_logs (
  id bigserial,
  level text not null default 'info',
  message text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (id, created_at),
  constraint app_logs_level_check check (level in ('trace', 'debug', 'info', 'warn', 'error', 'fatal'))
) partition by range (created_at);
do $$
begin
  if to_regclass('public.app_logs_default') is null then
    create table public.app_logs_default partition of public.app_logs default;
  end if;
end $$;

comment on table public.app_logs is 'Технические логи приложения (pino). Партиции по месяцам, хранение 30 дней (ТЗ §4.37, §4.50).';

-- ТЗ §4.51.
create index if not exists idx_app_logs_level on public.app_logs (level, created_at);

-- ===== analytics_events (ТЗ §4.40) =====
-- business_id без FK: события переживают удаление бизнеса (агрегированная статистика), PII нет (только хэши).
create table if not exists public.analytics_events (
  id bigserial,
  business_id uuid,
  event text not null,
  path text,
  ip_hash text,
  ua_hash text,
  referrer text,
  session_id text,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
do $$
begin
  if to_regclass('public.analytics_events_default') is null then
    create table public.analytics_events_default partition of public.analytics_events default;
  end if;
end $$;

comment on table public.analytics_events is 'События аналитики сайтов (просмотры, клики записи). Партиции по месяцам, хранение 6 мес (ТЗ §4.40, §4.50).';

-- ТЗ §4.51.
create index if not exists idx_analytics_business on public.analytics_events (business_id, created_at);
create index if not exists idx_analytics_event on public.analytics_events (event, created_at);

-- ===== RLS на родителях (политики — в 0007) и на DEFAULT-партициях =====
alter table public.audit_log enable row level security;
alter table public.license_pings enable row level security;
alter table public.app_logs enable row level security;
alter table public.analytics_events enable row level security;
select public.secure_partition(p) from unnest(array[
  'audit_log_default', 'license_pings_default', 'app_logs_default', 'analytics_events_default']) as p;

-- ===== Начальные партиции: текущий месяц + 3 вперёд =====
select public.create_monthly_partitions(3);

-- ===== Права на служебные функции =====
-- В Supabase функции схемы public доступны через PostgREST RPC. DDL-функции — только service_role / владелец.
revoke all on function public.partition_retention_months(text) from public;
revoke all on function public.secure_partition(text) from public;
revoke all on function public.ensure_month_partition(text, text, date) from public;
revoke all on function public.create_monthly_partitions(int) from public;
revoke all on function public.drop_old_partitions(text, int) from public;
revoke all on function public.drop_old_partitions() from public;
revoke all on function public.is_partitioned(text) from public;
revoke all on function public.ensure_partitions_for_range(text, text, timestamptz) from public;
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.partition_retention_months(text) from %I', v_role);
      execute format('revoke all on function public.secure_partition(text) from %I', v_role);
      execute format('revoke all on function public.ensure_month_partition(text, text, date) from %I', v_role);
      execute format('revoke all on function public.create_monthly_partitions(int) from %I', v_role);
      execute format('revoke all on function public.drop_old_partitions(text, int) from %I', v_role);
      execute format('revoke all on function public.drop_old_partitions() from %I', v_role);
      execute format('revoke all on function public.is_partitioned(text) from %I', v_role);
      execute format('revoke all on function public.ensure_partitions_for_range(text, text, timestamptz) from %I', v_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_monthly_partitions(int) to service_role;
    grant execute on function public.drop_old_partitions(text, int) to service_role;
    grant execute on function public.drop_old_partitions() to service_role;
  end if;
end $$;

commit;
