-- supabase/migrations/0026_rls_custom_roles.sql — закрыть business_custom_roles от anon/authenticated.
--
-- Почему отдельная миграция: 0022 создала таблицу уже после 0007, а цикл в 0007 включает RLS только
-- на таблицах, существовавших на момент его применения. Новая таблица осталась без RLS, а Supabase по
-- умолчанию выдаёт anon/authenticated права на все таблицы public — значит, с публичным anon-ключом
-- матрицы доступа всех бизнесов можно было читать и менять через PostgREST.
--
-- Таблица нужна только серверу: кабинет читает её через adminClient() (service_role обходит RLS),
-- браузер к ней не обращается. Поэтому политика — полный запрет для всех, кроме service_role.
-- Идемпотентно: повторный прогон не меняет результат.

alter table if exists public.business_custom_roles enable row level security;

drop policy if exists p_business_custom_roles_deny on public.business_custom_roles;
create policy p_business_custom_roles_deny on public.business_custom_roles
  for all using (false) with check (false);
