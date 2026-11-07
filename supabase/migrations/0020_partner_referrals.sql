-- 0020_partner_referrals.sql — второй уровень партнёрской программы.
--
-- Партнёр приводит партнёра: наставник получает 10% (настраивается) от начислений
-- приведённого партнёра. Платит платформа — из комиссии приведённого партнёра ничего
-- не вычитается, он получает свои деньги полностью.

-- 1. Кто привёл партнёра. Один уровень: у наставника свой referrer_id, дальше не идём.
alter table partners
  add column if not exists referrer_id uuid references partners(id) on delete set null;

create index if not exists idx_partners_referrer on partners(referrer_id);

-- 2. Новый тип начисления — бонус наставнику. Старый check не пропускал такие строки.
alter table partner_earnings drop constraint if exists partner_earnings_type_check;
alter table partner_earnings
  add constraint partner_earnings_type_check
  check (type in ('recurring_monthly', 'one_time', 'referral_bonus'));

-- 3. Быстрый поиск бонусов по наставнику.
create index if not exists idx_partner_earnings_type on partner_earnings(type, partner_id);

-- 4. Процент бонуса — в общих настройках (таблица settings, key/value).
--    Значение читается в общие/lib/referrals.ts; 10% — значение по умолчанию, если строки нет.
insert into settings (key, value)
values ('referral_percent', '{"percent": 10}'::jsonb)
on conflict (key) do nothing;
