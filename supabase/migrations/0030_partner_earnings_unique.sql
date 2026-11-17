-- 0030_partner_earnings_unique.sql — идемпотентность начислений партнёрам.
--
-- Проблема: вебхук ЮKassa при таймауте приходит повторно, а markCheckoutPaid ставит
-- status='paid' последним шагом. Два параллельных обработчика (или ретрай после сбоя между
-- вставкой начисления и сменой статуса) успевают вставить комиссию дважды — партнёр получает
-- 2 000 ₽ вместо 1 000 ₽. В коде проверки «уже начислено» нет: вставка идёт без условия.
--
-- Решение: уникальность на уровне БД.
--   * разовое начисление — одно на пару (партнёр, счёт). Ключ включает partner_id, потому что
--     по тому же счёту наставник получает отдельный бонус (type='one_time', другой partner_id);
--     уникальность только по checkout_id заблокировала бы его;
--   * ежемесячное — одно на (партнёр, счёт, начало периода): повторный запуск за тот же месяц
--     не создаёт вторую строку, а следующий месяц проходит с другим period_start.
--
-- Если в базе уже есть дубли (следствие старого поведения), создание индекса упадёт с 23505 —
-- это сигнал разобрать начисления вручную, а не молча оставить двойную выплату.

begin;

create unique index if not exists partner_earnings_once_per_checkout
  on public.partner_earnings (partner_id, checkout_id)
  where type = 'one_time' and checkout_id is not null;

create unique index if not exists partner_earnings_once_per_period
  on public.partner_earnings (partner_id, checkout_id, period_start)
  where type = 'recurring_monthly' and checkout_id is not null and period_start is not null;

-- Платёж по партнёрскому счёту — один на чекаут: в note записан его id.
-- Без этого повторный вебхук задваивал бы выручку в отчётах админки.
create unique index if not exists payments_partner_checkout_once
  on public.payments (note)
  where note like 'Партнёрский чекаут %';

commit;
