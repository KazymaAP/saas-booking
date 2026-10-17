# ARCHITECTURE — saas-booking

Документ описывает фактическое устройство кода в ветке `main` (версия `0.1.0`): Next.js 14 на Vercel + Supabase.
Целевая архитектура из ТЗ 4.0 (VPS, Postgres + Kysely, Better Auth, Redis, MinIO) описана в разделе
[«Отличия от ТЗ 4.0»](#отличия-от-тз-40).

## Оглавление

1. [Общая схема](#общая-схема)
2. [Карта проекта](#карта-проекта)
3. [Роли и доступ](#роли-и-доступ)
4. [Маршрутизация](#маршрутизация)
5. [Потоки данных](#потоки-данных)
6. [Схема БД](#схема-бд)
7. [Основные компоненты](#основные-компоненты)
8. [Cron-задачи](#cron-задачи)
9. [Безопасность](#безопасность)
10. [Технологический стек](#технологический-стек)
11. [Отличия от ТЗ 4.0](#отличия-от-тз-40)

## Общая схема

```
                       ┌──────────────────────── Vercel (регион lhr1) ────────────────────────┐
 Браузер клиента ─────▶│ middleware.ts  →  App Router (RSC, server actions, route handlers)    │
 Браузер владельца ───▶│                     │                    │                          │
 Браузер оператора ───▶│                     ▼                    ▼                          │
 Telegram (webhook) ──▶│             lib/supabase.ts        lib/notify.ts                    │
 Vercel Cron ─────────▶│        (service_role, сервер)   (nodemailer, Telegram Bot API)      │
                       └─────────────────────┬────────────────────┬──────────────────────────┘
                                             ▼                    ▼
                           Supabase: Postgres + Auth + Storage   Yandex 360 SMTP/IMAP, api.telegram.org,
                           (RLS на всех таблицах)                 api.vercel.com (домены)
GitHub Actions (backup.yml) ── pg_dump раз в неделю ──▶ Supabase Postgres
```

Принципы:

- **Одна кодовая база, одна БД.** Каждый бизнес — строка `businesses`; сайт, кабинет и брони различаются по `business_id`.
- **Серверный доступ к данным.** Почти все запросы идут через `adminClient()` (ключ `service_role`, обходит RLS).
  Права проверяются в коде: `isSuperAdmin()` и `currentOwner(slug)`. RLS — второй рубеж на случай утечки anon-ключа.
- **Без фоновых процессов.** Вся периодическая работа — HTTP-эндпоинты `/api/cron/*`, которые вызывает Vercel Cron
  или внешний планировщик с заголовком `Authorization: Bearer <CRON_SECRET>`.
- **Слоты не хранятся.** Свободное время считается на лету из `working_hours`, длительности услуги и активных броней.

## Карта проекта

```
saas-booking/
├── middleware.ts                 кастомные домены → /domain-site, лицензия → /blocked, security headers, noindex превью
├── app/
│   ├── layout.tsx, globals.css   корневой макет, шрифты, классы панелей (.panel-shell, .btn-primary, .input)
│   ├── page.tsx                  лендинг сервиса
│   ├── [prefix]/[slug]/
│   │   ├── page.tsx              публичный сайт бизнеса (StudioTemplate + BookingForm + JSON-LD)
│   │   ├── BookingForm.tsx       форма записи (client component)
│   │   ├── SwRegister.tsx        регистрация service worker
│   │   ├── manifest.webmanifest/ PWA-манифест бизнеса
│   │   ├── booking/cancel/[token]/, booking/reschedule/[token]/   отмена и перенос клиентом
│   │   └── panel/                кабинет владельца: login/, (protected)/*, export/ (CSV)
│   ├── panel/                    супер-админка: login/, (protected)/* (14 разделов)
│   ├── preview/[slug]/           прототип по ?token=, noindex, без записи
│   ├── domain-site/by-domain/[[...rest]]/   сайт на кастомном домене (цель rewrite из middleware)
│   ├── booking/{cancel,reschedule}/[token]/ короткие ссылки → полная страница бизнеса
│   ├── blocked/, oferta/, privacy/          служебные страницы
│   ├── robots.ts, sitemap.ts, sw.js/route.ts
│   └── api/                      20 route handlers (раздел «Маршрутизация»)
├── components/
│   ├── templates/StudioTemplate.tsx   единый шаблон сайта (публичный сайт и превью)
│   ├── Hero.tsx, MapBlock.tsx, MapLazy.tsx (Leaflet, ssr:false), OceanBackdrop.tsx
├── lib/                          бизнес-логика без UI (раздел «Основные компоненты»)
├── supabase/migrations/          0001_init … 0005_indexes
├── scripts/                      import-excel.ts, migrate-legacy.ts, check.ps1, smoke-test.sh
├── public/assets/                studio.css, шрифты Inter и IBM Plex Sans
├── .github/workflows/backup.yml  еженедельный pg_dump в artifact (60 дней)
├── vercel.json                   регион lhr1 и 10 ежедневных cron-задач
└── next.config.mjs               images.remotePatterns (*.supabase.co), serverComponentsExternalPackages, staleTimes
```

## Роли и доступ

| Роль | Как определяется | Вход | Где проверяется |
|---|---|---|---|
| Супер-админ (оператор) | email в `SUPERADMIN_EMAILS` + пользователь Supabase Auth | `/panel/login` | `lib/admin-session.ts → isSuperAdmin()`: layout `app/panel/(protected)/layout.tsx`, API `transfer`, `import/2gis`, `export`, `verticals`, `backup/restore`, `license/revoke` |
| Владелец бизнеса | строка `admin_users` с `role='owner'` | `/{prefix}/{slug}/panel/login` | `lib/owner-session.ts → currentOwner(slug)` в layout и в каждом server action кабинета |
| Менеджер бизнеса | `admin_users.role='manager'` | то же | то же; разделы `settings`, `subscription`, `team` скрыты, действия в них проверяют `role === 'owner'` |
| Клиент бизнеса | без входа | — | rate limit по IP, токен `bookings.cancel_token` для отмены и переноса |
| Telegram | секрет в заголовке `X-Telegram-Bot-Api-Secret-Token` | — | `api/telegram/webhook`, `api/telegram/admin-webhook` |
| Планировщик | `Authorization: Bearer <CRON_SECRET>` | — | `lib/cron.ts → isCronAuthorized()` |

Сессии: httpOnly-cookie с access token Supabase Auth на 30 дней (`sa_session` — супер-админ, `biz_session` — кабинет).
Токен проверяется на каждом запросе через `auth.getUser()`, права — по `SUPERADMIN_EMAILS` или `admin_users`.

Владелец получает доступ так: оператор в `/panel/clients` нажимает «Создать доступ» → `auth.admin.createUser()`
с случайным паролем → строка `admin_users` → пароль показывается один раз (cookie `sa_flash`, 5 минут).

## Маршрутизация

### Middleware

`middleware.ts` срабатывает на все пути, кроме `_next/static` и `_next/image`:

1. Если задан `LICENSE_ID` — раз в сутки ping на `LICENSE_SERVER_URL/api/license/ping`, статус в cookie `license_status`;
   `blocked` → rewrite на `/blocked`.
2. Хост не из `MAIN_HOSTS` (`lib/site.ts`), не `localhost` и не `*.vercel.app` — это кастомный домен:
   - `/panel/*` → запрос к `/api/resolve-domain?host=` → rewrite на `/{prefix}/{slug}/panel/*`;
   - остальные пути без точки → rewrite на `/domain-site{path}?domain={host}`.
3. `/preview/*` → заголовок `X-Robots-Tag: noindex, nofollow`.
4. На все ответы — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

### Страницы

| Путь | Доступ | Назначение |
|---|---|---|
| `/` | публичный | лендинг, цены |
| `/oferta`, `/privacy`, `/blocked` | публичный | оферта, политика, заглушка лицензии |
| `/{prefix}/{slug}` | публичный, только `status='client'` | сайт бизнеса; старый slug из `slug_history` → 308 |
| `/{prefix}/{slug}/booking/cancel/{token}` | по токену | отмена брони |
| `/{prefix}/{slug}/booking/reschedule/{token}` | по токену | перенос брони |
| `/booking/cancel/{token}`, `/booking/reschedule/{token}` | по токену | редирект на полный адрес |
| `/preview/{slug}?token=` | по токену | прототип; без токена или для `client` — 404 |
| `/{prefix}/{slug}/panel/login` | публичный | вход владельца |
| `/{prefix}/{slug}/panel` | owner, manager | главная: записи сегодня и на 7 дней, чек-лист готовности |
| `…/panel/bookings`, `services`, `photos`, `texts`, `notifications`, `data` | owner, manager | брони, услуги, фото, тексты, Telegram, выгрузка и удаление |
| `…/panel/settings`, `subscription`, `team` | owner | настройки и часы работы, подписка, менеджеры |
| `…/panel/export` | owner, manager | CSV всех броней |
| `/panel/login` | публичный | вход супер-админа |
| `/panel` → `/panel/funnel` | супер-админ | воронка из 5 шагов |
| `/panel/businesses`, `/panel/businesses/{id}` | супер-админ | список, импорт 2GIS, карточка, домен, SSL |
| `/panel/inbox`, `/panel/clients`, `/panel/logs` | супер-админ | входящие, оплаты и доступы, ошибки и аудит |
| `/panel/licenses`, `/panel/email-accounts`, `/panel/templates`, `/panel/verticals`, `/panel/stats`, `/panel/settings`, `/panel/backup` | супер-админ | разделы без пункта в меню, открываются по URL |
| `/robots.txt`, `/sitemap.xml`, `/sw.js`, `/{prefix}/{slug}/manifest.webmanifest` | публичный | SEO и PWA |

### API

| Метод | Путь | Доступ | Что делает |
|---|---|---|---|
| POST | `/api/bookings` | публичный, 5 / 10 мин / IP | создать бронь |
| GET | `/api/bookings/slots?prefix&slug&serviceId&date` | публичный | свободные слоты на день |
| POST | `/api/bookings/{token}/cancel` | токен, 10 / 15 мин / IP | отмена клиентом |
| POST | `/api/bookings/{token}/reschedule` | токен, 10 / 15 мин / IP | перенос клиентом |
| GET | `/api/cron/send-emails` | `CRON_SECRET` | одно письмо из очереди рассылки |
| GET | `/api/cron/check-replies` | `CRON_SECRET` | чтение ответов по IMAP |
| GET | `/api/cron/booking-reminders` | `CRON_SECRET` | напоминания за 24 ч и 2 ч |
| GET | `/api/cron/{job}` | `CRON_SECRET` | 12 прочих задач (раздел «Cron-задачи») |
| GET | `/api/track/open/{token}` | публичный | пиксель открытия, GIF 1×1 |
| GET | `/api/track/click/{token}?to=` | публичный | клик, 302 только на `SITE_URL` |
| POST | `/api/license/ping` | публичный | статус лицензии `active / unverified / unknown / blocked` |
| POST | `/api/license/revoke` | супер-админ | блокировка или разблокировка лицензии |
| GET | `/api/transfer/{id}` | супер-админ | ZIP передачи кода, `support_until = +30 дней` |
| POST | `/api/import/2gis` | супер-админ | загрузка xlsx до 10 МБ |
| GET | `/api/export/businesses?status&format=csv\|xlsx` | супер-админ | выгрузка бизнесов |
| GET | `/api/verticals` | супер-админ | список ниш в JSON |
| POST | `/api/backup/restore` | супер-админ, `confirm=ВОССТАНОВИТЬ` | восстановление из JSON-копии |
| GET | `/api/resolve-domain?host=` | публичный | префикс и slug по кастомному домену |
| POST | `/api/telegram/webhook` | секрет Telegram | `/start BIZ-xxxxxx` привязывает чат бизнеса |
| POST | `/api/telegram/admin-webhook` | секрет Telegram + `TELEGRAM_CHAT_ID` | `/stats` для оператора |

## Потоки данных

### Продажа: от выгрузки 2GIS до клиента

```
xlsx 2GIS ──▶ /api/import/2gis или scripts/import-excel.ts ──▶ lib/import2gis.ts
                фильтр по рубрике, нормализация телефонов, slugify, upsert            businesses.status = new
/panel/funnel, шаг 1 «В работу»                                                          → in_progress
шаг 2 GenerateProgress → generateOne(id) → lib/generate.ts                               → preview_ready
      услуги из vertical_templates.default_services, slug, preview_token, SVG-логотип
шаг 3 «Одобрить» / «На доработку»                                                        → approved / in_progress
шаг 4 queueOutreach → lib/outreach.ts: outreach_log(status=queued, tracking_token)
      /api/cron/send-emails: одно письмо, ротация ящиков, emails_outgoing                 → sent
пиксель и клик → outreach_log.opened_at / clicked_at
/api/cron/check-replies: IMAP → emails_incoming, совпадение по email или домену          → replied
/panel/clients «Оплата 5000 ₽» → подписка 30 дней                                         → client
«Создать доступ» → Supabase Auth + admin_users(owner)
```

Отказ — `refused` (`refused_at`), через 30 дней cron `archive-refused` → `archived`. Без ответа: cron `follow-up`
шлёт повторы на 30-й и 60-й день, на 90-й — `archived`.

### Запись клиента

```
BookingForm ──GET /api/bookings/slots──▶ lib/availability.ts → lib/slots.ts (UTC+3, шаг, min_hours_before, max_days_ahead)
            ──POST /api/bookings──▶ rate limit (rate_limits) → zod → normalizePhone → resolveBusiness
                                    → повторная проверка слота → insert bookings
                                    → уникальный индекс bookings_slot_unique (23505 → 409 slot_taken)
                                    → notifyBusinessEvent: Telegram бизнеса + email на businesses.emails[0]
                                    → notifyAdmin: Telegram оператора
                                    ← 201 { bookingId, cancelToken, status }
```

Статус брони: `auto_confirm=true` → `confirmed`, иначе `new`. Владелец в кабинете меняет статус:
`new → confirmed` (письмо клиенту), `→ done`, `→ no_show`, `→ cancelled`.
Клиент отменяет или переносит по токену не позже чем за `cancel_hours_before` часов.

### Уведомления

| Канал | Отправитель | Получатель | Код |
|---|---|---|---|
| Telegram, бот бизнеса | `TELEGRAM_BUSINESS_BOT_TOKEN` | `businesses.telegram_chat_id` | `lib/notify.ts → sendTelegram` |
| Telegram, бот оператора | `TELEGRAM_BOT_TOKEN` | `TELEGRAM_CHAT_ID` | `lib/admin-notify.ts → notifyAdmin` |
| Email | ящик из `email_accounts` с наименьшим `sent_today` | любой адрес | `lib/notify.ts → sendMail` |

Все письма (рассылка, напоминания, подтверждения, ответы из inbox) идут через `sendMail` и расходуют общий
дневной лимит ящиков (`daily_limit`, по умолчанию 50).

### Кастомный домен

Оператор вводит домен в `/panel/businesses/{id}` → `businesses.custom_domain` и `POST api.vercel.com/v10/projects/{id}/domains`.
Клиент направляет DNS на Vercel. Кнопка «Проверить SSL» и cron `check-domains` обновляют `ssl_status`
(`pending / active / error`). Запрос на домен клиента → middleware → `/domain-site/by-domain` → тот же `BusinessPage`.
Старые домены legacy-клиентов из `legacy_redirects` получают 308 на новый адрес.

### Передача кода

`/api/transfer/{id}` создаёт лицензию (если её нет), ставит `code_transferred_at` и `support_until = сегодня + 30`,
отдаёт ZIP с `README.md`, `INSTALL.md`, `MIGRATIONS.md`, `.env.example` с `LICENSE_ID`. Исходный код в ZIP не входит
(см. [INSTALL.md](INSTALL.md)). Cron `process-transfers`: после `support_until` — `subscription_active=false`,
ещё через 7 дней — `transferred_out`.

## Схема БД

Миграции: `0001_init` (21 таблица, функция `is_business_member`, RLS), `0002_lifecycle` (`refused_at`, FK журнала,
bucket `backups`), `0003_seed` (11 ниш, buckets `photos` и `logos`), `0004_features` (`ssl_status`, версии шаблонов,
`legacy_redirects`, ключи `settings`), `0005_indexes` (составные индексы).

### Связи

```
vertical_templates 1 ──< businesses 1 ──< services 1 ──< bookings (service_id, on delete set null)
                              │      1 ──< photos
                              │      1 ──< bookings
                              │      1 ──< admin_users ── auth.users (auth_user_id)
                              │      1 ──< outreach_log 1 ──< emails_outgoing (outreach_log_id)
                              │      1 ──< emails_outgoing, emails_incoming
                              │      1 ──< business_telegram_codes
                              │      1 ──1 business_requisites
                              └──── licenses (business_id, on delete set null) ··· license_pings (license_id, без FK)
email_accounts ··· outreach_log.email_account_id (без FK)
Независимые: templates, settings, feature_flags, audit_log, promo_codes, pricing_plans, rate_limits, legacy_redirects
```

`on delete cascade` от `businesses`: services, photos, bookings, admin_users, emails_*, business_telegram_codes,
business_requisites. `outreach_log.business_id` — `on delete set null` (журнал рассылки переживает удаление бизнеса).

### Таблицы

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `vertical_templates` | 11 ниш | `slug`, `url_prefix` (unique), `default_services`, `default_texts`, `default_colors`, `blocks` |
| `businesses` | бизнес, сайт, воронка, подписка | `slug` (unique), `slug_history[]`, `status` (14 значений), `preview_token`, `custom_domain`, `ssl_status`, `working_hours` (jsonb), `slot_step_minutes`, `subscription_*`, `telegram_chat_id`, `custom_texts` |
| `services` | услуги | `price`, `duration_minutes`, `sort_order`, `is_active` |
| `photos` | фото работ | `url`, `path` в Storage, `sort_order` |
| `bookings` | брони | `scheduled_at`, `status` (`new/confirmed/cancelled/done/no_show`), `cancel_token`, `reminder_24h_sent_at`, `reminder_2h_sent_at`, `privacy_*` |
| `admin_users` | доступ к кабинету | `business_id`, `role` (`owner/manager`), `auth_user_id` |
| `outreach_log` | очередь и журнал рассылки | `status` (`queued/sent/skipped`), `tracking_token`, `opened_at`, `clicked_at` |
| `emails_outgoing`, `emails_incoming` | исходящие и входящие письма | `subject`, `body_text`, `is_read` |
| `email_accounts` | ящики Yandex 360 | `smtp_pass_encrypted` (AES-256-GCM), `daily_limit`, `sent_today`, `last_reset`, `active` |
| `templates` | шаблоны писем | `subject`, `body`, `version`, `history` |
| `settings` | настройки платформы | ключи `tariffs`, `default_price`, `rate_limits`, `feature_flags`, `platform_requisites` |
| `licenses`, `license_pings` | лицензии выкупленного кода | `license_id`, `allowed_domains[]`, `revoked`; журнал пингов |
| `audit_log` | аудит и ошибки | `action` (ошибки — с префиксом `error:`), `payload` |
| `business_telegram_codes` | коды `BIZ-xxxxxx` | `used_at` |
| `rate_limits` | лимиты запросов | `bucket`, `window_start`, `hits` |
| `legacy_redirects` | старые домены | `from_domain` → `to_url` |
| `feature_flags`, `business_requisites`, `promo_codes`, `pricing_plans` | созданы по ТЗ, кодом не используются | флаги фактически хранятся в `settings.feature_flags` |

Защита от двойной брони — частичный уникальный индекс:

```sql
create unique index bookings_slot_unique on bookings (business_id, scheduled_at)
  where status in ('new', 'confirmed');
```

Индекс ловит совпадение времени начала. Пересечение разных по длительности броней отсекает повторная проверка
`freeSlots` в `POST /api/bookings` и `reschedule`.

### RLS

RLS включён на всех 22 таблицах. Политики:

| Роль | Доступ |
|---|---|
| `anon` | `select` активных `vertical_templates`; `businesses` со `status='client'`; их активных `services` и `photos` |
| `authenticated` | свои бизнесы через `is_business_member(id)`: `select`/`update` businesses, всё по services и photos, `select` bookings, `select` своей строки admin_users |
| `service_role` | обходит RLS; используется сервером через `adminClient()` |

Остальные таблицы для `anon` и `authenticated` закрыты полностью.

Storage: `photos`, `logos` — публичные, до 5 МБ, `image/jpeg|png|webp` (+ `svg+xml` для logos); `backups` — приватный.

## Основные компоненты

| Модуль | Ответственность |
|---|---|
| `lib/supabase.ts` | `publicClient()` (anon) и `adminClient()` (service_role) |
| `lib/site.ts` | `SITE_URL` из `NEXT_PUBLIC_SITE_URL`, `MAIN_HOSTS` для middleware |
| `lib/admin-session.ts`, `lib/owner-session.ts` | вход, cookie, проверка прав, `cache()` на запрос |
| `lib/business.ts` | `resolveBusiness(prefix, slug)`: найден / редирект по `slug_history` / 404 |
| `lib/slots.ts` | чистая функция `freeSlots()`: интервалы `working_hours`, шаг, длительность, занятость, UTC+3 |
| `lib/availability.ts` | занятость дня из БД + `freeSlots()` |
| `lib/rate-limit.ts` | фиксированное окно в таблице `rate_limits` |
| `lib/notify.ts` | `sendTelegram`, `sendMail` с ротацией ящиков, `notifyBusinessEvent` |
| `lib/admin-notify.ts` | `notifyAdmin` — Telegram оператора |
| `lib/outreach.ts` | очередь рассылки, `renderTemplate`, письмо с пикселем и ссылкой-трекером |
| `lib/generate.ts` | прототип: уникальный slug, услуги ниши, токен, логотип |
| `lib/import2gis.ts` | разбор xlsx 2GIS, определение ниши по рубрике, upsert бизнесов |
| `lib/crypto.ts` | AES-256-GCM для паролей SMTP |
| `lib/license-client.ts` | ping лицензии из middleware |
| `lib/slug.ts`, `lib/phone.ts`, `lib/hours.ts` | транслит и slug до 60 символов, телефон `+7XXXXXXXXXX`, разбор часов «10:00-19:00» |
| `lib/audit.ts`, `lib/log.ts` | журнал действий и ошибок в `audit_log` |
| `lib/cron.ts` | проверка `Bearer CRON_SECRET` |
| `lib/database.types.ts` | типы строк таблиц, написаны вручную |
| `components/templates/StudioTemplate.tsx` | разметка сайта бизнеса; стили `public/assets/studio.css` |

## Cron-задачи

| Задача | Путь | В `vercel.json` | Что делает |
|---|---|---|---|
| send-emails | `/api/cron/send-emails` | нет | одно письмо из очереди; по ТЗ — раз в минуту |
| check-replies | `/api/cron/check-replies` | нет | IMAP всех активных ящиков; по ТЗ — раз в 5 минут |
| booking-reminders | `/api/cron/booking-reminders` | нет | окна 23–24 ч и 1–2 ч до записи; по ТЗ — раз в час |
| unconfirmed-reminder | `/api/cron/unconfirmed-reminder` | нет | брони `new` старше 24 ч — письмо и Telegram бизнесу |
| follow-up | `/api/cron/follow-up` | 08:00 UTC | повторы рассылки 30/60 дней, архив на 90-й |
| reset-email-limits | `/api/cron/reset-email-limits` | 21:00 UTC | `sent_today = 0` (00:00 МСК) |
| subscription-reminders | `/api/cron/subscription-reminders` | 07:00 UTC | письма за 3 дня и в день окончания; +7 дней — `subscription_active=false`; +30 — `archived` |
| archive-refused | `/api/cron/archive-refused` | 00:00 UTC | `refused` старше 30 дней → `archived` |
| cleanup-audit-log | `/api/cron/cleanup-audit-log` | 1-е число | удаляет аудит старше 365 дней |
| process-deletions | `/api/cron/process-deletions` | 01:00 UTC | удаляет `pending_deletion` после `deletion_scheduled_at` |
| process-transfers | `/api/cron/process-transfers` | 01:30 UTC | заглушка и `transferred_out` после выкупа |
| cleanup-slots | `/api/cron/cleanup-slots` | 23:00 UTC | ничего не делает: слоты не хранятся |
| cleanup-prototypes | `/api/cron/cleanup-prototypes` | 02:00 UTC | `preview_ready` старше 90 дней → `archived`; любой `archived` с `created_at` старше 120 дней — удаление каскадом (включая бывших клиентов) |
| check-domains | `/api/cron/check-domains` | 03:00 UTC | `ssl_status` по Vercel API, алерт в Telegram |
| backup | `/api/cron/backup` | нет | JSON 7 таблиц в bucket `backups`; запускается кнопкой в `/panel/backup` |

Задачи без расписания в `vercel.json` нужно вызывать внешним планировщиком — см. [DEPLOY.md](DEPLOY.md#шаг-9-частые-cron-задачи).

## Безопасность

- `SUPABASE_SERVICE_ROLE_KEY` используется только в серверном коде; клиентские компоненты обращаются к API.
- Пароли SMTP — AES-256-GCM, формат хранения задаёт `lib/crypto.ts`, ключ `ENCRYPTION_KEY` (64 hex).
- Публичные POST-эндпоинты броней — rate limit в Postgres; валидация входа — zod.
- Click-трекер редиректит только на адреса, начинающиеся с `SITE_URL` (защита от open redirect).
- Превью: случайный `preview_token` (uuid), `noindex` в метаданных и заголовке, `robots.txt` закрывает `/preview/`, `/panel`, `/api/`, `/booking/`.
- Webhook Telegram сверяют секрет из заголовка; admin-webhook отвечает только чату `TELEGRAM_CHAT_ID`.
- Известный риск: server actions супер-админки (`app/panel/(protected)/**/actions.ts`) не вызывают `isSuperAdmin()`
  сами, защита держится на layout. Исправление вынесено в задачи для разработки — см. [PROGRESS.md](PROGRESS.md#известные-проблемы), проблема 6.

## Технологический стек

| Слой | Пакет | Версия (package.json) |
|---|---|---|
| Фреймворк | `next` | 14.2.15 |
| UI | `react`, `react-dom` | 18.3.1 |
| Язык | `typescript` | 5.6.2 |
| Стили | `tailwindcss`, `postcss`, `autoprefixer` | 3.4.13, 8.4.47, 10.4.20 |
| Иконки | `@phosphor-icons/react` | 2.1.10 |
| Данные | `@supabase/supabase-js` | 2.45.4 |
| Валидация и формы | `zod`, `react-hook-form`, `@hookform/resolvers` | 3.23.8, 7.53.0, 3.9.0 |
| Почта | `nodemailer`, `imapflow` | 6.9.15, 1.0.164 |
| Excel | `xlsx` | 0.18.5 |
| Карта | `leaflet` | 1.9.4 |
| Фото | `browser-image-compression` | 2.0.2 |
| ZIP | `archiver` | 7.0.1 |
| Логи | `pino` (в зависимостях, в коде не используется) | 9.4.0 |
| Типы | `@types/node`, `@types/react`, `@types/leaflet`, `@types/nodemailer`, `@types/archiver` | 20.16.5, 18.3.5, 1.9.12, 6.4.16, 6.0.2 |
| Рантайм | Node (`engines`) | 24.x |
| Пакетный менеджер | pnpm (lockfile v9) | 10 |
| Инфраструктура | Vercel (`lhr1`), Supabase, GitHub Actions | — |

## Отличия от ТЗ 4.0

ТЗ 4.0 описывает целевое состояние после миграции (ТЗ §22). Код — состояние до миграции.

| Тема | ТЗ 4.0 | Код |
|---|---|---|
| Хостинг | VPS, Docker Compose, Caddy, Cloudflare | Vercel + Supabase |
| БД-доступ | `pg` + Kysely | `@supabase/supabase-js` |
| Auth | Better Auth, argon2id, magic link | Supabase Auth, email + пароль |
| Storage | MinIO | Supabase Storage |
| Rate limit | Redis | таблица `rate_limits` |
| Cron | system crontab, все задачи | Vercel Cron, 10 ежедневных; частые — внешний планировщик |
| Очередь писем | `email_queue`, retry, unsubscribe | `outreach_log` со статусом `queued`, без retry и unsubscribe |
| Защита брони | exclusion constraint `tstzrange` | уникальный индекс по времени начала + проверка в коде |
| Домен | `servis-jade.ru` | `NEXT_PUBLIC_SITE_URL`, по умолчанию `zapishisya.ru` |
| Healthcheck | `/api/health` | нет |
| Секреты Telegram | `TELEGRAM_ADMIN_SECRET`, `TELEGRAM_BIZ_SECRET`, ответ 403 | `TELEGRAM_ADMIN_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, ответ 401 |
| Single-tenant | `SINGLE_TENANT=true`, `scripts/build-single-tenant.ts` | нет; лицензия через `LICENSE_ID` |
| Manifest | `/manifest.json` | `/{prefix}/{slug}/manifest.webmanifest` |
| Таблиц | 48 | 22 |
