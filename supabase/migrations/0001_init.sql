-- 0001_init.sql — схема по ТЗ 2.0, раздел 4.
-- Решения по умолчанию: прототипы /preview/{slug}; rate limit в Postgres (rate_limits).
-- RLS включён на всех таблицах. service_role обходит RLS (серверная логика).

create extension if not exists pgcrypto;

-- 4.1 vertical_templates
create table if not exists vertical_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  url_prefix text not null unique,
  description text,
  fields jsonb not null default '[]'::jsonb,
  default_services jsonb not null default '[]'::jsonb,
  default_texts jsonb not null default '{}'::jsonb,
  default_colors jsonb not null default '{}'::jsonb,
  blocks jsonb not null default '{}'::jsonb,
  show_demo_mode boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4.2 businesses
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  slug_history text[] not null default '{}',
  name text not null,
  description text,
  vertical_template_id uuid references vertical_templates(id),
  category text,
  address text, city text, region text, postal_code text,
  lat numeric, lng numeric,
  working_hours jsonb,
  slot_step_minutes int not null default 60,
  cancel_hours_before int not null default 3,
  min_hours_before int not null default 2,
  max_days_ahead int not null default 30,
  auto_confirm boolean not null default false,
  phones text[] not null default '{}',
  emails text[] not null default '{}',
  websites text[] not null default '{}',
  socials jsonb,
  rating numeric, reviews_count int,
  source_2gis_url text,
  logo_url text, favicon_url text,
  brand_color text not null default '#111111',
  status text not null default 'new' check (status in (
    'new','in_progress','preview_ready','approved','sent','viewed','replied',
    'client','refused','no_contact','archived','transferred_out','pending_deletion','deleted')),
  preview_url text,
  preview_token uuid unique,
  custom_domain text unique,
  plan text not null default 'basic',
  paid_initial_at timestamptz,
  plan_type text,
  subscription_price numeric,
  subscription_active boolean not null default false,
  subscription_until date,
  subscription_started_at timestamptz,
  support_until date,
  code_transferred_at timestamptz,
  license_id uuid,
  telegram_chat_id text,
  telegram_connected_at timestamptz,
  reply_text text,
  reply_received_at timestamptz,
  custom_texts jsonb,
  custom_blocks jsonb,
  oferta_accepted_at timestamptz,
  oferta_accepted_ip text,
  onboarding_completed_at timestamptz,
  deletion_scheduled_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists businesses_status_idx on businesses (status);
create index if not exists businesses_city_idx on businesses (city);
create index if not exists businesses_vertical_idx on businesses (vertical_template_id);
create index if not exists businesses_preview_token_idx on businesses (preview_token);

-- 4.3 services
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric not null default 0,
  duration_minutes int not null default 60,
  sort_order int not null default 0,
  is_active boolean not null default true
);
create index if not exists services_business_idx on services (business_id);

-- 4.4 photos
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  url text,
  alt text,
  sort_order int not null default 0,
  path text
);
create index if not exists photos_business_idx on photos (business_id);

-- 4.5 bookings
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_name text,
  client_phone text,
  client_email text,
  client_telegram text,
  service_id uuid references services(id) on delete set null,
  scheduled_at timestamptz not null,
  comment text,
  status text not null default 'new' check (status in ('new','confirmed','cancelled','done','no_show')),
  cancel_token uuid unique default gen_random_uuid(),
  cancelled_at timestamptz,
  cancelled_by text,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  privacy_accepted_at timestamptz,
  privacy_ip text,
  privacy_version text,
  created_at timestamptz not null default now()
);
-- защита от гонки: один слот — одна активная бронь
create unique index if not exists bookings_slot_unique
  on bookings (business_id, scheduled_at)
  where status in ('new', 'confirmed');

-- 4.6 admin_users
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text,
  role text not null default 'owner' check (role in ('owner','manager')),
  auth_user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists admin_users_auth_idx on admin_users (auth_user_id);

-- 4.7 outreach_log
create table if not exists outreach_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  channel text,
  template_id text,
  message text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  tracking_token text unique,
  email_account_id uuid,
  status text
);

-- 4.8 emails_outgoing
create table if not exists emails_outgoing (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  outreach_log_id uuid references outreach_log(id) on delete set null,
  from_email text, to_email text,
  subject text, body_text text, body_html text,
  sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz,
  status text not null default 'sent'
);

-- 4.9 emails_incoming
create table if not exists emails_incoming (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  from_email text, to_email text, subject text, body_text text,
  received_at timestamptz,
  is_read boolean not null default false,
  thread_id text
);

-- 4.10 email_accounts (пароль SMTP хранится только в зашифрованном виде, AES-256-GCM)
create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  smtp_host text, smtp_port int,
  smtp_user text, smtp_pass_encrypted text,
  imap_host text, imap_port int,
  daily_limit int not null default 50,
  sent_today int not null default 0,
  last_reset date,
  active boolean not null default true
);

-- 4.11 templates
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  channel text, name text, subject text, body text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4.12 settings
create table if not exists settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

-- 4.13 licenses
create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null unique default gen_random_uuid(),
  business_id uuid references businesses(id) on delete set null,
  domain text,
  allowed_domains text[] not null default '{}',
  issued_at timestamptz not null default now(),
  revoked boolean not null default false,
  notes text
);

-- 4.14 license_pings
create table if not exists license_pings (
  id uuid primary key default gen_random_uuid(),
  license_id uuid,
  domain text, version text,
  ip text, user_agent text, status text,
  pinged_at timestamptz not null default now()
);

-- 4.15 feature_flags
create table if not exists feature_flags (
  key text primary key,
  enabled boolean not null default false
);

-- 4.16 audit_log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text, entity text, entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- 4.17 business_telegram_codes
create table if not exists business_telegram_codes (
  code text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- 4.18 business_requisites
create table if not exists business_requisites (
  business_id uuid primary key references businesses(id) on delete cascade,
  legal_name text, inn text, legal_address text,
  contact_email text, contact_phone text,
  updated_at timestamptz not null default now()
);

-- 4.19 promo_codes (схема без UI, по ТЗ)
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text, discount_value numeric,
  max_uses int, used_count int not null default 0,
  valid_until date, is_active boolean not null default true
);

-- 4.20 pricing_plans (схема без UI, по ТЗ)
create table if not exists pricing_plans (
  id uuid primary key default gen_random_uuid(),
  name text,
  price_monthly numeric, price_yearly numeric,
  features jsonb, is_active boolean not null default true
);

-- Решение по умолчанию: rate limit в Postgres (serverless-инстансы не делят память)
create table if not exists rate_limits (
  bucket text primary key,        -- например 'booking:<ip>'
  window_start timestamptz not null,
  hits int not null default 0
);

-- Хелпер: состоит ли текущий auth-пользователь в бизнесе
create or replace function is_business_member(b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from admin_users au
    where au.business_id = b and au.auth_user_id = auth.uid()
  );
$$;

-- ===== RLS =====
alter table vertical_templates enable row level security;
alter table businesses enable row level security;
alter table services enable row level security;
alter table photos enable row level security;
alter table bookings enable row level security;
alter table admin_users enable row level security;
alter table outreach_log enable row level security;
alter table emails_outgoing enable row level security;
alter table emails_incoming enable row level security;
alter table email_accounts enable row level security;
alter table templates enable row level security;
alter table settings enable row level security;
alter table licenses enable row level security;
alter table license_pings enable row level security;
alter table feature_flags enable row level security;
alter table audit_log enable row level security;
alter table business_telegram_codes enable row level security;
alter table business_requisites enable row level security;
alter table promo_codes enable row level security;
alter table pricing_plans enable row level security;
alter table rate_limits enable row level security;

-- anon: публичные данные клиентских сайтов
drop policy if exists anon_read_vertical_templates on vertical_templates;
drop policy if exists anon_read_client_businesses on businesses;
drop policy if exists anon_read_services on services;
drop policy if exists anon_read_photos on photos;
create policy anon_read_vertical_templates on vertical_templates
  for select to anon using (is_active);
create policy anon_read_client_businesses on businesses
  for select to anon using (status = 'client');
create policy anon_read_services on services
  for select to anon using (
    is_active and exists (select 1 from businesses b where b.id = services.business_id and b.status = 'client'));
create policy anon_read_photos on photos
  for select to anon using (exists (select 1 from businesses b where b.id = photos.business_id and b.status = 'client'));

-- authenticated: только свои бизнесы (владелец и менеджер)
drop policy if exists member_read_business on businesses;
drop policy if exists member_update_business on businesses;
drop policy if exists member_services on services;
drop policy if exists member_photos on photos;
drop policy if exists member_bookings_read on bookings;
drop policy if exists member_admin_users_read on admin_users;
create policy member_read_business on businesses
  for select to authenticated using (is_business_member(id));
create policy member_update_business on businesses
  for update to authenticated using (is_business_member(id)) with check (is_business_member(id));
create policy member_services on services
  for all to authenticated using (is_business_member(business_id)) with check (is_business_member(business_id));
create policy member_photos on photos
  for all to authenticated using (is_business_member(business_id)) with check (is_business_member(business_id));
create policy member_bookings_read on bookings
  for select to authenticated using (is_business_member(business_id));
create policy member_admin_users_read on admin_users
  for select to authenticated using (auth_user_id = auth.uid());

-- Остальные таблицы (бронирования на запись, почта, биллинг, лицензии, логи,
-- рассылка, settings, rate_limits) для anon и authenticated закрыты полностью:
-- без политик RLS они недоступны, доступ только через service_role на сервере.
