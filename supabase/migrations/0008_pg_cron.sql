-- 0006_pg_cron.sql — расписания cron в Supabase: pg_cron + pg_net (агент 2, зона cron).
-- Причина: Vercel Hobby разрешает 2 cron раз в сутки, а ТЗ §8.4 требует задачи раз в минуту/5 минут/час.
-- Реестр задач совпадает с lib/schedules.ts (проверяется lib/schedules.test.ts). Миграция идемпотентна.
--
-- ВНИМАНИЕ (нумерация): агент 1 создаёт свои 0006_partitions.sql и 0007_rls_audit.sql. Это разные файлы,
-- нужны оба; при объединении переименуйте эти в следующие свободные номера, порядок 0006 → 0007 → 0008 сохранить.
--
-- НАСТРОЙКА (один раз, в SQL Editor Supabase, значения не хранятся в git):
--   alter database postgres set app.site_url = 'https://zapishisya.ru';
--   alter database postgres set app.cron_secret = '<тот же CRON_SECRET, что в Vercel>';
--   -- новые подключения pg_cron подхватят значения сами; проверить: select public.cron_setting('site_url');
-- Если ALTER DATABASE запрещён на вашем тарифе — положите значения в Vault (используется как запасной источник):
--   select vault.create_secret('https://zapishisya.ru', 'site_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Без настроек HTTP-задачи не вызываются, а ошибка пишется в audit_log (action = 'error:cron').

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ===== Настройки: current_setting('app.*'), запасной источник — Supabase Vault =====
create or replace function public.cron_setting(p_name text)
returns text
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_value text := nullif(current_setting('app.' || p_name, true), '');
begin
  if v_value is null and to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_value using p_name;
  end if;
  return nullif(v_value, '');
end;
$$;

-- ===== Журнал ошибок cron из БД (тот же формат, что lib/log.ts → logError('cron', ...)) =====
create or replace function public.cron_log_error(p_job text, p_message text)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  insert into audit_log (user_id, action, entity, entity_id, payload)
  values (null, 'error:cron', 'cron', null, jsonb_build_object('job', p_job, 'message', left(p_message, 500)));
$$;

-- Итог SQL-задачи (тот же формат, что lib/cron-context.ts → action cron:<job>). Только счётчики, без PII.
create or replace function public.cron_log_result(p_job text, p_payload jsonb)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  insert into audit_log (user_id, action, entity, entity_id, payload)
  values (null, 'cron:' || p_job, 'cron', null, coalesce(p_payload, '{}'::jsonb));
$$;

-- ===== Блокировки: одна задача не выполняется параллельно (lib/cron.ts → runCronJob) =====
create table if not exists public.cron_locks (
  job text primary key,
  run_id uuid not null,
  locked_until timestamptz not null,
  locked_at timestamptz not null default now()
);
alter table public.cron_locks enable row level security;

-- true — блокировка получена; false — задача уже выполняется и её блокировка не истекла.
create or replace function public.cron_try_lock(p_job text, p_run_id uuid, p_ttl_seconds int default 300)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_taken int;
begin
  insert into cron_locks as l (job, run_id, locked_until, locked_at)
  values (p_job, p_run_id, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (job) do update
    set run_id = excluded.run_id, locked_until = excluded.locked_until, locked_at = excluded.locked_at
    where l.locked_until < now();
  get diagnostics v_taken = row_count;
  return v_taken = 1;
end;
$$;

create or replace function public.cron_unlock(p_job text, p_run_id uuid)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  delete from cron_locks where job = p_job and run_id = p_run_id;
$$;

-- ===== Идемпотентность: журнал «уже сделано» (job, key) =====
-- Задача сначала «захватывает» ключ (insert ... on conflict do nothing), потом шлёт письмо. Повторный или
-- параллельный запуск тот же ключ не получит → письмо не задублируется. При ошибке отправки ключ освобождается
-- (cron_release), и следующий запуск попробует снова. Ключи: id брони, '<business>:<stage>', '<business>:<date>:<kind>'.
create table if not exists public.cron_marks (
  job text not null,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (job, key)
);
create index if not exists cron_marks_created_idx on public.cron_marks (created_at);
alter table public.cron_marks enable row level security;

-- Возвращает только те ключи, которые захвачены этим вызовом.
create or replace function public.cron_claim(p_job text, p_keys text[])
returns setof text
language sql security definer
set search_path = public, pg_temp
as $$
  insert into cron_marks (job, key)
  select p_job, k from unnest(p_keys) as k
  on conflict (job, key) do nothing
  returning key;
$$;

create or replace function public.cron_release(p_job text, p_keys text[])
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  delete from cron_marks where job = p_job and key = any (p_keys);
$$;

-- unconfirmed-reminder (ТЗ §10.8): брони status='new' старше 24 ч с визитом в будущем, ещё без напоминания.
-- Выбор и захват — одним запросом, поэтому уже напомненные брони не забивают выборку.
create or replace function public.cron_claim_unconfirmed(p_limit int default 50)
returns setof uuid
language sql security definer
set search_path = public, pg_temp
as $$
  insert into cron_marks (job, key)
  select 'unconfirmed-reminder', b.id::text
  from bookings b
  where b.status = 'new'
    and b.created_at < now() - interval '24 hours'
    and b.scheduled_at > now()
    and not exists (select 1 from cron_marks m where m.job = 'unconfirmed-reminder' and m.key = b.id::text)
  order by b.created_at
  limit least(greatest(p_limit, 1), 500)
  on conflict (job, key) do nothing
  returning key::uuid;
$$;

-- follow-up (ТЗ §8.4): молчуны в статусе sent. Отсчёт от первого письма: 30 дней — первый повтор,
-- 60 — второй, 90 — архив. Каждая стадия захватывается один раз ('<business>:<stage>').
create or replace function public.cron_claim_follow_up(p_limit int default 50)
returns table (business_id uuid, stage text)
language sql security definer
set search_path = public, pg_temp
as $$
  with first_sent as (
    select e.business_id, min(e.sent_at) as first_at
    from emails_outgoing e
    join businesses b on b.id = e.business_id and b.status = 'sent'
    where e.sent_at is not null
    group by e.business_id
  ), candidates as (
    select f.business_id,
      case
        when f.first_at <= now() - interval '90 days' then 'archive'
        when f.first_at <= now() - interval '60 days' then 'second'
        else 'first'
      end as stage
    from first_sent f
    where f.first_at <= now() - interval '30 days'
  ), claimed as (
    insert into cron_marks (job, key)
    select 'follow-up', c.business_id::text || ':' || c.stage
    from candidates c
    where not exists (
      select 1 from cron_marks m where m.job = 'follow-up' and m.key = c.business_id::text || ':' || c.stage)
    limit least(greatest(p_limit, 1), 500)
    on conflict (job, key) do nothing
    returning key
  )
  select split_part(key, ':', 1)::uuid, split_part(key, ':', 2) from claimed;
$$;

-- ===== Индексы под WHERE cron-задач (таблицы агента 1, индексы только добавляются) =====
create index if not exists bookings_status_scheduled_idx on public.bookings (status, scheduled_at);
create index if not exists bookings_status_created_idx on public.bookings (status, created_at);
create index if not exists businesses_status_refused_idx on public.businesses (status, refused_at);
create index if not exists businesses_status_subscription_idx on public.businesses (status, subscription_until);
create index if not exists businesses_status_deletion_idx on public.businesses (status, deletion_scheduled_at);
create index if not exists businesses_custom_domain_idx on public.businesses (custom_domain) where custom_domain is not null;
create index if not exists outreach_log_status_sent_idx on public.outreach_log (status, sent_at);
create index if not exists emails_outgoing_business_sent_idx on public.emails_outgoing (business_id, sent_at);
-- process-transfers / subscription-reminders: выкупившие код — единицы, частичный индекс почти ничего не весит.
create index if not exists businesses_transfer_support_idx on public.businesses (support_until)
  where code_transferred_at is not null;

-- ===== Реестр расписаний в БД (зеркало lib/schedules.ts для pg_cron) =====
-- kind = 'http' — command это имя задачи для /api/cron/<name>; kind = 'sql' — command это SQL-вызов функции.
create table if not exists public.cron_registry (
  name text primary key check (name ~ '^[a-z0-9-]+$'),
  schedule text not null,
  kind text not null check (kind in ('http', 'sql')),
  command text not null,
  timeout_ms int not null default 10000 check (timeout_ms between 1000 and 60000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.cron_registry enable row level security;

-- ===== HTTP-вызов задачи: fire-and-forget через net.http_get =====
-- Вызывается только для имён из cron_registry (никаких произвольных URL). Возвращает id запроса pg_net.
-- Результат запроса виден в net._http_response (хранится pg_net ~6 часов) и в audit_log (action cron:<job>).
create or replace function public.cron_http_call(p_job text)
returns bigint
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_job cron_registry%rowtype;
  v_site text := public.cron_setting('site_url');
  v_secret text := public.cron_setting('cron_secret');
begin
  select * into v_job from cron_registry where name = p_job and kind = 'http' and enabled;
  if not found then
    perform public.cron_log_error(p_job, 'задача не найдена в cron_registry или выключена');
    return null;
  end if;
  if v_site is null or v_secret is null then
    perform public.cron_log_error(p_job, 'не заданы app.site_url / app.cron_secret (см. 0006_pg_cron.sql)');
    return null;
  end if;
  return net.http_get(
    url := rtrim(v_site, '/') || '/api/cron/' || v_job.name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'User-Agent', 'supabase-pg-cron'),
    timeout_milliseconds := v_job.timeout_ms
  );
end;
$$;

-- ===== keep-alive: активность раз в час (Supabase Free приостанавливает неактивные проекты) =====
-- Важно: Supabase оценивает активность проекта по внешним запросам; запросы pg_cron внутри БД могут не считаться.
-- Основную «внешнюю» активность дают HTTP-задачи: booking-reminders / unconfirmed-reminder раз в час ходят
-- в Vercel, а оттуда — в REST API Supabase. keep-alive — дополнительная страховка внутри БД.
-- Заодно чистит историю запусков pg_cron старше 7 дней, иначе cron.job_run_details растёт на ~1500 строк в сутки.
create or replace function public.cron_keep_alive()
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted int := 0;
begin
  perform 1;
  begin
    delete from cron.job_run_details where end_time < now() - interval '7 days';
    get diagnostics v_deleted = row_count;
  exception when insufficient_privilege or undefined_table then
    perform public.cron_log_error('keep-alive', 'нет доступа к cron.job_run_details: ' || sqlerrm);
  end;
  return v_deleted;
end;
$$;

-- ===== Применение реестра к pg_cron: unschedule старого → schedule нового =====
create or replace function public.cron_apply_registry()
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_job cron_registry%rowtype;
  v_command text;
  v_count int := 0;
begin
  for v_job in select * from cron_registry order by name loop
    if exists (select 1 from cron.job where jobname = v_job.name) then
      perform cron.unschedule(v_job.name);
    end if;
    continue when v_job.enabled = false;
    if v_job.kind = 'http' then
      v_command := format('select public.cron_http_call(%L)', v_job.name);
    else
      v_command := v_job.command;
    end if;
    perform cron.schedule(v_job.name, v_job.schedule, v_command);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Права: функции — только для service_role (сервер) и владельца (pg_cron). anon/authenticated закрыты.
revoke all on table public.cron_locks, public.cron_registry, public.cron_marks from anon, authenticated;
revoke execute on function public.cron_setting(text), public.cron_log_error(text, text),
  public.cron_try_lock(text, uuid, int), public.cron_unlock(text, uuid), public.cron_http_call(text),
  public.cron_keep_alive(), public.cron_apply_registry(), public.cron_claim(text, text[]),
  public.cron_release(text, text[]), public.cron_claim_unconfirmed(int), public.cron_claim_follow_up(int)
  from public, anon, authenticated;
grant execute on function public.cron_try_lock(text, uuid, int), public.cron_unlock(text, uuid),
  public.cron_claim(text, text[]), public.cron_release(text, text[]),
  public.cron_claim_unconfirmed(int), public.cron_claim_follow_up(int) to service_role;

-- ===== 11 HTTP-задач + keep-alive (UTC; МСК = UTC+3) =====
insert into public.cron_registry (name, schedule, kind, command, timeout_ms) values
  ('send-emails', '* * * * *', 'http', 'send-emails', 60000),
  ('check-replies', '*/5 * * * *', 'http', 'check-replies', 60000),
  ('booking-reminders', '0 * * * *', 'http', 'booking-reminders', 60000),
  ('unconfirmed-reminder', '0 * * * *', 'http', 'unconfirmed-reminder', 60000),
  ('follow-up', '0 8 * * *', 'http', 'follow-up', 60000),
  ('subscription-reminders', '0 7 * * *', 'http', 'subscription-reminders', 60000),
  ('reset-email-limits', '0 21 * * *', 'http', 'reset-email-limits', 10000),
  ('archive-refused', '0 0 * * *', 'http', 'archive-refused', 10000),
  ('process-deletions', '0 1 * * *', 'http', 'process-deletions', 60000),
  ('process-transfers', '30 1 * * *', 'http', 'process-transfers', 10000),
  ('cleanup-prototypes', '0 2 * * *', 'http', 'cleanup-prototypes', 60000),
  ('check-domains', '30 2 * * *', 'http', 'check-domains', 60000),
  ('keep-alive', '0 * * * *', 'sql', 'select public.cron_keep_alive()', 30000)
on conflict (name) do update
  set schedule = excluded.schedule, kind = excluded.kind, command = excluded.command,
      timeout_ms = excluded.timeout_ms, enabled = true, updated_at = now();

select public.cron_apply_registry();

-- ===== Проверка: все задачи реестра есть в cron.job с тем же расписанием и активны =====
-- Вызывается в конце 0006, 0007, 0008. Падение миграции лучше, чем молча не запланированная задача.
create or replace function public.cron_assert_registry()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_missing text;
begin
  -- Сверяется и команда: задачу, вручную перепланированную через cron.schedule с другим SQL, ловим здесь.
  select string_agg(r.name, ', ' order by r.name) into v_missing
  from cron_registry r
  left join cron.job j on j.jobname = r.name and j.schedule = r.schedule and j.active
    and j.command = case when r.kind = 'http' then format('select public.cron_http_call(%L)', r.name) else r.command end
  where r.enabled and j.jobid is null;
  if v_missing is not null then
    raise exception 'pg_cron: не запланированы задачи: %', v_missing;
  end if;
end;
$$;
revoke execute on function public.cron_assert_registry(), public.cron_log_result(text, jsonb) from public, anon, authenticated;

select public.cron_assert_registry();

select jobname, schedule, active from cron.job order by jobname;
