-- служебное/scripts/configure-cron.sql
-- Настройка pg_cron для платформы: без этих двух значений задачи планировщика падают каждую минуту
-- и пишут в audit_log «не заданы app.site_url / app.cron_secret».
--
-- КАК ПРИМЕНИТЬ
--   1. Supabase → SQL Editor → New query.
--   2. Замените значения ниже на свои (site_url — адрес продакшена, cron_secret — тот же,
--      что CRON_SECRET в переменных Vercel/окружения; взять можно так: `grep CRON_SECRET .env`).
--   3. Run. Затем выполните блок «ПРОВЕРКА» в конце файла.
--
-- ВАЖНО: файл не хранит секретов — он шаблон. Не коммитьте свои значения.

-- ===== 1. Значения для HTTP-вызовов из планировщика =====
-- ВНИМАНИЕ: `ALTER DATABASE postgres SET app.site_url = ...` НЕ работает на Supabase —
-- падает с `42501: permission denied to set parameter "app.site_url"` (кастомные GUC
-- запрещено ставить на уровне БД). Поэтому используем Supabase Vault: функция
-- public.cron_setting() (см. 0008_pg_cron.sql) читает Vault как запасной источник.
-- Имя секрета должно быть ровно 'site_url' и 'cron_secret' (совпадает с аргументом cron_setting).
select vault.create_secret('https://zapishisya.ru', 'site_url');
select vault.create_secret('ВСТАВЬТЕ_CRON_SECRET_ИЗ_ОКРУЖЕНИЯ', 'cron_secret');
-- Обновить существующий секрет:
--   select vault.update_secret(id, 'новое значение') from vault.secrets where name = 'site_url';

-- ЗАПАСНОЙ вариант (только если Vault недоступен и вызовы выше упали):
--   alter database postgres set app.site_url = 'https://zapishisya.ru';
--   alter database postgres set app.cron_secret = 'ВСТАВЬТЕ_CRON_SECRET_ИЗ_ОКРУЖЕНИЯ';

-- ===== 2. Проверка, что значения читаются функцией =====
-- Оба запроса должны вернуть непустые строки. Первый после ALTER может показать пусто
-- в текущей сессии — это нормально: новое значение подхватывают новые подключения (в т.ч. pg_cron).
select public.cron_setting('site_url')   as site_url;
select public.cron_setting('cron_secret') as cron_secret_is_set;  -- само значение не печатаем

-- ===== 3. Что запланировано и как отработало =====
select jobid, jobname, schedule, active
from cron.job
order by jobname;

-- Последние запуски: status = 'succeeded' — задача дошла до приложения.
-- В части версий pg_cron в job_run_details нет колонки jobname (есть только jobid) —
-- поэтому джойним с cron.job по jobid, чтобы не зависеть от версии.
select j.jobname, r.status, r.return_message, r.start_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
order by r.start_time desc
limit 20;

-- ===== 4. Ошибки планировщика в журнале (должно перестать расти) =====
select count(*) as errors_last_hour
from audit_log
where action = 'error:cron' and created_at > now() - interval '1 hour';

-- ===== 5. Разовая уборка накопленного шума (необязательно) =====
-- За сутки простоя сюда попало ~1800 одинаковых строк. Удаляем только их, ничего другого не трогаем.
-- delete from audit_log where action = 'error:cron' and created_at < now() - interval '1 day';

-- ===== Если задача «залипла» (active, но не выполняется) =====
-- select cron.unschedule('send-emails');   -- затем повторно применить 0008_pg_cron.sql
