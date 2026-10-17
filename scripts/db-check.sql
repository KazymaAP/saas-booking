-- scripts/db-check.sql
-- Проверка схемы после миграций 0001–0007 (ТЗ §4, §4.49, §4.50, §10.2).
-- Только чтение: ничего не меняет, кроме временной таблицы сессии.
-- Запуск: DATABASE_URL=... bash scripts/db-check.sh
-- FAIL → psql выходит с ошибкой (ON_ERROR_STOP). WARN — информация, не ошибка.

create temp table _db_check (
  section text not null,
  name text not null,
  status text not null check (status in ('PASS', 'WARN', 'FAIL')),
  detail text
);

-- 1. Таблицы: 22 из 0001–0004 и недостающие по ТЗ §4 (0006, 0007).
insert into _db_check (section, name, status, detail)
select 'tables', r.name,
       case when to_regclass('public.' || r.name) is null then 'FAIL' else 'PASS' end,
       null
from (values
  ('vertical_templates'), ('businesses'), ('services'), ('photos'), ('bookings'),
  ('admin_users'), ('outreach_log'), ('emails_outgoing'), ('emails_incoming'),
  ('email_accounts'), ('templates'), ('settings'), ('licenses'), ('license_pings'),
  ('feature_flags'), ('audit_log'), ('business_telegram_codes'), ('business_requisites'),
  ('promo_codes'), ('pricing_plans'), ('rate_limits'), ('legacy_redirects'),
  ('business_holidays'), ('super_admins'), ('admin_invites'), ('templates_versions'),
  ('email_queue'), ('email_bounces'), ('email_attachments'), ('unsubscribes'),
  ('imap_state'), ('payments'), ('receipts'), ('code_archives'), ('telegram_messages'),
  ('notifications'), ('webhook_events'), ('app_logs'), ('jobs'), ('job_locks'),
  ('analytics_events'), ('leads'), ('data_requests'), ('support_tickets'),
  ('cookie_consents'), ('slug_locks')
) as r(name);

-- 2. Партиционирование по месяцам (ТЗ §4.50).
insert into _db_check (section, name, status, detail)
select 'partitions', v.name,
       case when exists (
         select 1 from pg_partitioned_table pt
         where pt.partrelid = to_regclass('public.' || v.name)
       ) then 'PASS' else 'FAIL' end,
       'RANGE по месяцам'
from (values ('audit_log'), ('license_pings'), ('app_logs'), ('analytics_events')) as v(name);

-- 3. RLS включён на всех таблицах и партициях (кроме дочерних партиций — у них RLS свой).
insert into _db_check (section, name, status, detail)
select 'rls', c.relname,
       case when c.relrowsecurity then 'PASS' else 'FAIL' end,
       null
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p');

-- 4. Политики RLS: у каждой основной таблицы есть хотя бы одна.
insert into _db_check (section, name, status, detail)
select 'rls_policies', c.relname,
       case when exists (select 1 from pg_policy p where p.polrelid = c.oid)
            then 'PASS' else 'FAIL' end,
       'нет политик — доступ только через service_role'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition;

-- 5. Права anon/authenticated: нет TRUNCATE/DELETE на чувствительных таблицах (0007).
insert into _db_check (section, name, status, detail)
select 'grants', t.name || ':' || r.role || ':' || p.priv,
       case when has_table_privilege(r.role, 'public.' || t.name, p.priv) then 'FAIL' else 'PASS' end,
       null
from (values ('businesses'), ('bookings'), ('audit_log'), ('licenses'), ('admin_users')) as t(name)
cross join (values ('anon'), ('authenticated')) as r(role)
cross join (values ('TRUNCATE'), ('DELETE')) as p(priv)
where exists (select 1 from pg_roles where rolname = r.role);

-- 6. Хелперы RLS и триггеров (0007, ТЗ §4.49).
insert into _db_check (section, name, status, detail)
select 'functions', v.name,
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v.name
       ) then 'PASS' else 'FAIL' end,
       null
from (values
  ('set_updated_at'), ('is_super_admin'), ('current_business'), ('is_anon'),
  ('is_business_member'), ('is_api_role'), ('booking_range'),
  ('create_monthly_partitions'), ('drop_old_partitions')
) as v(name);

-- rate_limit_hit: нужна lib/rate-limit.ts (атомарный путь). Без неё работает запасной путь.
insert into _db_check (section, name, status, detail)
select 'functions', 'rate_limit_hit',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'rate_limit_hit'
       ) then 'PASS' else 'WARN' end,
       'атомарный rate limit; без функции работает CAS-путь в lib/rate-limit.ts';

-- 7. Расширения.
insert into _db_check (section, name, status, detail)
select 'extensions', v.name,
       case when exists (select 1 from pg_extension e where e.extname = v.name)
            then 'PASS' else 'FAIL' end,
       null
from (values ('pgcrypto'), ('btree_gist')) as v(name);

-- 8. Брони: exclusion-констрейнт (ТЗ §10.2) и триггер снимка (duration/price/timezone).
insert into _db_check (section, name, status, detail)
select 'constraints', 'bookings_no_overlap',
       case when exists (
         select 1 from pg_constraint c
         where c.conname = 'bookings_no_overlap' and c.conrelid = to_regclass('public.bookings')
       ) then 'PASS' else 'FAIL' end,
       'EXCLUDE gist; конфликт → 23P01 (код обрабатывает 23505 и 23P01)';

insert into _db_check (section, name, status, detail)
select 'triggers', 'bookings_fill_snapshot',
       case when exists (
         select 1 from pg_trigger t
         where t.tgname = 'bookings_fill_snapshot' and not t.tgisinternal
           and t.tgrelid = to_regclass('public.bookings')
       ) then 'PASS' else 'FAIL' end,
       null;

-- 9. Триггеры updated_at на всех таблицах, где есть колонка updated_at.
insert into _db_check (section, name, status, detail)
select 'triggers', c.relname, 'WARN', 'колонка updated_at без триггера set_updated_at'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
  and not exists (
    select 1 from pg_trigger t
    where t.tgrelid = c.oid and not t.tgisinternal
      and t.tgfoid = to_regproc('public.set_updated_at')::oid
  );

-- 10. Деньги: numeric(10,2) (ТЗ, 0007).
insert into _db_check (section, name, status, detail)
select 'types', v.tbl || '.' || v.col,
       case when format_type(a.atttypid, a.atttypmod) = 'numeric(10,2)' then 'PASS' else 'FAIL' end,
       format_type(a.atttypid, a.atttypmod)
from (values
  ('services', 'price'), ('businesses', 'subscription_price'),
  ('promo_codes', 'discount_value'), ('pricing_plans', 'price_monthly'),
  ('pricing_plans', 'price_yearly')
) as v(tbl, col)
join pg_attribute a
  on a.attrelid = to_regclass('public.' || v.tbl) and a.attname = v.col and not a.attisdropped;

-- Итог.
select section, name, status, detail from _db_check order by section, status, name;
select status, count(*) as n from _db_check group by status order by status;

do $$
declare
  n int;
begin
  select count(*) into n from _db_check where status = 'FAIL';
  if n > 0 then
    raise exception 'db-check: FAIL = %', n;
  end if;
end
$$;

drop table _db_check;
