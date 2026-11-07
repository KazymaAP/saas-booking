-- 0017_partners.sql — партнёрская программа (готовые сайт-визитки из шаблонов ниш).
-- Процесс: платформа готовит сайт-визитки из шаблонов под ниши и наполняет их данными
-- конкретных сервисов (partner_ready_sites). Партнёр (друг/знакомый) берёт ссылку на УЖЕ
-- готовый сайт нужной ниши, отправляет её предпринимателю и выставляет счёт (вариант
-- сделки). Предприниматель оплачивает через ЮKassa → готовый сайт активируется/передаётся
-- предпринимателю, партнёру начисляется вознаграждение.
-- Персональной реферальной ссылки с кодом партнёра НЕТ — партнёр работает с готовыми сайтами.
--
-- Три модели вознаграждения (partner_checkouts.variant):
--   subscription_5000 — предприниматель платит 5000₽/мес, партнёр получает 1000₽/мес (рекуррент).
--   code_5000        — предприниматель платит 5000₽ за сайт-визитку, партнёр 1000₽ разово.
--   custom           — партнёр назначает сумму X, платформа берёт 75%, партнёр 25% (разово).
--
-- Безопасность: RLS включён на все таблицы, прямых anon-политик нет (default deny).
-- Доступ из серверного кода идёт через service_role (adminClient), который обходит RLS;
-- изоляция партнёров обеспечивается на уровне кода (фильтрация по partner_id в lib/partners.ts).

-- ---------- партнёры (аккаунты друзей/знакомых) ----------
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  password_hash text not null,
  referral_code text not null unique,
  payout_method text,            -- 'card' | 'bank' | иное (для будущих выплат)
  payout_details text,           -- реквизиты (свои собственные, храним открыто v1)
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- готовые сайт-визитки (каталог, наполняется платформой) ----------
-- Каждый готовый сайт привязан к конкретному businesses (реальный сайт-визитка с данными
-- сервиса). Партнёр берёт preview_url и отправляет предпринимателю. При продаже сайт
-- помечается is_active=false / sold_at (один готовый сайт — один предприниматель).
create table if not exists partner_ready_sites (
  id uuid primary key default gen_random_uuid(),
  niche text not null,                 -- ниша/категория (для группировки в каталоге)
  title text not null,                 -- название готового сайта (для партнёра)
  slug text not null unique,           -- часть публичного URL: /s/<slug>
  business_id uuid references businesses(id) on delete set null,  -- сам сайт-визитка
  preview_url text,                    -- полная публичная ссылка на готовый сайт
  description text,
  is_active boolean not null default true,
  sold_at timestamptz,                 -- когда продан последний раз
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- лиды партнёра (база данных лидов) ----------
create table if not exists partner_leads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  name text,
  phone text,
  email text,
  message text,
  source text,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'refused')),
  referral_sent_at timestamptz,  -- когда партнёр отправил реф.ссылку/предложение
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- чекауты / счета на оплату предпринимателю ----------
create table if not exists partner_checkouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  ready_site_id uuid references partner_ready_sites(id) on delete set null,  -- готовый сайт из каталога
  business_id uuid references businesses(id) on delete set null,  -- заполняется при создании (из готового сайта) или при оплате
  variant text not null check (variant in ('subscription_5000', 'code_5000', 'custom')),
  amount numeric(10,2) not null check (amount >= 0),     -- что платит предприниматель
  partner_commission numeric(10,2) not null check (partner_commission >= 0),
  commission_type text not null check (commission_type in ('recurring_monthly', 'one_time')),
  entrepreneur_name text,
  entrepreneur_email text,
  entrepreneur_phone text,
  status text not null default 'draft' check (status in ('draft', 'awaiting_payment', 'paid', 'cancelled', 'expired')),
  yookassa_payment_id text,
  yookassa_confirmation_url text,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- начисления вознаграждений партнёру ----------
create table if not exists partner_earnings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  checkout_id uuid references partner_checkouts(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  amount numeric(10,2) not null check (amount >= 0),
  type text not null check (type in ('recurring_monthly', 'one_time')),
  status text not null default 'accrued' check (status in ('accrued', 'paid_out', 'cancelled')),
  period_start date,             -- для recurring_monthly: начало периода
  period_end date,               -- для recurring_monthly: конец периода
  next_accrual_at timestamptz,   -- для recurring_monthly: когда начислить следующий месяц
  paid_out_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- идемпотентное доведение существующих таблиц до текущей схемы ----------
-- Если таблицы уже созданы предыдущей (неполной) версией этой миграции —
-- например, запускались напрямую в SQL-редакторе Supabase, — то CREATE TABLE
-- IF NOT EXISTS выше их пропустит, и индексы ниже упадут с «column does not exist».
-- Явно добавляем недостающие колонки (nullable, без NOT NULL/UNIQUE, чтобы не
-- споткнуться на уже существующих строках). Повторный запуск абсолютно безопасен.
alter table partners add column if not exists email text;
alter table partners add column if not exists name text;
alter table partners add column if not exists password_hash text;
alter table partners add column if not exists referral_code text;
alter table partners add column if not exists payout_method text;
alter table partners add column if not exists payout_details text;
alter table partners add column if not exists status text default 'active';
alter table partners add column if not exists created_at timestamptz default now();
alter table partners add column if not exists updated_at timestamptz default now();

alter table partner_ready_sites add column if not exists niche text;
alter table partner_ready_sites add column if not exists title text;
alter table partner_ready_sites add column if not exists slug text;
alter table partner_ready_sites add column if not exists business_id uuid references businesses(id) on delete set null;
alter table partner_ready_sites add column if not exists preview_url text;
alter table partner_ready_sites add column if not exists description text;
alter table partner_ready_sites add column if not exists is_active boolean default true;
alter table partner_ready_sites add column if not exists sold_at timestamptz;
alter table partner_ready_sites add column if not exists created_at timestamptz default now();
alter table partner_ready_sites add column if not exists updated_at timestamptz default now();

alter table partner_leads add column if not exists partner_id uuid references partners(id) on delete cascade;
alter table partner_leads add column if not exists name text;
alter table partner_leads add column if not exists phone text;
alter table partner_leads add column if not exists email text;
alter table partner_leads add column if not exists message text;
alter table partner_leads add column if not exists source text;
alter table partner_leads add column if not exists status text default 'new';
alter table partner_leads add column if not exists referral_sent_at timestamptz;
alter table partner_leads add column if not exists created_at timestamptz default now();
alter table partner_leads add column if not exists updated_at timestamptz default now();

alter table partner_checkouts add column if not exists partner_id uuid references partners(id) on delete cascade;
alter table partner_checkouts add column if not exists ready_site_id uuid references partner_ready_sites(id) on delete set null;
alter table partner_checkouts add column if not exists business_id uuid references businesses(id) on delete set null;
alter table partner_checkouts add column if not exists variant text;
alter table partner_checkouts add column if not exists amount numeric(10,2);
alter table partner_checkouts add column if not exists partner_commission numeric(10,2);
alter table partner_checkouts add column if not exists commission_type text;
alter table partner_checkouts add column if not exists entrepreneur_name text;
alter table partner_checkouts add column if not exists entrepreneur_email text;
alter table partner_checkouts add column if not exists entrepreneur_phone text;
alter table partner_checkouts add column if not exists status text default 'draft';
alter table partner_checkouts add column if not exists yookassa_payment_id text;
alter table partner_checkouts add column if not exists yookassa_confirmation_url text;
alter table partner_checkouts add column if not exists paid_at timestamptz;
alter table partner_checkouts add column if not exists expires_at timestamptz;
alter table partner_checkouts add column if not exists created_at timestamptz default now();
alter table partner_checkouts add column if not exists updated_at timestamptz default now();

alter table partner_earnings add column if not exists partner_id uuid references partners(id) on delete cascade;
alter table partner_earnings add column if not exists checkout_id uuid references partner_checkouts(id) on delete set null;
alter table partner_earnings add column if not exists business_id uuid references businesses(id) on delete set null;
alter table partner_earnings add column if not exists amount numeric(10,2);
alter table partner_earnings add column if not exists type text;
alter table partner_earnings add column if not exists status text default 'accrued';
alter table partner_earnings add column if not exists period_start date;
alter table partner_earnings add column if not exists period_end date;
alter table partner_earnings add column if not exists next_accrual_at timestamptz;
alter table partner_earnings add column if not exists paid_out_at timestamptz;
alter table partner_earnings add column if not exists created_at timestamptz default now();

-- ---------- индексы ----------
create index if not exists idx_partner_leads_partner on partner_leads(partner_id);
create index if not exists idx_partner_leads_status on partner_leads(status);
create index if not exists idx_partner_checkouts_partner on partner_checkouts(partner_id);
create index if not exists idx_partner_checkouts_status on partner_checkouts(status);
create index if not exists idx_partner_checkouts_readysite on partner_checkouts(ready_site_id);
create index if not exists idx_partner_checkouts_yookassa on partner_checkouts(yookassa_payment_id);
create index if not exists idx_partner_earnings_partner on partner_earnings(partner_id);
create index if not exists idx_partner_earnings_status on partner_earnings(status);
create index if not exists idx_partner_earnings_next on partner_earnings(next_accrual_at);
create index if not exists idx_partner_ready_sites_active on partner_ready_sites(is_active);

-- ---------- RLS: доступ только через service_role (server code) ----------
alter table partners enable row level security;
alter table partner_leads enable row level security;
alter table partner_checkouts enable row level security;
alter table partner_earnings enable row level security;
alter table partner_ready_sites enable row level security;
-- Намеренно НЕ создаём anon/authenticated политики: прямой доступ из браузона запрещён,
-- вся работа идёт из server actions/route handlers под service_role (байпас RLS),
-- с фильтрацией по partner_id в коде lib/partners.ts.
