-- 0007_retention.sql — сроки хранения журналов (ТЗ §4.50, §16.9) и pg_cron-задачи очистки (агент 2, зона cron).
-- Зависит от 0006_pg_cron.sql (cron_registry, cron_apply_registry, cron_log_*). Миграция идемпотентна.
--
-- Сроки (дни) — единый источник в public.cron_retention_policy, зеркало в lib/schedules.ts → RETENTION_DAYS
-- (совпадение проверяет lib/schedules.test.ts):
--   audit_log 90 (по заданию агента; ТЗ §4.50 — 1 год, см. notes.md «Что требует внимания»),
--   app_logs 30, analytics_events 180, license_pings 180, cron_marks 180 (журнал идемпотентности cron из 0006;
--   чистится вместе с license_pings, отдельной pg_cron-задачи не требует).
-- Таблиц app_logs и analytics_events в схеме пока нет: задачи для них запланированы и просто ничего не делают,
-- пока таблицы не появятся (агент 1). Изменить срок: update public.cron_retention_policy set keep_days = ... .
--
-- Как чистится:
--   1) партиционированная таблица — целиком удаляются партиции, верхняя граница которых старше срока (мгновенно);
--   2) остаток — DELETE батчами по batch_size строк, не больше max_batches батчей за запуск (без долгих блокировок);
--      недоделанное подхватит следующий запуск.

-- ===== Политика хранения =====
create table if not exists public.cron_retention_policy (
  table_name text primary key check (table_name ~ '^[a-z_][a-z0-9_]*$'),
  keep_days int not null check (keep_days between 1 and 3650),
  ts_column text not null check (ts_column ~ '^[a-z_][a-z0-9_]*$'),
  batch_size int not null default 5000 check (batch_size between 100 and 50000),
  max_batches int not null default 20 check (max_batches between 1 and 1000),
  updated_at timestamptz not null default now()
);
alter table public.cron_retention_policy enable row level security;
revoke all on table public.cron_retention_policy from anon, authenticated;

insert into public.cron_retention_policy (table_name, keep_days, ts_column) values
  ('audit_log', 90, 'created_at'),
  ('app_logs', 30, 'created_at'),
  ('analytics_events', 180, 'created_at'),
  ('license_pings', 180, 'pinged_at'),
  ('cron_marks', 180, 'created_at')
on conflict (table_name) do update
  set keep_days = excluded.keep_days, ts_column = excluded.ts_column, updated_at = now();

-- ===== Индексы под DELETE по времени (только для существующих таблиц) =====
-- Индекс создаётся, только если нет другого индекса, начинающегося с колонки времени
-- (для audit_log уже есть audit_log_created_idx из 0002 — дубль не нужен).
do $$
declare
  v_policy record;
begin
  for v_policy in select table_name, ts_column from public.cron_retention_policy loop
    continue when to_regclass('public.' || v_policy.table_name) is null;
    continue when exists (
      select 1
      from pg_index x
      join pg_attribute a on a.attrelid = x.indrelid and a.attnum = x.indkey[0]
      where x.indrelid = to_regclass('public.' || v_policy.table_name) and a.attname = v_policy.ts_column
    );
    execute format('create index if not exists %I on public.%I (%I)',
      v_policy.table_name || '_' || v_policy.ts_column || '_retention_idx', v_policy.table_name, v_policy.ts_column);
  end loop;
end;
$$;

-- ===== Удаление устаревших партиций =====
-- Удаляет партиции p_table, у которых верхняя граница диапазона <= p_cutoff. DEFAULT-партиция не трогается.
create or replace function public.cron_drop_old_partitions(p_table text, p_cutoff timestamptz)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_part record;
  v_upper text;
  v_dropped int := 0;
begin
  for v_part in
    select c.relname, pg_get_expr(c.relpartbound, c.oid) as bound
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    join pg_namespace n on n.oid = p.relnamespace
    where n.nspname = 'public' and p.relname = p_table
  loop
    -- Формат границы: FOR VALUES FROM ('...') TO ('...'). Берём значение после TO.
    v_upper := substring(v_part.bound from $re$TO \('([^']+)'\)$re$);
    continue when v_upper is null;
    if v_upper::timestamptz <= p_cutoff then
      execute format('alter table public.%I detach partition public.%I', p_table, v_part.relname);
      execute format('drop table public.%I', v_part.relname);
      v_dropped := v_dropped + 1;
    end if;
  end loop;
  return v_dropped;
end;
$$;

-- ===== Очистка одной таблицы по политике =====
-- Возвращает число удалённых строк (0 — таблицы нет или нечего удалять, null — ошибка, она записана в audit_log).
-- Имя таблицы допускается только из cron_retention_policy: произвольный SQL из pg_cron невозможен.
create or replace function public.cron_retention(p_table text)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_policy public.cron_retention_policy%rowtype;
  v_cutoff timestamptz;
  v_batch int;
  v_deleted int := 0;
  v_partitions int := 0;
  v_job text := 'retention:' || p_table;
begin
  select * into v_policy from public.cron_retention_policy where table_name = p_table;
  if not found then
    perform public.cron_log_error(v_job, 'нет политики хранения для таблицы ' || p_table);
    return null;
  end if;
  if to_regclass('public.' || p_table) is null then
    return 0;
  end if;
  -- Защита от параллельного запуска (pg_cron и страховочный Vercel-cron cleanup-audit-log).
  if pg_try_advisory_xact_lock(hashtext('cron_retention:' || p_table)) = false then
    return 0;
  end if;

  v_cutoff := now() - make_interval(days => v_policy.keep_days);
  begin
    v_partitions := public.cron_drop_old_partitions(p_table, v_cutoff);
    for i in 1..v_policy.max_batches loop
      -- Пара (tableoid, ctid), а не один ctid: в партиционированной таблице ctid уникален только внутри партиции,
      -- и «where ctid in (...)» удалил бы свежие строки других партиций с тем же ctid.
      execute format(
        'delete from public.%1$I where (tableoid, ctid) in (select tableoid, ctid from public.%1$I where %2$I < $1 limit $2)',
        p_table, v_policy.ts_column)
        using v_cutoff, v_policy.batch_size;
      get diagnostics v_batch = row_count;
      v_deleted := v_deleted + v_batch;
      exit when v_batch < v_policy.batch_size;
    end loop;
  exception when others then
    perform public.cron_log_error(v_job, sqlerrm);
    return null;
  end;

  perform public.cron_log_result(v_job, jsonb_build_object(
    'table', p_table, 'keep_days', v_policy.keep_days, 'deleted', v_deleted, 'dropped_partitions', v_partitions));
  return v_deleted;
end;
$$;

revoke execute on function public.cron_drop_old_partitions(text, timestamptz), public.cron_retention(text)
  from public, anon, authenticated;
-- service_role: страховочная очистка из /api/cron/cleanup-audit-log (Vercel).
grant execute on function public.cron_retention(text) to service_role;

-- ===== 4 задачи очистки (UTC) =====
insert into public.cron_registry (name, schedule, kind, command, timeout_ms) values
  ('cleanup-audit-log-90', '0 3 * * *', 'sql', 'select public.cron_retention(''audit_log'')', 30000),
  ('cleanup-app-logs-30', '0 4 * * *', 'sql', 'select public.cron_retention(''app_logs'')', 30000),
  ('cleanup-analytics-180', '0 5 * * *', 'sql', 'select public.cron_retention(''analytics_events'')', 30000),
  ('cleanup-license-pings-180', '0 6 * * *', 'sql', 'select public.cron_retention(''license_pings''), public.cron_retention(''cron_marks'')', 30000)
on conflict (name) do update
  set schedule = excluded.schedule, kind = excluded.kind, command = excluded.command,
      timeout_ms = excluded.timeout_ms, enabled = true, updated_at = now();

select public.cron_apply_registry();
select public.cron_assert_registry();

select table_name, keep_days, ts_column from public.cron_retention_policy order by table_name;
