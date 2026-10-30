-- 0013_data_requests_types.sql — расширение типов запросов субъекта ПД (зона 5, патч r1-0006_legal).
-- Код (lib/data-request.ts) принимает пять типов: access, correct, delete, withdraw, unsubscribe.
-- В 0007 ограничение разрешало только три, поэтому отзыв согласия и отписка через форму падали на CHECK.
-- Миграция не переписывает 0007 (она может быть уже применена): пересоздаёт ограничение и добавляет индекс
-- для контроля срока ответа. Идемпотентна.

alter table data_requests drop constraint if exists data_requests_type_check;
alter table data_requests add constraint data_requests_type_check
  check (type in ('access', 'correct', 'delete', 'withdraw', 'unsubscribe'));

-- Контроль срока ответа (10 рабочих дней): выборка открытых запросов по дате.
create index if not exists idx_data_requests_open on data_requests (created_at) where status = 'new';
