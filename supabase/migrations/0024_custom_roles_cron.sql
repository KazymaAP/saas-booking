-- 0024_custom_roles_cron.sql — регистрация задачи cleanup-unused-roles в cron_registry (П1/П2, жизненный цикл кастомных ролей).
--
-- ВАЖНО: 0008_pg_cron.sql уже применён на live (входит в пакет 0001–0014). Миграции повторно не
-- накатываются, поэтому добавлять строку в уже применённый 0008 бессмысленно — она не дойдёт до базы.
-- Поэтому новая задача регистрируется отдельной идемпотентной миграцией и применяется вручную
-- (см. ниже «НА LIVE»).
--
-- Идемпотентно: on conflict (name) do update — повторный запуск безопасен.

insert into public.cron_registry (name, schedule, kind, command, timeout_ms) values
  ('cleanup-unused-roles', '0 4 * * *', 'http', 'cleanup-unused-roles', 10000)
on conflict (name) do update
  set schedule = excluded.schedule, kind = excluded.kind, command = excluded.command,
      timeout_ms = excluded.timeout_ms, enabled = true, updated_at = now();

-- Запланировать задачу в pg_cron (как делает cron_apply_registry: unschedule старого → schedule нового).
-- Функция public.cron_apply_registry() определена в 0008 и уже существует на live.
select public.cron_apply_registry();

-- Проверка: все задачи реестра запланированы в cron.job с тем же расписанием и активны.
-- Падение здесь лучше, чем молча не запланированная задача.
select public.cron_assert_registry();

-- ═══════════════════════════════════════════════════════════════════════════════════
-- НА LIVE (выполнить вручную, SQL Editor / Management API) ПОСЛЕ применения 0023:
--   начало этого файла (insert ...) … select public.cron_assert_registry();
-- Автоматически не накатывается: в песочнице нет токена Supabase.
-- ═══════════════════════════════════════════════════════════════════════════════════
