-- 0009_analytics.sql — собственная аналитика (ТЗ 4.0 §4.40, §4.49, §4.50, §12.3, §13.8). Идемпотентно.
--
-- Приватность: IP и User-Agent в таблицу не попадают — только sha256(значение + ANALYTICS_SALT), hex 64 символа.
-- Соль живёт в env приложения, в БД её нет: восстановить IP по хэшу из дампа нельзя.
-- Партиционирование: RANGE по created_at помесячно + DEFAULT-партиция, чтобы вставка никогда не падала,
-- даже если cron создания партиций не отработал. Retention: 6 месяцев (DROP партиции, без DELETE).

-- ===== 1. Хелпер супер-админа =====
-- В проекте супер-админ определяется по SUPERADMIN_EMAILS в env (lib/admin-session.ts), в БД списка нет.
-- Для RLS заводим таблицу-список: пусто → никто через anon/authenticated не читает (доступ только service_role).
create table if not exists super_admins (
  email text primary key check (email = lower(email))
);
alter table super_admins enable row level security;

create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from super_admins sa
    where sa.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ===== 2. Таблица событий =====
-- Таблица создана в 0006 (партиционирование по created_at). create table if not exists здесь пропускается,
-- поэтому ограничения добавляются отдельным идемпотентным блоком: работает при любом порядке создания.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'analytics_events_event_chk' and conrelid = to_regclass('public.analytics_events')) then
    -- Whitelist событий дублирует lib/analytics.ts: anon-вставка в обход API тоже не запишет мусор.
    alter table analytics_events add constraint analytics_events_event_chk check (event in (
      'pageview', 'booking_open', 'booking_submit', 'phone_click', 'map_open', 'preview_view'));
    alter table analytics_events add constraint analytics_events_path_chk check (path is null or (char_length(path) <= 512 and left(path, 1) = '/'));
    alter table analytics_events add constraint analytics_events_referrer_chk check (referrer is null or char_length(referrer) <= 255);
    -- Хэши — ровно 64 hex-символа: сырой IP/UA сюда не пролезет.
    alter table analytics_events add constraint analytics_events_ip_hash_chk check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$');
    alter table analytics_events add constraint analytics_events_ua_hash_chk check (ua_hash is null or ua_hash ~ '^[0-9a-f]{64}$');
    -- session_id — только uuid v4, без PII.
    alter table analytics_events add constraint analytics_events_session_chk check (
      session_id is null or session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
  end if;
end
$$;

-- Индексы на родителе автоматически создаются на всех партициях (PG 11+).
create index if not exists idx_analytics_business on analytics_events (business_id, created_at);
create index if not exists idx_analytics_event on analytics_events (event, created_at);
-- Подсчёт уникальных сессий за период без чтения всей партиции.
create index if not exists idx_analytics_session on analytics_events (session_id, created_at);

-- DEFAULT-партиция: страховка от падения вставки, если месячной партиции нет.
create table if not exists analytics_events_default partition of analytics_events default;

-- ===== 3. Управление партициями =====
-- Партиции не наследуют RLS родителя, а Supabase по default privileges выдаёт anon права на каждую новую таблицу.
-- Без этой функции партицию analytics_events_YYYY_MM можно прочитать напрямую в обход RLS.
create or replace function analytics_secure_relation(p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  execute format('alter table %I enable row level security', p_name);
  execute format('revoke all on %I from public, anon, authenticated', p_name);
end;
$$;

-- Создаёт месячную партицию для месяца, в который попадает p_month. Возвращает имя партиции.
-- Если в DEFAULT уже лежат строки этого месяца, переносит их (иначе PG не даст создать партицию).
create or replace function analytics_create_partition(p_month date)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name text := format('analytics_events_%s', to_char(v_from, 'YYYY_MM'));
begin
  if to_regclass(v_name) is not null then
    perform analytics_secure_relation(v_name);
    return v_name;
  end if;

  if exists (select 1 from analytics_events_default where created_at >= v_from and created_at < v_to) then
    execute format('create table %I (like analytics_events including defaults including constraints)', v_name);
    execute format(
      'with moved as (delete from analytics_events_default where created_at >= %L and created_at < %L returning *)
       insert into %I select * from moved', v_from, v_to, v_name);
    execute format('alter table analytics_events attach partition %I for values from (%L) to (%L)', v_name, v_from, v_to);
  else
    execute format('create table %I partition of analytics_events for values from (%L) to (%L)', v_name, v_from, v_to);
  end if;
  perform analytics_secure_relation(v_name);
  return v_name;
end;
$$;

-- Текущий месяц + p_ahead месяцев вперёд. Вызывается cron create-partitions (ТЗ §8.4) раз в месяц.
create or replace function analytics_ensure_partitions(p_ahead int default 3)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  i int;
begin
  for i in 0..greatest(p_ahead, 0) loop
    perform analytics_create_partition((date_trunc('month', now()) + make_interval(months => i))::date);
  end loop;
  return greatest(p_ahead, 0) + 1;
end;
$$;

-- Retention 6 месяцев (ТЗ §4.50): удаляем целые партиции старше p_keep_months, DELETE по таблице не нужен.
-- Из DEFAULT старые строки удаляются с явным WHERE.
create or replace function analytics_drop_old_partitions(p_keep_months int default 6)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_cutoff date := (date_trunc('month', now()) - make_interval(months => greatest(p_keep_months, 1)))::date;
  r record;
  v_dropped int := 0;
begin
  for r in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'analytics_events'
      and c.relname ~ '^analytics_events_\d{4}_\d{2}$'
      and to_date(substring(c.relname from '(\d{4}_\d{2})$'), 'YYYY_MM') < v_cutoff
  loop
    execute format('drop table if exists %I', r.relname);
    v_dropped := v_dropped + 1;
  end loop;
  delete from analytics_events_default where created_at < v_cutoff;
  return v_dropped;
end;
$$;

-- Партиции на текущий месяц и 3 месяца вперёд (ТЗ §4.40: 2026_10..2026_12 и далее).
select analytics_ensure_partitions(3);

-- ===== 4. RLS (ТЗ §4.49) =====
alter table analytics_events enable row level security;
select analytics_secure_relation('analytics_events_default');
revoke all on super_admins from anon, authenticated;

drop policy if exists p_analytics_events_ins on analytics_events;
drop policy if exists p_analytics_events_sel on analytics_events;
-- INSERT для anon/authenticated; содержимое ограничено CHECK-ограничениями выше.
create policy p_analytics_events_ins on analytics_events
  for insert to anon, authenticated with check (true);
create policy p_analytics_events_sel on analytics_events
  for select to authenticated using (is_super_admin());

-- bigserial-последовательность нужна anon для вставки напрямую.
grant insert on analytics_events to anon, authenticated;
-- SELECT нужен authenticated, иначе RLS-политика p_analytics_events_sel не применится (permission denied).
grant select on analytics_events to authenticated;
grant usage on sequence analytics_events_id_seq to anon, authenticated;

-- ===== 5. Агрегаты: materialized view по дням (ТЗ §12.3) =====
-- visitors — уникальные ip_hash+ua_hash за день (приближение к уникальным посетителям без cookie).
create materialized view if not exists analytics_daily as
select
  date_trunc('day', created_at at time zone 'Europe/Moscow')::date as day,
  business_id,
  event,
  count(*)::bigint as events,
  count(distinct session_id)::bigint as sessions,
  count(distinct (ip_hash || coalesce(ua_hash, ''))) filter (where ip_hash is not null)::bigint as visitors
from analytics_events
group by 1, 2, 3
with no data;

-- Уникальный индекс по колонкам (не выражениям) обязателен для refresh concurrently.
-- business_id может быть null (лендинг) → nulls not distinct (PG 15+, Supabase — PG 15/17).
create unique index if not exists analytics_daily_uq
  on analytics_daily (day, business_id, event) nulls not distinct;
create index if not exists analytics_daily_business_day on analytics_daily (business_id, day);

-- MV не поддерживает RLS: закрываем от anon/authenticated, читает только service_role (сервер).
revoke all on analytics_daily from anon, authenticated;

-- Журнал обновлений MV: дашборд показывает «данные на …» и обновляет MV лениво, если cron не отработал.
create table if not exists analytics_refresh_log (
  id smallint primary key default 1 check (id = 1),
  refreshed_at timestamptz not null
);
alter table analytics_refresh_log enable row level security;
revoke all on analytics_refresh_log from anon, authenticated;

-- Ранняя версия analytics_refresh() возвращала void; create or replace не меняет тип результата → пересоздаём.
do $drop$
begin
  if exists (select 1 from pg_proc where proname = 'analytics_refresh' and pronargs = 0
             and prorettype = 'void'::regtype) then
    drop function analytics_refresh();
  end if;
end;
$drop$;

-- Refresh: concurrently не блокирует чтение дашборда. Первый раз (MV без данных) — обычный refresh.
create or replace function analytics_refresh()
returns timestamptz
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from pg_matviews where matviewname = 'analytics_daily' and ispopulated) then
    refresh materialized view concurrently analytics_daily;
  else
    refresh materialized view analytics_daily;
  end if;
  insert into analytics_refresh_log (id, refreshed_at) values (1, now())
    on conflict (id) do update set refreshed_at = excluded.refreshed_at;
  return now();
end;
$$;

-- Ленивое обновление: если MV старше p_max_age (cron не настроен или упал) — обновляем при открытии дашборда.
-- Заодно обслуживаем партиции: без pg_cron месячные партиции иначе не создаются и всё копится в DEFAULT,
-- а retention не срабатывает. Обе операции идемпотентны и дешёвые (to_regclass / pg_inherits).
-- pg_try_advisory_xact_lock: параллельные запросы не запускают refresh дважды, второй просто читает текущие данные.
create or replace function analytics_refresh_if_stale(p_max_age interval default interval '1 hour')
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_at timestamptz := (select refreshed_at from analytics_refresh_log where id = 1);
begin
  if (v_at is null or v_at < now() - p_max_age) and pg_try_advisory_xact_lock(hashtext('analytics_refresh')) then
    perform analytics_ensure_partitions(3);
    perform analytics_drop_old_partitions(6);
    perform analytics_purge_rate_limits();
    return analytics_refresh();
  end if;
  return v_at;
end;
$$;

-- Атомарный rate limit трекинга: один upsert вместо select → update из lib/rate-limit.ts
-- (там 2 запроса и гонка: параллельные события одного IP читают одно и то же hits).
-- Хранилище — общая таблица rate_limits (0001), bucket 'track:<ip_hash>'. hits ограничен limit + 1, чтобы
-- спам после превышения не рос до переполнения int. true — событие в пределах лимита.
create or replace function analytics_rate_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language sql volatile security definer set search_path = public
as $$
  insert into rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end,
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                then 1 else least(r.hits + 1, p_limit + 1) end
  returning hits <= p_limit;
$$;

-- Бакеты трекинга копятся по одному на IP в сутки (суточная соль) → чистим истёкшие. Только свой префикс 'track:',
-- чужие лимиты (booking:, login: …) не трогаем. Окно лимита — час, берём запас в сутки.
create or replace function analytics_purge_rate_limits()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from rate_limits where bucket like 'track:%' and window_start < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

select analytics_refresh();

-- ===== 6. Агрегаты для дашборда (вместо выгрузки 50 000 строк в Node) =====
-- Бизнес-срез: воронка, города, ниши, MRR. Возвращает jsonb одним запросом.
create or replace function analytics_business_summary()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from businesses),
    'mrr', (select coalesce(sum(subscription_price), 0) from businesses
            where subscription_active and subscription_price is not null),
    'active_subscriptions', (select count(*) from businesses where subscription_active),
    -- Конверсия sent → paid (ТЗ §13.8) по факту событий, а не по текущему статусу:
    -- «отправлено» = бизнесу ушло хотя бы одно письмо/сообщение, «оплачено» = есть paid_initial_at.
    -- Бизнес, ушедший после отправки в archived/refused, остаётся в знаменателе.
    'contacted', (select count(distinct business_id) from outreach_log where sent_at is not null),
    'paid', (select count(*) from businesses b where b.paid_initial_at is not null
             and exists (select 1 from outreach_log o where o.business_id = b.id and o.sent_at is not null)),
    'paid_total', (select count(*) from businesses where paid_initial_at is not null),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                  from (select status, count(*) as n from businesses group by status) s),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('key', city, 'value', n) order by n desc, city), '[]'::jsonb)
                from (select city, count(*) as n from businesses where city is not null and city <> ''
                      group by city order by n desc, city limit 30) c),
    'by_vertical', (select coalesce(jsonb_agg(jsonb_build_object('key', name, 'value', n) order by n desc, name), '[]'::jsonb)
                    from (select coalesce(vt.name, 'без ниши') as name, count(*) as n
                          from businesses b left join vertical_templates vt on vt.id = b.vertical_template_id
                          group by 1) v)
  );
$$;

-- Срез рассылки за период: каналы, шаблоны (отправлено/открыто/клик), отправки по дням.
create or replace function analytics_outreach_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with o as (
    select channel, template_id, sent_at, opened_at, clicked_at, status
    from outreach_log
    where sent_at >= p_from and sent_at < p_to
  )
  select jsonb_build_object(
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('key', ch, 'value', n) order by n desc), '[]'::jsonb)
                   from (select coalesce(channel, 'email') as ch, count(*) as n from o group by 1) c),
    'by_template', (select coalesce(jsonb_agg(jsonb_build_object(
                        'key', name, 'sent', sent, 'opened', opened, 'clicked', clicked) order by sent desc), '[]'::jsonb)
                    from (select coalesce(vt.name, case when o.template_id is null or o.template_id = 'default'
                                                       then 'встроенный' else 'шаблон' end) as name,
                                 count(*) filter (where o.status = 'sent') as sent,
                                 count(o.opened_at) as opened,
                                 count(o.clicked_at) as clicked
                          from o left join vertical_templates vt on vt.id::text = o.template_id
                          group by 1) t),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('key', d, 'value', n) order by d desc), '[]'::jsonb)
               from (select to_char(sent_at at time zone 'Europe/Moscow', 'YYYY-MM-DD') as d, count(*) as n
                     from o group by 1) dd)
  );
$$;

-- Трафик сайтов за период из MV: по дням и по событиям; p_business_id = null → все бизнесы.
create or replace function analytics_traffic_summary(p_from date, p_to date, p_business_id uuid default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with d as (
    select day, event, events, sessions, visitors
    from analytics_daily
    where day >= p_from and day < p_to
      and (p_business_id is null or business_id = p_business_id)
  )
  select jsonb_build_object(
    'by_event', (select coalesce(jsonb_object_agg(event, n), '{}'::jsonb)
                 from (select event, sum(events) as n from d group by event) e),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object(
                   'day', day, 'pageviews', pv, 'sessions', ss, 'bookings', bk) order by day desc), '[]'::jsonb)
               from (select day,
                            coalesce(sum(events) filter (where event = 'pageview'), 0) as pv,
                            coalesce(sum(sessions) filter (where event = 'pageview'), 0) as ss,
                            coalesce(sum(events) filter (where event = 'booking_submit'), 0) as bk
                     from d group by day) x),
    'top_businesses', (select coalesce(jsonb_agg(jsonb_build_object(
                           'business_id', business_id, 'name', name, 'pageviews', pv, 'bookings', bk)
                           order by pv desc), '[]'::jsonb)
                       from (select a.business_id, b.name,
                                    coalesce(sum(a.events) filter (where a.event = 'pageview'), 0) as pv,
                                    coalesce(sum(a.events) filter (where a.event = 'booking_submit'), 0) as bk
                             from analytics_daily a join businesses b on b.id = a.business_id
                             where a.day >= p_from and a.day < p_to
                               and (p_business_id is null or a.business_id = p_business_id)
                             group by a.business_id, b.name
                             order by pv desc nulls last
                             limit 20) t)
  );
$$;

-- Временной ряд для /api/analytics/summary: просмотры, сессии, посетители, события и реальные заявки (bookings)
-- с группировкой day | week | month. Заявки — из bookings.created_at, а не из клиентского события:
-- конверсия «просмотр → заявка» не зависит от блокировщиков и DNT.
create or replace function analytics_series(p_from date, p_to date, p_business_id uuid default null, p_group text default 'day')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_unit text := case when p_group in ('day', 'week', 'month') then p_group else 'day' end;
  v_result jsonb;
begin
  with buckets as (
    select generate_series(date_trunc(v_unit, p_from::timestamp), (p_to - 1)::timestamp, ('1 ' || v_unit)::interval)::date as bucket
  ),
  ev as (
    select date_trunc(v_unit, day::timestamp)::date as bucket,
           sum(events) filter (where event = 'pageview') as pageviews,
           sum(sessions) filter (where event = 'pageview') as sessions,
           sum(visitors) filter (where event = 'pageview') as visitors,
           sum(events) filter (where event = 'booking_open') as booking_open,
           sum(events) filter (where event = 'booking_submit') as booking_submit,
           sum(events) filter (where event = 'phone_click') as phone_click,
           sum(events) filter (where event = 'map_open') as map_open
    from analytics_daily
    where day >= p_from and day < p_to and (p_business_id is null or business_id = p_business_id)
    group by 1
  ),
  bk as (
    select date_trunc(v_unit, (created_at at time zone 'Europe/Moscow'))::date as bucket, count(*) as bookings
    from bookings
    where created_at >= (p_from::timestamp at time zone 'Europe/Moscow')
      and created_at < (p_to::timestamp at time zone 'Europe/Moscow')
      and (p_business_id is null or business_id = p_business_id)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'bucket', b.bucket,
           'pageviews', coalesce(ev.pageviews, 0),
           'sessions', coalesce(ev.sessions, 0),
           'visitors', coalesce(ev.visitors, 0),
           'booking_open', coalesce(ev.booking_open, 0),
           'booking_submit', coalesce(ev.booking_submit, 0),
           'phone_click', coalesce(ev.phone_click, 0),
           'map_open', coalesce(ev.map_open, 0),
           'bookings', coalesce(bk.bookings, 0)) order by b.bucket), '[]'::jsonb)
  into v_result
  from buckets b
  left join ev on ev.bucket = b.bucket
  left join bk on bk.bucket = b.bucket;
  return v_result;
end;
$$;

-- Агрегирующие функции — только для сервера (service_role). anon/authenticated не вызывают.
revoke execute on function analytics_business_summary() from public, anon, authenticated;
revoke execute on function analytics_outreach_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function analytics_traffic_summary(date, date, uuid) from public, anon, authenticated;
revoke execute on function analytics_refresh() from public, anon, authenticated;
revoke execute on function analytics_refresh_if_stale(interval) from public, anon, authenticated;
revoke execute on function analytics_rate_hit(text, int, int) from public, anon, authenticated;
revoke execute on function analytics_purge_rate_limits() from public, anon, authenticated;
revoke execute on function analytics_series(date, date, uuid, text) from public, anon, authenticated;
revoke execute on function analytics_create_partition(date) from public, anon, authenticated;
revoke execute on function analytics_secure_relation(text) from public, anon, authenticated;
revoke execute on function analytics_ensure_partitions(int) from public, anon, authenticated;
revoke execute on function analytics_drop_old_partitions(int) from public, anon, authenticated;

-- ===== 7. Расписание (pg_cron, если расширение включено в Supabase) =====
-- Нет pg_cron → блок пропускается; запасной путь — Vercel Cron вызывает RPC (см. notes.md, «Блокеры»).
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('analytics-refresh', '5 * * * *', 'select analytics_refresh()');
    perform cron.schedule('analytics-partitions', '0 7 1 * *', 'select analytics_ensure_partitions(3)');
    perform cron.schedule('analytics-retention', '30 6 * * *', 'select analytics_drop_old_partitions(6)');
    perform cron.schedule('analytics-rate-purge', '45 * * * *', 'select analytics_purge_rate_limits()');
  end if;
end;
$cron$;
