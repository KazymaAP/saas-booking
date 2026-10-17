-- 0008_partitions.sql — ежемесячное создание партиций (ТЗ §4.28, §4.36, §4.37, §4.40, §4.50) (агент 2, зона cron).
-- Зависит от 0006_pg_cron.sql (cron_registry, cron_apply_registry, cron_log_*) и 0007_retention.sql (политика хранения).
-- Миграция идемпотентна.
--
-- Сами таблицы переводит на PARTITION BY RANGE агент 1 (его 0006_partitions.sql). Здесь — только обслуживание:
-- функция создаёт партиции <table>_YYYY_MM на текущий месяц и PARTITIONS_AHEAD месяцев вперёд
-- и DEFAULT-партицию (страховка: вставка не упадёт, если cron пропустил месяц).
-- Непартиционированные и отсутствующие таблицы пропускаются без ошибки — до миграции агента 1 функция ничего не делает.
-- Список таблиц — public.cron_retention_policy (у каждой партиционированной таблицы есть срок хранения).

-- ===== Партиции на месяц вперёд для одной таблицы =====
-- Возвращает число созданных партиций. Существующие партиции не трогаются.
create or replace function public.create_monthly_partitions_for(p_table text, p_months_ahead int default 3)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_from date;
  v_to date;
  v_name text;
  v_created int := 0;
begin
  if p_table !~ '^[a-z_][a-z0-9_]*$' or p_months_ahead not between 0 and 24 then
    raise exception 'create_monthly_partitions_for: недопустимые аргументы (%, %)', p_table, p_months_ahead;
  end if;
  -- relkind = 'p' — только партиционированные таблицы.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = p_table and c.relkind = 'p'
  ) then
    return 0;
  end if;

  for i in 0..p_months_ahead loop
    v_from := (v_month + make_interval(months => i))::date;
    v_to := (v_from + interval '1 month')::date;
    v_name := format('%s_%s', p_table, to_char(v_from, 'YYYY_MM'));
    continue when to_regclass('public.' || v_name) is not null;
    execute format('create table public.%I partition of public.%I for values from (%L) to (%L)',
      v_name, p_table, v_from, v_to);
    -- RLS на партиции не наследуется от родителя: включаем явно, политики не нужны (доступ только service_role).
    execute format('alter table public.%I enable row level security', v_name);
    v_created := v_created + 1;
  end loop;

  v_name := p_table || '_default';
  if to_regclass('public.' || v_name) is null then
    execute format('create table public.%I partition of public.%I default', v_name, p_table);
    execute format('alter table public.%I enable row level security', v_name);
  end if;
  return v_created;
end;
$$;

-- ===== Все партиционированные таблицы из политики хранения =====
-- Ошибка по одной таблице не мешает остальным: она пишется в audit_log (error:cron), функция идёт дальше.
create or replace function public.create_monthly_partitions(p_months_ahead int default 3)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_count int;
  v_total int := 0;
  v_errors int := 0;
begin
  for v_table in select table_name from public.cron_retention_policy order by table_name loop
    begin
      v_count := public.create_monthly_partitions_for(v_table, p_months_ahead);
      v_total := v_total + v_count;
    exception when others then
      v_errors := v_errors + 1;
      perform public.cron_log_error('create-partitions', v_table || ': ' || sqlerrm);
    end;
  end loop;
  perform public.cron_log_result('create-partitions',
    jsonb_build_object('created', v_total, 'errors', v_errors, 'months_ahead', p_months_ahead));
  return v_total;
end;
$$;

revoke execute on function public.create_monthly_partitions_for(text, int), public.create_monthly_partitions(int)
  from public, anon, authenticated;

-- ===== Задача: 1-го числа 07:00 UTC (ТЗ §8.4 — раз в месяц) =====
insert into public.cron_registry (name, schedule, kind, command, timeout_ms) values
  ('create-partitions', '0 7 1 * *', 'sql', 'select public.create_monthly_partitions()', 30000)
on conflict (name) do update
  set schedule = excluded.schedule, kind = excluded.kind, command = excluded.command,
      timeout_ms = excluded.timeout_ms, enabled = true, updated_at = now();

select public.cron_apply_registry();
select public.cron_assert_registry();

-- Сразу создаём партиции на ближайшие месяцы (если таблицы уже партиционированы).
select public.create_monthly_partitions();

select jobname, schedule, active from cron.job order by jobname;
