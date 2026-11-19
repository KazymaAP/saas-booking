-- 0033_force_password_change.sql — принудительная смена пароля при первом входе.
--
-- Зачем: кабинеты, заведённые служебным скриптом provision-service-admins.cjs, получили
-- один и тот же пароль. Пока владелец его не сменит, кабинет нельзя считать закрытым.
-- Флаг ставится при выдаче временного пароля и снимается, когда владелец задал свой.
--
-- Логика: layout кабинета смотрит на флаг и уводит на /{prefix}/{slug}/admin/password,
-- пока пароль не сменён. Супер-админ в режиме поддержки флаг не получает.

alter table public.admin_users
  add column if not exists must_change_password boolean not null default false;

comment on column public.admin_users.must_change_password is
  'true — пароль выдан платформой (временный), до смены кабинет не открывается';

-- Частичный индекс: флаг поднят у единиц, полный индекс по булеву полю бесполезен.
create index if not exists admin_users_must_change_idx
  on public.admin_users (business_id)
  where must_change_password;
