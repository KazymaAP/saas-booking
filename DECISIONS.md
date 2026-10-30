# DECISIONS — saas-booking

Решения, принятые по умолчанию (ТЗ §0.2: «принимать разумный дефолт и фиксировать»), и отклонения кода от ТЗ 4.0.
Каждая запись: что решено, почему, где в коде. Текущее состояние работ — [PROGRESS.md](PROGRESS.md).

Обновлено: 2026-10-16 (по коду ветки `main` на 2026-10-13 и незакоммиченным изменениям рабочей копии).

## Оглавление

1. [Имя проекта и домен](#имя-проекта-и-домен)
2. [Инфраструктура](#инфраструктура)
3. [Архитектура](#архитектура)
4. [Данные](#данные)
5. [Уведомления и рассылка](#уведомления-и-рассылка)
6. [Версии и инструменты](#версии-и-инструменты)
7. [Отклонения от ТЗ 4.0](#отклонения-от-тз-40)
8. [Открытые риски](#открытые-риски)
9. [Отменённые решения](#отменённые-решения)

## Имя проекта и домен

| Решение | Почему | Где |
|---|---|---|
| Имя проекта — `saas-booking` | Совпадает с `package.json` и репозиторием | `package.json` → `name` |
| Домен сервиса задаётся `NEXT_PUBLIC_SITE_URL` | В коде и ТЗ встречаются `zapishisya.ru` и `servis-jade.ru` — это разные деплои одного кода | `lib/site.ts` |
| Основные хосты перечислены в коде | Middleware должен отличать домен сервиса от кастомных доменов клиентов. При смене домена правится и env, и `MAIN_HOSTS` | `lib/site.ts` → `MAIN_HOSTS` |

## Инфраструктура

| Решение | Почему | Где |
|---|---|---|
| Хостинг — Vercel, регион `lhr1` | Ближайший к Supabase `eu-west-2`, меньше задержка запросов к БД | `vercel.json` → `regions` |
| БД, Auth, Storage — Supabase | Один провайдер на три функции, без своего сервера | `lib/supabase.ts` |
| В `vercel.json` только ежедневные cron-задачи (10 шт.) | План Vercel Hobby разрешает запуск не чаще раза в сутки. Частые задачи (`send-emails`, `check-replies`, `booking-reminders`, `unconfirmed-reminder`) вызываются внешним планировщиком с `Bearer CRON_SECRET` | `vercel.json`, [DEPLOY.md](DEPLOY.md) |
| Бэкап — GitHub Actions, `pg_dump` раз в неделю | На Vercel нет `pg_dump`; runner Ubuntu бесплатен; артефакт хранится 60 дней | `.github/workflows/backup.yml`, секрет `SUPABASE_DB_URL` |
| Заготовки `DB_PROVIDER`, `STORAGE_PROVIDER`, `EMAIL_PROVIDER`, `HOSTING_PROVIDER`, `LEGAL_MODE`, `PAYMENT_METHOD` | Зарезервированы под миграцию на российскую инфраструктуру (ТЗ §22). Кодом пока не читаются | `.env.example` |

## Архитектура

| Решение | Почему | Где |
|---|---|---|
| Прототипы: `/preview/{slug}?token=<preview_token>`, `noindex`, без записи | Префикс `t` (шиномонтаж) не должен занимать `/t/`; прототип нельзя найти поиском | `app/preview/[slug]/page.tsx`, `middleware.ts` |
| Публичный сайт: `/{prefix}/{slug}`, префикс — из ниши | Читаемые адреса по нише (`/t/…`, `/b/…`) | `app/[prefix]/[slug]/page.tsx`, `vertical_templates.url_prefix` |
| Кастомный домен через rewrite в `/domain-site/by-domain/...` | Один маршрут обслуживает все домены; хост сопоставляется через `/api/resolve-domain` | `middleware.ts` |
| Почти все запросы — через `service_role` на сервере | Проще контролировать права в одном месте; RLS — второй рубеж при утечке anon-ключа | `lib/supabase.ts` → `adminClient()` |
| Права: `isSuperAdmin()` (почта из `SUPERADMIN_EMAILS`) и `currentOwner(slug)` (`admin_users`) | Супер-админов мало и они не меняются; владельцы привязаны к бизнесу | `lib/admin-session.ts`, `lib/owner-session.ts` |
| Rate limit — таблица `rate_limits` в Postgres | Serverless-инстансы не делят память, `Map` не работает | `lib/rate-limit.ts` |
| Слоты не хранятся, считаются на лету | Нет рассинхронизации при смене графика и длительности услуг | `lib/slots.ts`, `lib/availability.ts` |
| Защита от двойной брони — частичный уникальный индекс `bookings_slot_unique` | Проще exclusion constraint; достаточно при фиксированном шаге слотов | `0001_init.sql` |
| Service worker — один `/sw.js` на весь сервис | Минимальный PWA без Workbox (ТЗ §5.1); кэширует только навигацию, API и панели не кэширует | `app/sw.js/route.ts` |
| Манифест PWA — на каждый бизнес | Своё имя и цвет на иконке телефона | `app/[prefix]/[slug]/manifest.webmanifest/route.ts` |
| Карта и сжатие фото загружаются лениво | Leaflet и `browser-image-compression` не попадают в общий бандл | `components/MapLazy.tsx`, `photos/PhotoUploaderLazy.tsx` |
| `experimental.staleTimes` (30 / 180 с) | Мгновенный возврат «назад» в панелях | `next.config.mjs` |

## Данные

| Решение | Почему | Где |
|---|---|---|
| Статусы брони: `new`, `confirmed`, `cancelled`, `done`, `no_show` | ТЗ использует `new` и `confirmed`; остальные нужны для отмены и статистики | `0001_init.sql` |
| Флаги функций хранятся в `settings.feature_flags` | Одна таблица настроек вместо отдельной; таблица `feature_flags` создана, но не используется | `0004_features.sql` |
| Тарифы — в `settings.tariffs` (`basic` 1000 ₽, `pro` 2500 ₽), первая оплата 5000 ₽ | Цены меняются без деплоя | `0004_features.sql`, `/panel/clients` |
| Все миграции идемпотентны (`if not exists`, `on conflict do nothing`) | Повторный запуск в SQL Editor безопасен | `supabase/migrations/0001…0005` |
| Пароли ящиков шифруются AES-256-GCM ключом `ENCRYPTION_KEY` | Пароли приложений Yandex 360 не хранятся открыто | `lib/crypto.ts` |
| Журнал аудита чистится раз в месяц | Ограничение объёма БД на бесплатных планах | `/api/cron/cleanup-audit-log` |

## Уведомления и рассылка

| Решение | Почему | Где |
|---|---|---|
| Один Telegram-бот (`TELEGRAM_BOT_TOKEN`) на обе роли: бизнес-уведомления и команды оператора (`/stats`, `/health`, `/ping` — только из чата `TELEGRAM_CHAT_ID`) | Единый webhook `/api/telegram/webhook`, единый секрет `TELEGRAM_WEBHOOK_SECRET`; `TELEGRAM_BUSINESS_BOT_TOKEN` — опц. отдельный бот для бизнеса | [docs/telegram-setup.md](docs/telegram-setup.md) |
| Привязка Telegram владельца — кодом `BIZ-xxxxxx` | Без OAuth: владелец отправляет код боту | `business_telegram_codes`, `/api/telegram/webhook` |
| Почта — пул ящиков Yandex 360 с дневным лимитом | Распределение нагрузки и прогрев доменов; выбирается активный ящик с наименьшим `sent_today`, при исчерпании `daily_limit` письмо не уходит | `lib/notify.ts` → `pickAccount`, `email_accounts` |
| IMAP-параметры — из `email_accounts`, а не env | У каждого ящика свой сервер | `/api/cron/check-replies` |
| Трекинг: пиксель открытия и редирект кликов только на `SITE_URL` | Защита от open redirect | `/api/track/open`, `/api/track/click` |

## Версии и инструменты

| Решение | Почему | Где |
|---|---|---|
| Next.js 14.2.15, React 18.3.1 | ТЗ указывает Next 14; React 19 с ним не совместим на стабильной ветке | `package.json` |
| Node `24.x` в `engines` | Последний LTS, поддерживается Vercel. Ранее было «Node 20 LTS» (ТЗ §0.1) — заменено | `package.json` → `engines` |
| pnpm 10 | pnpm 9 падает на `pnpm-workspace.yaml` без `packages` (проверено) | `pnpm-workspace.yaml`, `.npmrc` |
| Без ORM, без shadcn | Supabase JS + Tailwind; меньше зависимостей | — |
| Формы — react-hook-form + zod | Одна схема валидации для клиента и сервера | `BookingForm.tsx`, API |
| Иконки — `@phosphor-icons/react` и inline SVG | — | `components/` |
| Автотестов нет; проверка — `typecheck`, `build`, `smoke-test.sh`, ручные сценарии | ТЗ §0.4: «Тесты — не пишем» | [TESTING.md](TESTING.md) |
| `tsx` не в зависимостях, скрипты запускаются через `npx tsx` | Удалён из devDependencies (см. `check-log.txt`) | `scripts/*.ts` |

## Отклонения от ТЗ 4.0

ТЗ 4.0 описывает целевую инфраструктуру (VPS, Docker, Postgres + Kysely, Better Auth, Redis, MinIO, Caddy).
Код работает на Vercel + Supabase — это состояние до миграции по ТЗ §22. Документация описывает факт.

| ТЗ 4.0 | Факт в коде | Решение |
|---|---|---|
| Домен `servis-jade.ru` | В коде `zapishisya.ru` | Через `NEXT_PUBLIC_SITE_URL` + `MAIN_HOSTS` |
| `/api/health` (§3.2) | Нет | `smoke-test.sh` проверяет и выдаёт `WARN` |
| `TELEGRAM_BIZ_SECRET` | `TELEGRAM_WEBHOOK_SECRET` (фолбэк `TELEGRAM_BIZ_SECRET`) | Документированы имена из кода; `TELEGRAM_ADMIN_WEBHOOK_SECRET`/`TELEGRAM_ADMIN_SECRET` удалены — один бот |
| Webhook отвечает 403 на неверный секрет | Отвечает 403 | Документирован 403 |
| Exclusion constraint на брони (§10.2) | Уникальный индекс | См. «Данные» |
| `/manifest.json` | `/{prefix}/{slug}/manifest.webmanifest` | Манифест на бизнес |
| SINGLE_TENANT, `scripts/build-single-tenant.ts` (§14.5) | Нет | [INSTALL.md](INSTALL.md) описывает фактический путь передачи |
| List-Unsubscribe, `/unsubscribe` (§9.5) | Нет | В [PROGRESS.md](PROGRESS.md#известные-проблемы) |
| Пауза 45 с между письмами, 3 повтора (§9.1) | Одно письмо за вызов, без повторов | Частота задаётся внешним планировщиком |

## Открытые риски

Приняты владельцем, не решены.

- **ФЗ-152, ст. 18 ч. 5.** Персональные данные граждан РФ должны храниться в РФ. Сейчас данные лежат в Supabase
  (`eu-west-2`) и Vercel. Решение владельца — «осознанный риск». Перенос — ТЗ §22, заготовка `DB_PROVIDER`.
- **Холодная email-рассылка (ФЗ «О рекламе», ст. 18).** Требует юридической проверки до запуска рассылки.
- **Секреты из архива разработки.** В исходном архиве был `.env.local` с реальными ключами. Ключи Supabase,
  `ENCRYPTION_KEY`, `CRON_SECRET` и токены ботов нужно перевыпустить до продакшна.

## Отменённые решения

| Было | Стало | Причина |
|---|---|---|
| «Vercel Pro, cron до раза в минуту» (2026-10-11) | Vercel Hobby, ежедневные cron + внешний планировщик | Коммиты `825f39f`, `98012c2` «only daily on Hobby» |
| «Node 20 LTS» | Node `24.x` | `package.json` → `engines` |
| «Статус сборки: tsc не запускался, следующие шаги — lib/…» | Код написан, `pnpm typecheck` и `pnpm build` проходят | `check-log.txt`, [PROGRESS.md](PROGRESS.md) |
