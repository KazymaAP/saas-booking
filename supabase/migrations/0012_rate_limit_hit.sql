-- 0012_rate_limit_hit.sql — атомарный rate limit для lib/rate-limit.ts (агент 3 → зона 1).
-- Одна функция = один round-trip. INSERT … ON CONFLICT блокирует строку bucket на время апдейта,
-- конкурентные попадания выстраиваются в очередь, поэтому превысить лимит нельзя.
-- Счётчик ограничен p_limit + 1: спам после отказа не раздувает hits до переполнения int.
-- Миграция идемпотентна.

create or replace function public.rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
returns table (allowed boolean, hits int, retry_after int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => p_window_seconds);
  v_row rate_limits%rowtype;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'rate_limit_hit: недопустимые аргументы (%, %)', p_limit, p_window_seconds;
  end if;

  insert into rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    window_start = case when rl.window_start <= v_now - v_window then v_now else rl.window_start end,
    hits = case when rl.window_start <= v_now - v_window then 1 else least(rl.hits + 1, p_limit + 1) end
  returning * into v_row;

  return query select
    v_row.hits <= p_limit,
    v_row.hits,
    greatest(0, ceil(extract(epoch from (v_row.window_start + v_window - v_now))))::int;
end;
$$;

-- Вызывать может только сервер (service_role). anon/authenticated не должны засчитывать чужие попадания.
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
