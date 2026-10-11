-- 0002_lifecycle.sql — поля жизненного цикла, нужные cron-задачам (ТЗ §19, §25, §26, §32).
-- Дата отказа: нужна для архивации через 30 дней.
alter table businesses add column if not exists refused_at timestamptz;

-- ТЗ §32: при hard delete журнал рассылки сохраняется (без привязки к удалённому бизнесу).
alter table outreach_log alter column business_id drop not null;
alter table outreach_log drop constraint if exists outreach_log_business_id_fkey;
alter table outreach_log
  add constraint outreach_log_business_id_fkey foreign key (business_id) references businesses(id) on delete set null;

-- Аудит (§33): журнал действий админки, хранение 1 год.
create index if not exists audit_log_created_idx on audit_log (created_at);

-- Резервные копии (§35): приватный bucket для JSON-выгрузок.
insert into storage.buckets (id, name, public) values ('backups', 'backups', false)
  on conflict (id) do nothing;
