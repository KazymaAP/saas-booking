-- 0027_bookings_overlap_trigger.sql — запрет пересекающихся активных броней на партиционированной bookings.
--
-- Почему триггер, а не EXCLUDE-ограничение:
--   • 0007 создавал `bookings_no_overlap exclude using gist (business_id with =, booking_range(...) with &&)`
--     на обычной таблице — там ограничение работало;
--   • 0014 пересоздаёт bookings как `partition by range (scheduled_at)`. PostgreSQL требует, чтобы exclusion-
--     ограничение на партиционированной таблице включало ключ партиционирования простым столбцом с оператором
--     `=`; здесь scheduled_at входит только внутрь выражения booking_range(...) с `&&`, поэтому ограничение
--     не создаётся. 0014 ловит ошибку (`exception when others → raise warning`) и идёт дальше — значит на
--     боевой БД после 0014 ограничения нет;
--   • следствия до этой миграции: db-check.sql всегда показывал FAIL по bookings_no_overlap (постоянный FAIL
--     маскирует настоящий), код в app/api/bookings/route.ts и общие/lib/booking-actions.ts обрабатывал 23P01,
--     который не мог прийти, а два одновременных запроса на РАЗНЫЕ старты внутри одной услуги
--     (slot_step_minutes=30 при услуге 60 мин) оба проходили проверку слота — двойная бронь.
--
-- Триггер работает и на партиционированной таблице, и на обычной. Гонку убирает advisory-lock по business_id:
-- он берётся внутри транзакции вставки и держится до её конца, поэтому вторая транзакция ждёт и видит первую
-- бронь. Код ошибки — 23P01 (exclusion_violation): контракт с приложением не меняется, SLOT_CONFLICT_CODES
-- уже содержит его и отдаёт клиенту 409 slot_taken.
--
-- Окно поиска ±1 сутки: duration_at_booking ограничена 1440 минутами (bookings_duration_check из 0007),
-- поэтому бронь, начавшаяся раньше чем за сутки до новой, закончилась до её начала и пересечься не может.
-- Миграция идемпотентна.

create or replace function public.bookings_check_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration int;
begin
  -- Отменённые и завершённые брони место не занимают.
  if new.status not in ('new', 'confirmed') then
    return new;
  end if;

  -- duration_at_booking заполняет триггер trg_bookings_fill (0007). Если он ещё не сработал (порядок
  -- BEFORE-триггеров задаётся именем: fill < no_overlap, но полагаться на это не будем) — берём длительность
  -- услуги, иначе 60 минут, как в booking_range.
  v_duration := greatest(coalesce(
    new.duration_at_booking,
    (select s.duration_minutes from public.services s where s.id = new.service_id),
    60
  ), 1);

  -- Сериализация вставок одного бизнеса: без блокировки две транзакции обе увидят «свободно».
  perform pg_advisory_xact_lock(hashtextextended(new.business_id::text, 0));

  if exists (
    select 1
    from public.bookings b
    where b.business_id = new.business_id
      and b.id <> new.id
      and b.status in ('new', 'confirmed')
      and b.scheduled_at >= new.scheduled_at - interval '1 day'
      and b.scheduled_at <= new.scheduled_at + interval '1 day'
      and public.booking_range(b.scheduled_at, b.duration_at_booking)
          && public.booking_range(new.scheduled_at, v_duration)
  ) then
    raise exception 'slot_taken: пересечение с активной бронью' using errcode = '23P01';
  end if;

  return new;
end;
$$;

-- Функцию вызывает только триггер: прямой вызов через PostgREST не нужен ни одной роли.
revoke all on function public.bookings_check_overlap() from public, anon, authenticated;

drop trigger if exists trg_bookings_no_overlap on public.bookings;
create trigger trg_bookings_no_overlap
  before insert or update of scheduled_at, duration_at_booking, status, service_id on public.bookings
  for each row execute function public.bookings_check_overlap();

comment on function public.bookings_check_overlap() is
  'Запрет пересечения активных броней одного бизнеса (замена EXCLUDE-ограничения, несовместимого с партиционированием из 0014). Ошибка 23P01 → 409 slot_taken.';
