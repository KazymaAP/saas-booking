-- 0018_ready_services.sql — готовые сайты-визитки из данных парсера + раздача партнёрам.
-- Поток: админ загружает выгрузку парсера (leads.json / .jsonl / outreach.csv / .xlsx) →
-- строки попадают в ready_services (draft) с категорией (full / no_photos / no_services /
-- no_template) → админ генерирует сайты по нише+категории (создаётся businesses + services +
-- photos, ссылка /{ниша}/{slug}) → админ одобряет → партнёр видит в таблице, берёт (макс 5
-- в процессе), пишет предпринимателю, ставит категорию «написал» либо по истечении 3 дней
-- отмечает «отказался»/«не ответил»; сервис возвращается в таблицу с счётчиком попыток.
--
-- RLS: только service_role (server code), как в 0017.

create table if not exists ready_services (
  id uuid primary key default gen_random_uuid(),
  niche text not null,                 -- slug темы: detailing, beauty, dentist...
  name text not null,
  slug text not null,                  -- для /{niche}/{slug}
  business_id uuid references businesses(id) on delete set null,
  phone text,
  email text,
  address text,
  city text,
  category text not null default 'new' check (category in ('new', 'full', 'no_photos', 'no_services', 'no_template')),
  source text not null default 'upload' check (source in ('parser', 'upload', 'manual')),
  payload jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  assigned_partner_id uuid references partners(id) on delete set null,
  assignment_status text not null default 'available' check (assignment_status in ('available', 'in_process', 'written')),
  taken_at timestamptz,
  refusal_count integer not null default 0,
  no_answer_count integer not null default 0,
  last_outcome text check (last_outcome in ('refused', 'no_answer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (niche, slug)
);
create index if not exists idx_ready_services_status on ready_services(status, assignment_status);
create index if not exists idx_ready_services_partner on ready_services(assigned_partner_id);
create index if not exists idx_ready_services_niche on ready_services(niche);

-- ---------- сообщения партнёрам от админа ----------
create table if not exists partner_messages (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  body text not null,
  from_admin boolean not null default true,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_partner_messages_partner on partner_messages(partner_id, created_at desc);

-- ---------- выплаты/бонусы/корректировки баланса партнёра ----------
-- amount > 0 — начислили (бонус), amount < 0 — выплатили/списали.
create table if not exists partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  amount numeric(12,2) not null,
  kind text not null default 'adjust' check (kind in ('bonus', 'payout', 'adjust')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_partner_payouts_partner on partner_payouts(partner_id, created_at desc);

alter table ready_services enable row level security;
alter table partner_messages enable row level security;
alter table partner_payouts enable row level security;
-- Намеренно без anon-политик: доступ только через service_role (adminClient) в server code.
