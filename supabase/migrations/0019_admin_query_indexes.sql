-- 0019_admin_query_indexes.sql — индексы под запросы супер-админки.
-- Все индексы аддитивные (if not exists) и не меняют данные: только ускоряют выборки.
-- Зачем: разделы «Журнал», «Поддержка» и «Лиды» фильтруют по статусу/действию и сортируют по дате.
-- На больших объёмах без составного индекса Postgres читает всю таблицу и сортирует её целиком.

-- Журнал: фильтр по действию + сортировка по времени (история рассылок, аудит по типу события).
create index if not exists idx_audit_log_action_created on audit_log (action, created_at desc);

-- Поддержка: очередь по статусу, новые сверху.
create index if not exists idx_support_tickets_status_created on support_tickets (status, created_at desc);

-- Лиды: список «свежие сверху» и фильтр по статусу.
create index if not exists idx_leads_created on leads (created_at desc);
create index if not exists idx_leads_status_created on leads (status, created_at desc);

-- Платежи: выручка за период по всем бизнесам (дашборд, финансы).
create index if not exists idx_payments_paid_at on payments (paid_at desc);

-- Записи: счётчики «сегодня»/«на 7 дней» по всей платформе.
create index if not exists idx_bookings_scheduled on bookings (scheduled_at desc);
