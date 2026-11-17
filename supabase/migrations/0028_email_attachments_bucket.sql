-- 0028_email_attachments_bucket.sql — бакет `email` для вложений входящей почты.
--
-- Почему отдельная миграция: `общие/lib/inbox-store.ts` загружает вложения в bucket `email`
-- (константа ATTACHMENTS_BUCKET, путь `{folder}/{filename}`), но ни одна миграция его не создавала:
-- 0002 создаёт `backups`, 0003 — `photos` и `logos`. На новом проекте Supabase первый же IMAP-синк
-- письма с вложением падал на `storage upload: Bucket not found`, и сообщение не сохранялось.
--
-- Бакет приватный: доступ только через service_role (сервер), публичных URL нет.
-- Лимит 10 МБ совпадает с MAX_MESSAGE_BYTES (общие/lib/inbox-sync.ts) — вложение не может быть
-- больше целого письма, а письма крупнее 10 МБ синк пропускает.
-- Идемпотентно: существующий бакет не перезаписывается (вдруг его уже настроили вручную).

insert into storage.buckets (id, name, public, file_size_limit)
values ('email', 'email', false, 10485760)
on conflict (id) do nothing;
