-- supabase/migrations/0023_custom_roles_lifecycle.sql — жизненный цикл неиспользуемых кастомных ролей (П1/П2).
-- П1: роль, которой никто не пользовался 30 дней и у которой нет назначенных сотрудников, удаляется cron-задачей.
-- П2: за 10 дней до удаления (на 20-й день неактивности) владельцу уходит уведомление, и ставится removal_notified_at.
-- Идемпотентно: колонки через add column if not exists, функции через create or replace.
alter table if exists public.business_custom_roles
  add column if not exists last_used_at timestamptz,
  add column if not exists removal_notified_at timestamptz;

-- Окно уведомления/удаления считается от «даты последнего использования» (либо создания, если входа не было).
create index if not exists business_custom_roles_inactive_idx
  on public.business_custom_roles (COALESCE(last_used_at, created_at));

-- П2: роли, которым пора отправить уведомление (COALESCE(last_used_at, created_at) старше p_before, ещё не уведомляли).
create or replace function public.cron_select_roles_to_notify(p_before timestamptz)
returns table (id uuid, business_id uuid, name text, last_used_at timestamptz, created_at timestamptz) as $$
  select r.id, r.business_id, r.name, r.last_used_at, r.created_at
  from public.business_custom_roles r
  where COALESCE(r.last_used_at, r.created_at) < p_before
    and r.removal_notified_at is null;
$$ language sql stable;

-- П1: неиспользуемые роли без назначенных сотрудников (на удаление).
-- NOT EXISTS гарантирует, что роль с живыми сотрудниками не удалится (у неё last_used_at обновляется при входе).
create or replace function public.cron_select_unused_roles(p_before timestamptz)
returns table (id uuid, business_id uuid) as $$
  select r.id, r.business_id
  from public.business_custom_roles r
  where COALESCE(r.last_used_at, r.created_at) < p_before
    and not exists (
      select 1 from public.admin_users au
      where au.business_id = r.business_id and au.role = 'custom:' || r.id::text
    );
$$ language sql stable;
