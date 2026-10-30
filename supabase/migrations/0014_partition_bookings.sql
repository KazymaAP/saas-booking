-- 0014_partition_bookings.sql — партиционирование bookings по диапазону дат (ТЗ: 10000 тенантов, рост таблицы бронирований).
--
-- Зачем: как audit_log/license_pings (0006), таблица bookings при 10000 сервисов-детейленгов невыносимо разрастается.
-- RANGE-партиции по scheduled_at (по месяцам) дают partition pruning для самых горячих запросов
-- (busyForDay фильтрует по business_id + диапазону scheduled_at) и дешёвый retention в будущем (DROP партиции).
--
-- Ключ партиционирования: scheduled_at timestamptz NOT NULL (NOT NULL гарантирован 0001, NULL невозможен).
-- Первичный ключ становится композитным (id, scheduled_at) — на партиционированной таблице PK обязан
-- содержать ключ партиционирования.
--
-- План миграции данных (безопасный, идемпотентный):
--   1) переименовываем bookings → bookings_legacy;
--   2) создаём bookings_new (LIKE bookings_legacy — копируются ВСЕ колонки, NOT NULL, CHECK, DEFAULT),
--      PARTITION BY RANGE (scheduled_at);
--   3) создаём DEFAULT-партицию + месячные партиции от min(scheduled_at) до now+12 мес;
--   4) INSERT/SELECT переносит данные (маршрутизация по scheduled_at в нужную партицию, вне диапазона — в DEFAULT);
--   5) добавляем PK, FK (→ businesses, services), уникальные индексы, прочие индексы;
--   6) drop bookings_legacy, rename bookings_new → bookings;
--   7) возвращаем RLS-политики, триггер, права ролей, регистрируем автосоздание партиций в cron.
--
-- Учтённые зависимые объекты:
--   ▸ bookings → businesses (FK ON DELETE CASCADE) и → services (FK ON DELETE SET NULL): пересоздаём.
--   ▸ email_queue.booking_id и emails_outgoing.booking_id → bookings(id): НЕ пересоздаются (см. ниже «ВАЖНО»).
--   ▸ RLS-политики member_bookings_read, p_bookings_anon_ins; триггер trg_bookings_fill; права anon/authenticated.
--   ▸ ограничение bookings_no_overlap (EXCLUDE) — пересоздаётся по возможности, иначе пропускается (см. отчёт).
--
-- ВАЖНО (ограничение Postgres): на партиционированной таблице любой уникальный индекс/ограничение обязан
-- включать ключ партиционирования scheduled_at. Поэтому:
--   • bookings_slot_unique — частичный уникальный индекс (business_id, scheduled_at) WHERE status in ('new','confirmed')
--     уже содержит scheduled_at → пересоздаётся как есть;
--   • cancel_token (был уникален один) → теперь уникальный индекс (cancel_token, scheduled_at): глобальная
--     уникальность полагается на значение по умолчанию gen_random_uuid() (практически уникально);
--   • email_queue.booking_id ссылался на bookings(id) (один столбец, не уникален на партиционированной таблице)
--     → FK СНИМАЕТСЯ и не восстанавливается. Каскадное удаление email_queue при удалении брони теперь не работает
--     на уровне БД (брони и так не удаляются, только меняют status). Это задокументированный компромисс.
--
-- Прозрачность для кода: партиционирование невидимо для INSERT/SELECT по PK (id) и по ключу scheduled_at;
-- все запросы приложения фильтруют брони по scheduled_at, поэтому partition pruning работает (см. отчёт).

begin;

-- ============================================================================
-- Главный guard: если bookings уже партиционирована — пропускаем всё преобразование.
-- ============================================================================
do $$
begin
  if public.is_partitioned('bookings') then
    raise notice '0014: bookings уже партиционирована — преобразование пропущено.';
    return;
  end if;
end $$;

-- ============================================================================
-- Преобразование: выполняется ОДИН раз (защищено guard'ом выше).
-- ============================================================================
do $$
declare
  v_min       timestamptz;
  v_from      timestamptz;
  v_to        timestamptz;
  v_name      text;
  v_cur       date;
  v_end       date;
  v_has_rows  boolean;
  v_fk        record;
begin
  if public.is_partitioned('bookings') then
    return;
  end if;
  if to_regclass('public.bookings') is null then
    -- Грязное состояние после незавершённого прогона: bookings была переименована в bookings_legacy.
    -- Восстанавливаем (без потери данных) и продолжаем.
    if to_regclass('public.bookings_legacy') is not null then
      execute 'alter table public.bookings_legacy rename to bookings';
      execute 'drop table if exists public.bookings_new cascade';
      raise notice '0014: восстановлена bookings из bookings_legacy (откат незавершённого прогона).';
    end if;
    if to_regclass('public.bookings') is null then
      raise exception '0014: таблица bookings не найдена — миграция невозможна.';
    end if;
  end if;

  -- 1) Снимаем ВСЕ FK, ссылающиеся на bookings(id) (email_queue.booking_id, emails_outgoing.booking_id, …):
  --    иначе rename/drop legacy невозможны, а восстановить одиночный FK на партиционированной
  --    таблице нельзя (композитный PK). Документированный компромисс: каскадное удаление из
  --    дочерних таблиц при удалении брони больше не работает на уровне БД (брони не удаляются, только меняют status).
  for v_fk in (
    select c.conname as conname, t.relname as tablename
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_class r on r.oid = c.confrelid
    where c.contype = 'f' and r.relname = 'bookings'
  ) loop
    execute format('alter table public.%I drop constraint %I', v_fk.tablename, v_fk.conname);
    raise notice '0014: снят FK % (%.% → bookings): партиционированный PK композитный, одиночный FK невозможен.', v_fk.conname, v_fk.tablename, v_fk.conname;
  end loop;

  -- 2) Переименовываем текущую bookings в legacy (очищаем возможный недоделанный остаток).
  if to_regclass('public.bookings_legacy') is not null then
    execute 'drop table public.bookings_legacy';
  end if;
  alter table public.bookings rename to bookings_legacy;
  -- освобождаем имя PK для новой таблицы
  alter index if exists public.bookings_pkey rename to bookings_legacy_pkey;

  -- 3) Создаём партиционированную bookings_new. LIKE копирует ВСЕ колонки/ограничения/значения по умолчанию
  --    из legacy (важно: структура bookings менялась по миграциям 0001/0007 — LIKE копирует все колонки автоматически).
  --    INCLUDING INDEXES намеренно НЕ указан: PK/уникальные индексы создадим вручную (с учётом ключа партиции).
  execute 'create table if not exists public.bookings_new ('
    || 'like public.bookings_legacy including defaults including constraints including comments'
    || ') partition by range (scheduled_at)';

  -- 4) DEFAULT-партиция (страховка: вставка не упадёт, если cron не создал нужный месяц).
  if to_regclass('public.bookings_default') is null then
    execute 'create table public.bookings_default partition of public.bookings_new default';
    perform public.secure_partition('bookings_default');
  end if;

  -- 5) Месячные партиции от min(scheduled_at) до now + 12 месяцев (история + ближайший год).
  select min(scheduled_at) into v_min from public.bookings_legacy;
  if v_min is null then
    v_min := now();
  end if;
  v_cur := date_trunc('month', v_min)::date;
  v_end := (date_trunc('month', now()) + make_interval(months => 12))::date;
  while v_cur <= v_end loop
    v_from := v_cur::timestamptz;
    v_to   := (v_cur + interval '1 month')::timestamptz;
    v_name := format('bookings_%s', to_char(v_cur, 'YYYY_MM'));
    if to_regclass('public.' || v_name) is null then
      execute format(
        'create table public.%I partition of public.bookings_new for values from (%L) to (%L)',
        v_name, v_from, v_to);
      perform public.secure_partition(v_name);
    end if;
    v_cur := v_cur + interval '1 month';
  end loop;

  -- 6) Перенос данных (только если целевая таблица пуста — защита от повторного прогона).
  select (not exists (select 1 from public.bookings_new limit 1)) into v_has_rows;
  if v_has_rows then
    execute 'insert into public.bookings_new select * from public.bookings_legacy order by scheduled_at';
    raise notice '0014: данные перенесены из bookings_legacy в партиционированную bookings_new.';
  end if;

  -- 7) Первичный ключ (обязан содержать ключ партиционирования scheduled_at).
  alter table public.bookings_new add constraint bookings_pkey primary key (id, scheduled_at);

  -- 8) Внешние ключи bookings → businesses / services.
  alter table public.bookings_new
    add constraint bookings_business_fk foreign key (business_id) references businesses(id) on delete cascade;
  alter table public.bookings_new
    add constraint bookings_service_fk foreign key (service_id) references services(id) on delete set null;

  -- 9) Уникальные индексы (должны включать scheduled_at — ключ партиционирования).
  begin
    execute 'create unique index if not exists bookings_slot_unique '
      || 'on public.bookings_new (business_id, scheduled_at) '
      || 'where status in (''new'', ''confirmed'')';
  exception when others then
    raise warning '0014: bookings_slot_unique не создан: %', sqlerrm;
  end;

  begin
    execute 'create unique index if not exists bookings_cancel_token_unique '
      || 'on public.bookings_new (cancel_token, scheduled_at)';
  exception when others then
    raise warning '0014: bookings_cancel_token_unique не создан: %', sqlerrm;
  end;

  -- 10) Остальные индексы (ТЗ §4.51 + cron booking-reminders / unconfirmed-reminder).
  execute 'create index if not exists idx_bookings_business_scheduled on public.bookings_new (business_id, scheduled_at)';
  execute 'create index if not exists idx_bookings_business_status on public.bookings_new (business_id, status)';
  execute 'create index if not exists idx_bookings_scheduled_status on public.bookings_new (scheduled_at, status)';
  execute 'create index if not exists idx_bookings_service on public.bookings_new (service_id)';
  execute 'create index if not exists idx_bookings_rescheduled_from on public.bookings_new (rescheduled_from) where rescheduled_from is not null';
  execute 'create index if not exists idx_bookings_rescheduled_to on public.bookings_new (rescheduled_to) where rescheduled_to is not null';
  execute 'create index if not exists bookings_status_scheduled_idx on public.bookings_new (status, scheduled_at)';
  execute 'create index if not exists bookings_status_created_idx on public.bookings_new (status, created_at)';

  -- 11) Ограничение пересечения слотов (EXCLUDE). На партиционированных таблицах допустимо только при
  --     включении ключа партиционирования как равенства; создаём осторожно — при ошибке не прерываем миграцию.
  begin
    if not exists (select 1 from pg_constraint where conname = 'bookings_no_overlap') then
      if exists (
        select 1 from public.bookings_new a join public.bookings_new b
          on a.business_id = b.business_id and a.id < b.id
        where a.status in ('new', 'confirmed') and b.status in ('new', 'confirmed')
          and public.booking_range(a.scheduled_at, a.duration_at_booking)
              && public.booking_range(b.scheduled_at, b.duration_at_booking)
      ) then
        raise warning '0014: bookings_no_overlap не создан — есть пересекающиеся активные брони, разберите вручную.';
      else
        execute 'alter table public.bookings_new add constraint bookings_no_overlap exclude using gist ('
          || 'business_id with =, public.booking_range(scheduled_at, duration_at_booking) with &&'
          || ') where (status in (''new'', ''confirmed''))';
      end if;
    end if;
  exception when others then
    raise warning '0014: bookings_no_overlap не создан (вероятно, не поддерживается на партиционированной таблице): %', sqlerrm;
  end;

  -- 12) Удаляем legacy и подменяем имя.
  execute 'drop table public.bookings_legacy';
  execute 'alter table public.bookings_new rename to bookings';
  -- имя PK уже bookings_pkey (задано явно при add constraint).
  raise notice '0014: bookings теперь партиционирована по RANGE(scheduled_at).';
end $$;

-- ============================================================================
-- Идемпотентная часть: RLS, политики, триггер, индексы, права, cron.
-- Безопасна при повторном прогоне (IF NOT EXISTS / drop … if exists).
-- ============================================================================

-- RLS на родителе.
alter table public.bookings enable row level security;

-- Политика кабинета: владелец/менеджер видит только свои брони.
drop policy if exists member_bookings_read on public.bookings;
create policy member_bookings_read on public.bookings
  for select to authenticated using (public.is_business_member(business_id));

-- Публичная запись (§10.3): только новая бронь клиентского бизнеса, без служебных полей.
drop policy if exists p_bookings_anon_ins on public.bookings;
create policy p_bookings_anon_ins on public.bookings for insert with check (
  (select public.is_anon()) and business_id in (select public.public_business_ids())
  and status in ('new', 'confirmed') and cancelled_at is null and reminder_24h_sent_at is null
  and reminder_2h_sent_at is null and reschedule_count = 0 and privacy_accepted_at is not null);

-- Триггер заполнения снимков (функция bookings_fill_snapshot уже существует из 0007).
drop trigger if exists trg_bookings_fill on public.bookings;
create trigger trg_bookings_fill before insert or update on public.bookings
  for each row execute function public.bookings_fill_snapshot();

-- Права ролей PostgREST на bookings. БЕЗ массового revoke (он уже сделан в 0007), чтобы не снести права на другие таблицы.
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      continue;
    end if;
    execute format(
      'grant insert (business_id, client_name, client_phone, client_email, client_telegram, service_id, scheduled_at, comment, status, custom_fields, privacy_accepted_at, privacy_ip, privacy_version) on public.bookings to %I',
      v_role);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.bookings to authenticated;
    grant update (status, cancelled_at, cancelled_by, confirmed_at, completed_at, admin_comment) on public.bookings to authenticated;
  end if;
end $$;

-- Автосоздание будущих партиций (без удаления! у bookings нет политики очистки/retention).
-- Использует универсальную функцию create_monthly_partitions_for из 0008 (создаёт DEFAULT + 12 мес вперёд, RLS-блок).
insert into public.cron_registry (name, schedule, kind, command, timeout_ms) values
  ('create-bookings-partitions', '0 7 1 * *', 'sql', 'select public.create_monthly_partitions_for(''bookings'', 12)', 30000)
on conflict (name) do update
  set schedule = excluded.schedule, kind = excluded.kind, command = excluded.command,
      timeout_ms = excluded.timeout_ms, enabled = true, updated_at = now();

select public.cron_apply_registry();
-- Сразу создаём партиции на случай, если cron ещё не отработал (идемпотентно — существующие не трогаются).
select public.create_monthly_partitions_for('bookings', 12);

comment on table public.bookings is
  'Бронирования. Партиционирована по RANGE(scheduled_at) помесячно (с DEFAULT-партицией); PK (id, scheduled_at). Прямой доступ к партициям закрыт (RLS, только super_admin) — приложение ходит через родителя bookings.';

commit;
