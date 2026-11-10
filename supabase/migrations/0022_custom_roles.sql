-- supabase/migrations/0022_custom_roles.sql — пользовательские роли сотрудников (шаг 5).
-- Кастомная роль = сохранённая матрица доступа. В admin_users.role хранится 'custom:<uuid>'.
-- Идемпотентно: таблица создаётся один раз, CHECK ослабляется под custom:<uuid>.
create table if not exists public.business_custom_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  matrix jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index if not exists business_custom_roles_business_id_idx
  on public.business_custom_roles (business_id);

-- Ослабляем CHECK: встроенные 14 ролей ИЛИ custom:<uuid> (v4).
alter table if exists public.admin_users drop constraint if exists admin_users_role_check;
alter table if exists public.admin_users add constraint admin_users_role_check
  check (role in (
    'owner', 'manager', 'receptionist', 'content', 'viewer', 'finance',
    'marketing', 'callcenter', 'analyst', 'photographer', 'copywriter',
    'support', 'auditor', 'intern'
  ) or role ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

alter table if exists public.admin_invites drop constraint if exists admin_invites_role_check;
alter table if exists public.admin_invites add constraint admin_invites_role_check
  check (role in (
    'owner', 'manager', 'receptionist', 'content', 'viewer', 'finance',
    'marketing', 'callcenter', 'analyst', 'photographer', 'copywriter',
    'support', 'auditor', 'intern'
  ) or role ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
