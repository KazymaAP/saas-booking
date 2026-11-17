-- 0029_bookings_anon_insert_lockdown.sql — убрать прямую вставку броней anon-ключом.
--
-- Что было: 0007 и 0014 разрешали anon INSERT в bookings (политика p_bookings_anon_ins) — «публичная
-- запись» из ТЗ §10.3. Приложение этой веткой не пользуется: единственный путь создания брони —
-- POST /api/bookings через service_role (adminClient), где есть rate limit 5/10 мин на IP, проверка слота
-- (рабочие часы, праздники, min_hours_before, max_days_ahead, буферы), уведомления владельцу и клиенту
-- и запись в audit_log. Браузерного клиента Supabase в проекте нет: publicClient() используется только
-- для Supabase Auth (вход по OTP), таблицы им не читаются и не пишутся.
--
-- Поэтому политика была мёртвой, но рабочей: с anon-ключом можно было напрямую (PostgREST) вставлять
-- брони в календарь любого публичного бизнеса, обходя лимиты и проверку слотов — в том числе на 03:00,
-- в праздник или в прошлое, — и занять все будущие слоты (отказ в обслуживании для реальных клиентов).
-- Уведомления при такой вставке не отправляются, то есть владелец узнал бы о мусоре только в кабинете.
--
-- Теперь INSERT в bookings доступен только service_role. Если когда-нибудь появится браузерная запись,
-- её нужно делать через /api/bookings, а не возвращать политику.
-- Идемпотентно.

drop policy if exists p_bookings_anon_ins on public.bookings;

-- 0014 выдавал права по колонкам: REVOKE без списка колонок их не снимает, поэтому повторяем список.
revoke insert (
  business_id, client_name, client_phone, client_email, client_telegram, service_id,
  scheduled_at, comment, status, custom_fields, privacy_accepted_at, privacy_ip, privacy_version
) on public.bookings from anon;

comment on policy member_bookings_read on public.bookings is
  'Владелец/менеджер видит брони своего бизнеса. Публичной вставки нет: запись только через POST /api/bookings (service_role), см. 0029.';
