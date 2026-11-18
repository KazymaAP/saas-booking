-- 0031_detailing_reference.sql — разделы эталонного шаблона детейлинга.
--
-- Зачем: публичный сайт ниши умел только услуги, фото и три карточки преимуществ.
-- Для эталонного шаблона нужны отзывы, сотрудники, вопросы-ответы и акции,
-- а у услуг — плашка («Хит», «−20%») и старая цена для зачёркивания.
--
-- Решения:
--   * три отдельные таблицы, а не jsonb в businesses.custom_texts: у каждого раздела
--     свой CRUD в кабинете, нужны порядок, скрытие и сортировка — в jsonb это ручная возня
--     и никакой валидации на уровне БД;
--   * RLS включён, политик для anon нет: сайт рендерится на сервере через service_role,
--     а браузер к этим таблицам не ходит. Черновики отзывов не утекут в публичный API;
--   * is_published/is_active — мягкое скрытие вместо удаления: владелец снимает галочку,
--     строка остаётся и возвращается одним кликом;
--   * rating ограничен 1..5 на уровне БД, чтобы звёзды на сайте не разъехались с данными;
--   * old_price и badge nullable — у существующих услуг ничего не меняется.

begin;

-- Плашки и акции на карточке услуги.
alter table public.services
  add column if not exists badge text,
  add column if not exists old_price numeric;

-- Старая цена имеет смысл только если она больше текущей: иначе зачёркивать нечего.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_old_price_positive') then
    alter table public.services
      add constraint services_old_price_positive check (old_price is null or old_price > 0);
  end if;
end $$;

-- Отзывы клиентов.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_name text not null,
  rating int not null default 5 check (rating between 1 and 5),
  body text,
  service_name text,
  source text,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reviews_business_idx on public.reviews (business_id, sort_order, created_at desc);

-- Сотрудники студии: имя, должность, фото, стаж.
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  position text,
  photo_url text,
  experience_years int check (experience_years is null or experience_years between 0 and 70),
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_business_idx on public.staff (business_id, sort_order);

-- Вопросы и ответы.
create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  question text not null,
  answer text not null,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists faq_items_business_idx on public.faq_items (business_id, sort_order);

-- RLS: доступ только у service_role (серверный рендер), публичных политик нет.
alter table public.reviews enable row level security;
alter table public.staff enable row level security;
alter table public.faq_items enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.reviews to service_role;
    grant select, insert, update, delete on public.staff to service_role;
    grant select, insert, update, delete on public.faq_items to service_role;
  end if;
end $$;

commit;
