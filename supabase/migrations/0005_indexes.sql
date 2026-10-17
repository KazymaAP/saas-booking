-- 0005_indexes.sql — индексы под реальные запросы приложения (ТЗ 4.0 §4.51). Идемпотентно (if not exists).
-- Источник: grep по .eq/.in/.lt/.order/.contains/.like в app/** и lib/** (карта — agent-1-db/notes.md).
-- Правило составных индексов: сначала равенство, потом диапазон/сортировка.
-- Индексы партиционированных таблиц (audit_log, license_pings, app_logs, analytics_events) — в 0006.
begin;

-- ===== Дубли и избыточные индексы (покрыты UNIQUE или составными индексами ниже) =====
-- preview_token: UNIQUE(preview_token) уже даёт btree-индекс businesses_preview_token_key.
drop index if exists businesses_preview_token_idx;
-- services(business_id) — префикс idx_services_business_active_sort.
drop index if exists services_business_idx;
-- photos(business_id) — префикс idx_photos_business_sort.
drop index if exists photos_business_idx;
-- businesses(status) — префикс idx_businesses_status_city.
drop index if exists businesses_status_idx;
-- admin_users(auth_user_id) заменён составным (auth_user_id, business_id) ниже.
drop index if exists admin_users_auth_idx;

-- ===== admin_users =====
-- Права владельца/менеджера: eq(business_id).eq(auth_user_id) на каждом запросе кабинета; покрывает FK business_id.
create index if not exists idx_admin_users_business_auth on admin_users (business_id, auth_user_id);
-- is_business_member() и member_admin_users_read: поиск по auth_user_id.
create index if not exists idx_admin_users_auth_business on admin_users (auth_user_id, business_id);

-- ===== services / photos =====
-- Публичный сайт: активные услуги бизнеса по порядку; покрывает FK business_id.
create index if not exists idx_services_business_active_sort on services (business_id, is_active, sort_order);
-- Галерея по порядку; покрывает FK business_id.
create index if not exists idx_photos_business_sort on photos (business_id, sort_order);

-- ===== bookings =====
-- Кабинет и занятость дня: eq(business_id).in(status).gte/lt(scheduled_at); покрывает FK business_id.
create index if not exists idx_bookings_business_scheduled on bookings (business_id, scheduled_at);
-- ТЗ §4.51: bookings(business_id, status) — счётчики кабинета по статусам.
create index if not exists idx_bookings_business_status on bookings (business_id, status);
-- ТЗ §4.51 + cron booking-reminders / unconfirmed-reminder: in(status).gte/lt(scheduled_at).
create index if not exists idx_bookings_scheduled_status on bookings (scheduled_at, status);
-- FK services(id) on delete set null: без индекса удаление услуги — seq scan по броням.
create index if not exists idx_bookings_service on bookings (service_id);

-- ===== businesses =====
-- Воронка и списки: eq(status) [+ eq(city)]; покрывает и одиночный фильтр по status.
create index if not exists idx_businesses_status_city on businesses (status, city);
-- Список /panel/businesses и экспорт: order(created_at desc) + range().
create index if not exists idx_businesses_created on businesses (created_at desc);
-- Поиск по названию (ТЗ §4.51): btree — для равенства/сортировки; ilike('name','%q%') в /panel/businesses
-- btree не использует, поэтому дополнительно trigram GIN (pg_trgm есть в Supabase и в contrib PG16).
create extension if not exists pg_trgm;
create index if not exists idx_businesses_name on businesses (name);
create index if not exists idx_businesses_name_trgm on businesses using gin (name gin_trgm_ops);
-- GIN на массивах (.contains): старые slug-и (business.ts, generate.ts), дедупликация импорта 2GIS по телефону,
-- сопоставление входящих писем по email и сайту (check-replies).
create index if not exists idx_businesses_slug_history on businesses using gin (slug_history);
create index if not exists idx_businesses_phones on businesses using gin (phones);
create index if not exists idx_businesses_emails on businesses using gin (emails);
create index if not exists idx_businesses_websites on businesses using gin (websites);
-- Дедупликация импорта: eq(source_2gis_url); partial — у большинства ручных записей null.
create index if not exists idx_businesses_source_2gis on businesses (source_2gis_url) where source_2gis_url is not null;
-- Cron подписок: eq(subscription_active, true).lte/lt(subscription_until).
create index if not exists idx_businesses_subscription_until on businesses (subscription_until) where subscription_active;
-- Cron process-deletions: eq(status,'pending_deletion').lt(deletion_scheduled_at).
create index if not exists idx_businesses_deletion on businesses (deletion_scheduled_at) where status = 'pending_deletion';
-- Cron archive-refused: eq(status,'refused').lt(refused_at).
create index if not exists idx_businesses_refused on businesses (refused_at) where status = 'refused';
-- Cron поддержки после передачи кода: not(code_transferred_at is null).lt(support_until).
create index if not exists idx_businesses_support_until on businesses (support_until) where code_transferred_at is not null;

-- ===== outreach_log =====
-- По бизнесу с последними отправками (карточка бизнеса: order(sent_at desc).limit(10)); покрывает FK business_id.
drop index if exists idx_outreach_log_business;
create index if not exists idx_outreach_log_business_sent on outreach_log (business_id, sent_at desc);
-- Очередь send-emails: eq(status,'queued').order(id).limit(1) — маленький partial-индекс.
create index if not exists idx_outreach_log_queued on outreach_log (id) where status = 'queued';
-- FK email_account_id (добавляется в 0007).
create index if not exists idx_outreach_log_email_account on outreach_log (email_account_id);

-- ===== emails_outgoing =====
-- follow-up: eq(business_id).order(sent_at desc).limit(3); покрывает FK business_id.
drop index if exists idx_emails_outgoing_business;
create index if not exists idx_emails_outgoing_business_sent on emails_outgoing (business_id, sent_at desc);
-- track/open, track/click: update ... eq(outreach_log_id); FK on delete set null.
create index if not exists idx_emails_outgoing_outreach on emails_outgoing (outreach_log_id);
-- ТЗ §4.51: поиск по sent_at (статистика, retention).
create index if not exists idx_emails_outgoing_sent on emails_outgoing (sent_at);

-- ===== emails_incoming =====
-- FK business_id (был без индекса) + inbox по бизнесу.
create index if not exists idx_emails_incoming_business on emails_incoming (business_id);
-- Inbox: order(received_at desc).
create index if not exists idx_emails_incoming_received on emails_incoming (received_at desc);
-- Счётчик непрочитанных — partial.
create index if not exists idx_emails_incoming_unread on emails_incoming (received_at desc) where not is_read;
-- ТЗ §4.19: треды.
create index if not exists idx_emails_incoming_thread on emails_incoming (thread_id);

-- ===== licenses =====
-- /panel/licenses: order(issued_at desc).
create index if not exists idx_licenses_issued on licenses (issued_at desc);
-- FK business_id on delete set null.
create index if not exists idx_licenses_business on licenses (business_id);

-- ===== templates =====
-- /panel/templates и воронка: order(created_at desc).
create index if not exists idx_templates_created on templates (created_at desc);
-- ТЗ §4.14: templates(channel, active).
create index if not exists idx_templates_channel on templates (channel, active);

-- ===== business_telegram_codes =====
-- FK business_id (был без индекса) + последний неиспользованный код: eq(business_id).is(used_at,null).order(created_at desc).
create index if not exists idx_telegram_codes_business on business_telegram_codes (business_id, created_at desc) where used_at is null;
create index if not exists idx_telegram_codes_business_all on business_telegram_codes (business_id);

-- ===== rate_limits =====
-- Очистка старых окон (cron cleanup) по window_start.
create index if not exists idx_rate_limits_window on rate_limits (window_start);

commit;
