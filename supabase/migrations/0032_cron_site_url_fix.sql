-- 0032_cron_site_url_fix.sql — починка адреса, по которому pg_cron вызывает задачи.
--
-- Симптом: send-emails запускался каждую минуту со статусом succeeded, но письма не уходили.
-- В net._http_response — «Couldn't resolve host name»: cron_http_call собирал URL из
-- app.site_url, а там лежал ref проекта (https://oryzoexstuzgpbqvpjbr) вместо домена.
-- Ошибка была тихой: pg_net отправляет запрос fire-and-forget, поэтому в audit_log ничего не падало.
--
-- Что делает миграция: приводит site_url к боевому домену в обоих источниках, которые читает
-- public.cron_setting (current_setting → Vault). Значение не секрет, поэтому его можно хранить в git.
-- Секрет (app.cron_secret) по-прежнему задаётся вручную и в репозиторий не попадает.

-- 1. Основной источник: настройка на уровне базы (подхватывается новыми сессиями).
alter database postgres set app.site_url = 'https://www.zapishisya.ru';

-- 2. Запасной источник: Vault. Обновляем, если секрет есть, иначе создаём.
do $$
declare
  v_id uuid;
begin
  if to_regclass('vault.secrets') is null then
    raise notice 'vault недоступен — пропускаю обновление site_url';
    return;
  end if;

  select id into v_id from vault.secrets where name = 'site_url' limit 1;
  if v_id is null then
    perform vault.create_secret('https://www.zapishisya.ru', 'site_url');
  else
    perform vault.update_secret(v_id, 'https://www.zapishisya.ru');
  end if;
end;
$$;

-- 3. Самопроверка: если адрес всё ещё не тот — в лог попадёт явная ошибка, а не тишина.
do $$
declare
  v_site text := public.cron_setting('site_url');
begin
  if v_site is null or v_site not like 'https://%' then
    raise warning 'cron site_url всё ещё некорректен: %', coalesce(v_site, 'null');
  end if;
end;
$$;

-- Примечание: pg_cron переиспользует соединение воркера, поэтому уже открытая сессия может
-- сохранить старое значение до перезапуска. Проверка:
--   select public.cron_setting('site_url');            -- ожидаем https://www.zapishisya.ru
--   select status_code, error_msg from net._http_response order by created desc limit 5;
