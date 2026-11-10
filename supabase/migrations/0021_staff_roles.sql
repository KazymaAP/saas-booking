-- supabase/migrations/0021_staff_roles.sql — расширение ролей сотрудников бизнеса до 14 встроенных значений.
-- Идемпотентно: снимает старые CHECK-ограничения и ставит новые, строки не удаляет.
alter table if exists public.admin_users drop constraint if exists admin_users_role_check;
alter table if exists public.admin_users add constraint admin_users_role_check
  check (role in (
    'owner', 'manager', 'receptionist', 'content', 'viewer', 'finance',
    'marketing', 'callcenter', 'analyst', 'photographer', 'copywriter',
    'support', 'auditor', 'intern'
  ));

alter table if exists public.admin_invites drop constraint if exists admin_invites_role_check;
alter table if exists public.admin_invites add constraint admin_invites_role_check
  check (role in (
    'owner', 'manager', 'receptionist', 'content', 'viewer', 'finance',
    'marketing', 'callcenter', 'analyst', 'photographer', 'copywriter',
    'support', 'auditor', 'intern'
  ));
