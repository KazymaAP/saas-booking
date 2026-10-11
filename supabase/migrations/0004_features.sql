-- 0004_features.sql — поля и таблицы для оставшихся функций ТЗ. Идемпотентно.

-- SSL кастомного домена (§51): pending | active | error
alter table businesses add column if not exists ssl_status text not null default 'pending';

-- История версий шаблонов писем (§5.4 /panel/templates, версионирование)
alter table templates add column if not exists version int not null default 1;
alter table templates add column if not exists history jsonb not null default '[]'::jsonb;

-- Редиректы со старых доменов legacy-клиентов (§53)
create table if not exists legacy_redirects (
  from_domain text primary key,
  to_url text not null,
  created_at timestamptz not null default now()
);
alter table legacy_redirects enable row level security;

-- Ключи настроек платформы (тарифы, прайс по умолчанию, rate limit, feature flags) — таблица settings уже есть.
insert into settings (key, value) values
  ('tariffs', '{"basic":{"name":"Базовый","price":1000},"pro":{"name":"Про","price":2500}}'::jsonb),
  ('default_price', '{"initial":5000,"monthly":1000}'::jsonb),
  ('rate_limits', '{"booking_per_10min":5,"cancel_per_15min":10}'::jsonb),
  ('feature_flags', '{"ai_assistant":false,"telegram_clients":false}'::jsonb)
on conflict (key) do nothing;
