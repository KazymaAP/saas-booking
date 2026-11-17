-- 0025_customers.sql — кабинет клиента /{prefix}/{slug}/my (NEW-5, 2026-11-12).
-- Идемпотентно: IF NOT EXISTS / DROP ... IF EXISTS + CREATE. НЕ трогает миграции 0001–0024.
-- На live выполняется вручную в Supabase SQL Editor (см. DEPLOY.md) строго после 0024.

-- ---------- Таблица клиентов ----------
-- Один клиент привязан к бизнесу по (business_id, email). Запись лёгкая: кабинет /my читает
-- брони по customer_id через service_role, доступ к самой таблице закрыт policy USING (false).
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  email         text not null,
  name          text,
  phone         text,
  auth_user_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, email)
);

create index if not exists customers_business_id_idx on public.customers(business_id);
create index if not exists customers_business_email_idx on public.customers(business_id, email);
create index if not exists customers_auth_user_id_idx on public.customers(auth_user_id);

-- RLS: прямой доступ к таблице клиентов закрыт. Изоляция кабинета обеспечивается приложением
-- (customer_session: подписанный JWT, читается токен в server action, затем запрос по business_id).
alter table public.customers enable row level security;
drop policy if exists p_customers_deny on public.customers;
create policy p_customers_deny on public.customers for all using (false) with check (false);

-- ---------- bookings.customer_id ----------
-- Связь брони с клиентом. Колонка может отсутствовать на старых схемах — добавляем идемпотентно.
alter table public.bookings add column if not exists customer_id uuid;

-- Внешний ключ SET NULL: удаление клиента не разрушает историю броней.
alter table public.bookings drop constraint if exists bookings_customer_id_fkey;
alter table public.bookings
  add constraint bookings_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

create index if not exists bookings_customer_id_idx on public.bookings(customer_id);

-- ---------- businesses.require_client_registration ----------
-- Бизнес сам решает: обязательна ли регистрация клиента для онлайн-записи. По умолчанию — нет (добровольно).
alter table public.businesses add column if not exists require_client_registration boolean not null default false;

-- ---------- Доступ клиента к своим броням (defense-in-depth) ----------
-- Политика дремлет, пока на bookings не включён RLS. Если включить — клиент (auth_user_id) видит
-- только свои брони. Приложение читает брони через service_role и так обходит RLS.
drop policy if exists member_customer_bookings_read on public.bookings;
create policy member_customer_bookings_read on public.bookings
  for select using (
    customer_id in (
      select id from public.customers where auth_user_id = auth.uid()
    )
  );
