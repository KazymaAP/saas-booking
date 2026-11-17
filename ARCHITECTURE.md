# ARCHITECTURE — saas-booking

Документ описывает **фактическое** устройство кода в ветке `main` (версия `0.1.0`): Next.js 14 на Vercel + Supabase.
Целевая архитектура из ТЗ 4.0 (VPS, Postgres + Kysely, Better Auth, Redis, MinIO) описана в разделе
[«Отличия от ТЗ 4.0»](#отличия-от-тз-40).

> Каталоги названы по-русски: `общие/` — код, разделяемый всеми кабинетами, `служебное/` — скрипты, миграции-раннеры
> и e2e-тесты, `главная/` — супер-админка, `шаблоны/` — шаблоны сайтов по нишам, `телеграмм-бот/`, `связь/` —
> интеграции. Алиасы `@/lib`, `@/components`, `@/types` указывают внутрь `общие/` (см. `tsconfig.json`).

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
 Telegram (webhook) ──▶│          общие/lib/supabase.ts    общие/lib/notify.ts                │
 Vercel / pg_cron ────▶│        (service_role, сервер)   (nodemailer, Telegram Bot API)      │
                       └─────────────────────┬────────────────────┬──────────────────────────┘
                                             ▼                    ▼
                           Supabase: Postgres + Auth + Storage   Yandex 360 SMTP/IMAP, api.telegram.org,
                           (RLS на всех таблицах)                 api.vercel.com, ЮKassa
```

Принципы:

- **Одна кодовая база, одна БД.** Каждый бизнес — строка `businesses`; сайт, кабинет и брони различаются по `business_id`.
- **Серверный доступ к данным.** Почти все запросы идут через `adminClient()` (ключ `service_role`, обходит RLS).
  Права проверяются в коде: `isSuperAdmin()`, `currentOwner(slug)`, `writeAccess(slug, section)`. RLS — второй рубеж
  на случай утечки anon-ключа.
- **Без фоновых процессов.** Вся периодическая работа — HTTP-эндпоинты `/api/cron/*`; расписания собраны в
  `общие/lib/schedules.ts` (единственный источник правды, сверяется тестом `schedules.test.ts`).
- **Слоты не хранятся.** Свободное время считается на лету из `working_hours`, длительности услуги и активных броней.
- **Server action защищает себя сам.** Layout и страница не защищают action: это отдельный POST-эндпоинт.
  Каждый action начинается с проверки прав (`requireSuperAdminAction`, `guarded`, `writeAccess`, `requirePartnerId`).

## Карта проекта

```
saas-booking/
├── middleware.ts                 лицензия → /blocked, кастомные домены → rewrite, Origin-проверка, X-Robots-Tag
├── next.config.mjs               CSP/HSTS/XFO/nosniff/Referrer/Permissions, images.remotePatterns (*.supabase.co)
├── app/
│   ├── layout.tsx, globals.css   корневой макет, шрифты, классы панелей (.panel-shell, .btn-primary, .input)
│   ├── page.tsx                  лендинг сервиса
│   ├── [prefix]/[slug]/
│   │   ├── page.tsx              публичный сайт бизнеса (шаблон ниши + BookingForm + JSON-LD)
│   │   ├── booking-ui.tsx, use-booking-submit.ts, BookingForm.tsx, SwRegister.tsx
│   │   ├── booking/{cancel,reschedule}/[token]/   отмена и перенос клиентом
│   │   ├── admin/                кабинет владельца: login/, export/ (CSV), (protected)/*
│   │   ├── my/                   кабинет клиента (вход по email-коду, сессия customer_session)
│   │   └── [role]/               кабинеты сотрудников (manager, receptionist, content, …)
│   ├── admin/                    супер-админка: login/, forgot-password/, preview/, (protected)/*
│   ├── partner/                  партнёрская программа: login/, demo/, page.tsx (кабинет партнёра)
│   ├── auth/, magic-link/, reset-password/, invite/    вход владельца и приглашения команды
│   ├── demo/                     страницы «посмотреть демо» (сами входы — в /api/demo/*)
│   ├── pay/                      оплата подписки (ЮKassa)
│   ├── preview/[slug]/           прототип по ?token=, noindex, без записи
│   ├── domain-site/by-domain/[[...rest]]/   сайт на кастомном домене (цель rewrite из middleware)
│   ├── booking/{cancel,reschedule}/[token]/ короткие ссылки → полная страница бизнеса
│   ├── blocked/, oferta/, privacy/, dogovor-porucheniya/, data-request/, unsubscribe/
│   ├── _legal/                   общие куски юридических страниц
│   ├── robots.ts, sitemap.ts, sw.js/, icon.svg
│   └── api/                      43 route handler (раздел «Маршрутизация»)
├── общие/
│   ├── lib/                      бизнес-логика без UI (раздел «Основные компоненты»)
│   └── components/               Analytics, CookieBanner, MapBlock (Leaflet, ssr:false), auth/*, templates/*
├── главная/                      SuperAdmin.tsx — клиентские экраны супер-админки, lib/ — их хелперы
├── шаблоны/                      _shared/ + ниши: beauty, cleaning, dentist, detailing, fitness, lawyer, …
├── телеграмм-бот/                webhook, команды оператора, привязка чатов бизнеса
├── связь/                        почтовые интеграции (IMAP-синк, входящие)
├── служебное/
│   ├── scripts/                  apply-migrations.cjs, import-excel.ts, migrate-legacy.ts, preflight.sh, smoke-test.sh
│   ├── tests/                    Playwright e2e (*.spec.ts) + unit (tests/unit/*.test.ts)
│   └── docs/                     PROJECT_FILES_CATALOG.md — каталог файлов
├── supabase/migrations/          0001_init … 0026_rls_custom_roles
├── vitest.config.ts              unit-тесты (алиасы повторяют tsconfig)
├── playwright.config.ts          e2e, testDir: ./служебное/tests, порт 3100
├── vercel.json                   регион lhr1 и 2 cron-задачи (лимит Vercel Hobby)
└── .github/workflows/            ci.yml (typecheck + lint + test), backup.yml (еженедельный pg_dump)
```

## Роли и доступ

| Роль | Как определяется | Вход | Где проверяется |
|---|---|---|---|
| Супер-админ (оператор) | email в `SUPERADMIN_EMAILS` + пользователь Supabase Auth | `/admin/login` | `общие/lib/admin-session.ts → isSuperAdmin()`; layout `app/admin/(protected)/layout.tsx` **и каждый** server action (`requireSuperAdmin`, `requireSuperAdminAction`) |
| Владелец бизнеса | строка `admin_users` с `role='owner'` | `/{prefix}/{slug}/admin/login` | `общие/lib/owner-session.ts → currentOwner(slug)`; мутации — `writeAccess(slug, section)` |
| Менеджер / кастомная роль | `admin_users.role` (`manager`, `receptionist`, …) или `business_custom_roles` (миграция 0022) | то же | `общие/lib/sections.ts` + `общие/lib/custom-roles.ts`: разделы `settings`, `subscription`, `team` только владельцу |
| Клиент бизнеса | строка `customers` (business_id + email) | `/{prefix}/{slug}/my` | `общие/lib/customer-session.ts → readCustomerSession(businessId)`: подпись токена + поиск по `(id, business_id)` |
| Партнёр | строка `partners` | `/partner/login` | `общие/lib/partners-auth.ts`; в actions — `requirePartnerId()` |
| Telegram | секрет в заголовке `X-Telegram-Bot-Api-Secret-Token` | — | `app/api/telegram/webhook` (один бот на обе роли) |
| Планировщик | `Authorization: Bearer <CRON_SECRET>` | — | `общие/lib/cron.ts → isCronAuthorized()` (сравнение constant-time) |

Сессии:

- **Супер-админ и владелец** — cookie с access token Supabase Auth (`sa_session`, `biz_session`), проверка на каждом
  запросе через `auth.getUser()`; `/api/auth/refresh` продлевает пару access/refresh.
- **Клиент `/my`** — самоподписанный HS256-JWT (`SUPABASE_JWT_SECRET`), cookie `customer_session`, 30 дней.
  Refresh не предусмотрен: по истечении срока клиент входит заново по коду из письма.
- **Партнёр** — подписанная cookie `partners-auth.ts` (секрет `PARTNER_SESSION_SECRET`, фолбэк `ENCRYPTION_KEY`).

Владелец получает доступ так: оператор в `/admin/clients` нажимает «Создать доступ» → `auth.admin.createUser()`
со случайным паролем → строка `admin_users` → пароль показывается один раз (cookie `sa_flash`, 5 минут).
Приглашение сотрудника — `/invite/{token}` (`общие/lib/auth-invites.ts`).

## Маршрутизация

### Middleware

`middleware.ts` работает на Edge, срабатывает на всё, кроме `_next/static`, `_next/image`, `favicon.ico`, `sw.js`.
Только Edge-совместимые операции: `host`, cookie, path — никаких запросов к БД и self-fetch.

1. **Origin.** POST/PUT/PATCH/DELETE с `Origin` чужого хоста → `403 {"reason":"bad_origin"}`. Запрос без `Origin`
   (Telegram webhook, cron, серверный вызов) пропускается: у таких маршрутов свои секреты.
2. **Лицензия.** Если задан `LICENSE_ID` — статус в памяти инстанса Edge, обновляется в фоне (`waitUntil`) не чаще
   раза в сутки (при `unknown` — раз в час). `blocked` → rewrite на `/blocked`. `/api/*` и `/_next*` не блокируются.
3. **Старая супер-админка.** `/panel` и `/panel/*` → `404` без редиректа.
4. **Кастомный домен.** Хост не из `MAIN_HOSTS` (`общие/lib/site.ts`), не `localhost`, не `*.vercel.app`:
   проверяется подписанная cookie `domain_map` → rewrite на `/{prefix}/{slug}{path}`; главная без cookie →
   `/domain-site/by-domain?domain=`; подпуть без cookie → rewrite в `/api/resolve-domain` (ставит cookie и редиректит).
5. **Служебные пути.** `/domain-site` на основном домене → 404. `/admin` на основном домене — системный путь
   (студия оператора), на кастомном — кабинет предпринимателя и уходит в rewrite.
6. **noindex.** `X-Robots-Tag: noindex, nofollow` для `/preview/*`, `/admin/*`, `/dev/*`, `/partner/*`, `/my/*`,
   `/{prefix}/{slug}/admin|my|{role}/*` и всех `/api/*`.

Статические security-заголовки (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP)
выставляет `next.config.mjs` — middleware их не дублирует.

### Страницы

| Путь | Доступ | Назначение |
|---|---|---|
| `/` | публичный | лендинг, цены |
| `/oferta`, `/privacy`, `/dogovor-porucheniya`, `/blocked` | публичный | оферта, политика, договор поручения, заглушка лицензии |
| `/{prefix}/{slug}` | публичный, только `status='client'` | сайт бизнеса; старый slug из `slug_history` → 308 |
| `/{prefix}/{slug}/booking/cancel/{token}` | по токену | отмена брони |
| `/{prefix}/{slug}/booking/reschedule/{token}` | по токену | перенос брони |
| `/booking/cancel/{token}`, `/booking/reschedule/{token}` | по токену | редирект на полный адрес |
| `/{prefix}/{slug}/my` | клиент | кабинет клиента: записи, отмена, перенос |
| `/preview/{slug}?token=` | по токену | прототип; без токена или для `client` — 404 |
| `/{prefix}/{slug}/admin/login` | публичный | вход владельца |
| `/{prefix}/{slug}/admin` | owner, manager | главная: записи сегодня и на 7 дней, чек-лист готовности |
| `…/admin/bookings`, `services`, `photos`, `texts`, `appearance`, `notifications`, `data` | owner, manager | брони, услуги, фото, тексты, оформление, Telegram, выгрузка и удаление |
| `…/admin/settings`, `subscription`, `team` | owner | настройки и часы работы, подписка, команда |
| `…/admin/export` | owner, manager | CSV всех броней |
| `/{prefix}/{slug}/{role}` | сотрудник с этой ролью | кабинет сотрудника (см. `общие/lib/sections.ts`) |
| `/admin/login`, `/admin/forgot-password` | публичный | вход и восстановление супер-админа |
| `/admin` → `/admin/funnel` | супер-админ | воронка из 5 шагов |
| `/admin/businesses`, `/admin/businesses/{id}` | супер-админ | список, импорт 2GIS, карточка, домен, SSL |
| `/admin/inbox`, `/admin/clients`, `/admin/logs` | супер-админ | входящие, оплаты и доступы, ошибки и аудит |
| `/admin/licenses`, `/admin/email-accounts`, `/admin/templates`, `/admin/verticals`, `/admin/stats`, `/admin/settings`, `/admin/backup` | супер-админ | разделы без пункта в меню, открываются по URL |
| `/partner/login`, `/partner`, `/partner/demo` | партнёр / публичный | кабинет партнёра: лиды, счета, начисления, готовые сайты |
| `/demo/business`, `/demo/partner`, `/demo/customer` | публичный | страницы «посмотреть демо»; входы — `/api/demo/*` при `DEMO_ENABLED=1` |
| `/pay/{id}` | по токену | оплата подписки |
| `/unsubscribe/{token}`, `/data-request` | по токену / публичный | отписка, запрос по ПД |
| `/robots.txt`, `/sitemap.xml`, `/sw.js`, `/{prefix}/{slug}/manifest.webmanifest` | публичный | SEO и PWA |

### API

| Метод | Путь | Доступ | Что делает |
|---|---|---|---|
| POST | `/api/bookings` | публичный, 5 / 10 мин / IP | создать бронь |
| GET | `/api/bookings/slots?prefix&slug&serviceId&date` | публичный | свободные слоты на день |
| POST | `/api/bookings/{token}/cancel` | токен, 10 / 15 мин / IP | отмена клиентом |
| POST | `/api/bookings/{token}/reschedule` | токен, 10 / 15 мин / IP | перенос клиентом |
| POST | `/api/auth/refresh` | cookie сессии | продлить пару access/refresh (`admin` и `owner`) |
| GET | `/api/health` | публичный | версия, доступность БД (порог `HEALTH_DB_TIMEOUT_MS`) |
| GET | `/api/cron/{job}` | `CRON_SECRET` | 13 задач по реестру `schedules.ts` + catch-all |
| GET | `/api/cron/{job}` (Vercel) | `CRON_SECRET` | `backup`, `cleanup-audit-log` |
| GET | `/api/track/open/{token}` | публичный | пиксель открытия, GIF 1×1 |
| GET | `/api/track/click/{token}?to=` | публичный | клик, 302 только на `SITE_URL` |
| GET | `/api/track/page?...` | публичный | просмотр страницы бизнеса |
| GET | `/api/analytics/summary` | супер-админ | сводка посещаемости |
| POST | `/api/cookie-consent` | публичный | журнал согласий (`cookie_consents`) |
| POST | `/api/license/ping` | публичный | статус лицензии `active / unverified / unknown / blocked` |
| POST | `/api/license/revoke` | супер-админ | блокировка или разблокировка лицензии |
| GET | `/api/transfer/{id}` | супер-админ | ZIP передачи кода, `support_until = +30 дней` |
| POST | `/api/import/2gis` | супер-админ | загрузка xlsx до 10 МБ |
| GET | `/api/export/businesses?status&format=csv\|xlsx` | супер-админ | выгрузка бизнесов |
| GET | `/api/verticals` | супер-админ | список ниш в JSON |
| POST | `/api/backup/restore` | супер-админ, `confirm=ВОССТАНОВИТЬ` | восстановление из JSON-копии |
| GET | `/api/resolve-domain?host=` | публичный | префикс и slug по кастомному домену (ставит `domain_map`) |
| POST | `/api/telegram/webhook` | секрет Telegram | `/start BIZ-xxxxxx` привязывает чат; `/stats`, `/ping`, `/health` — только из `TELEGRAM_CHAT_ID` |
| POST | `/api/yookassa/webhook` | подпись ЮKassa | подтверждение платежа, продление подписки |
| GET | `/api/unsubscribe/{token}` | по токену | отписка от рассылки |
| GET | `/api/demo/owner`, `/api/demo/partner`, `/api/demo/customer` | `DEMO_ENABLED=1` + свой origin | вход в демо-кабинет (иначе 404 / 403) |

## Потоки данных

### Продажа: от выгрузки 2GIS до клиента

```
xlsx 2GIS ──▶ /api/import/2gis или служебное/scripts/import-excel.ts ──▶ общие/lib/import2gis.ts
                фильтр по рубрике, нормализация телефонов, slugify, upsert            businesses.status = new
/admin/funnel, шаг 1 «В работу»                                                          → in_progress
шаг 2 GenerateProgress → generateOne(id) → общие/lib/generate.ts                          → preview_ready
      услуги из vertical_templates.default_services, slug, preview_token, SVG-логотип
шаг 3 «Одобрить» / «На доработку»                                                        → approved / in_progress
шаг 4 queueOutreach → общие/lib/outreach.ts: outreach_log(status=queued, tracking_token)
      /api/cron/send-emails: одно письмо, ротация ящиков, emails_outgoing                 → sent
пиксель и клик → outreach_log.opened_at / clicked_at
/api/cron/check-replies: IMAP → emails_incoming, совпадение по email или домену          → replied
/admin/clients «Оплата 5000 ₽» → подписка 30 дней                                         → client
«Создать доступ» → Supabase Auth + admin_users(owner)
```

Отказ — `refused` (`refused_at`), через 30 дней cron `archive-refused` → `archived`. Без ответа: cron `follow-up`
шлёт повторы на 30-й и 60-й день, на 90-й — `archived`.

### Запись клиента

```
BookingForm ──GET /api/bookings/slots──▶ общие/lib/availability.ts → общие/lib/slots.ts (UTC+3, шаг, min_hours_before, max_days_ahead)
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
Обязательное согласие с политикой пишется в `bookings.privacy_accepted_at` + `privacy_version`.

### Уведомления

| Канал | Отправитель | Получатель | Код |
|---|---|---|---|
| Telegram, бот бизнеса | `TELEGRAM_BUSINESS_BOT_TOKEN` | `businesses.telegram_chat_id` | `общие/lib/notify.ts → sendTelegram` |
| Telegram, бот оператора | `TELEGRAM_BOT_TOKEN` | `TELEGRAM_CHAT_ID` | `общие/lib/admin-notify.ts → notifyAdmin` |
| Email | ящик из `email_accounts` с наименьшим `sent_today` | любой адрес | `общие/lib/notify.ts → sendMail` |

Все письма (рассылка, напоминания, подтверждения, ответы из inbox) идут через `sendMail` и расходуют общий
дневной лимит ящиков (`daily_limit`, по умолчанию 50).

### Кастомный домен

Оператор вводит домен в `/admin/businesses/{id}` → `businesses.custom_domain` и `POST api.vercel.com/v10/projects/{id}/domains`.
Клиент направляет DNS на Vercel. Кнопка «Проверить SSL» и cron `check-domains` обновляют `ssl_status`
(`pending / active / error`). Запрос на домен клиента → middleware → подписанная cookie `domain_map` → rewrite на
`/{prefix}/{slug}` → тот же `BusinessPage`. Старые домены legacy-клиентов из `legacy_redirects` получают 308.

### Передача кода

`/api/transfer/{id}` создаёт лицензию (если её нет), ставит `code_transferred_at` и `support_until = сегодня + 30`,
отдаёт ZIP с `README.md`, `INSTALL.md`, `MIGRATIONS.md`, `.env.example` с `LICENSE_ID`. Исходный код в ZIP не входит
(см. [INSTALL.md](INSTALL.md)). Cron `process-transfers`: после `support_until` — `subscription_active=false`,
ещё через 7 дней — `transferred_out`.

### Партнёрская программа

```
/partner/login → partners (referral_code PR-XXXXXX)
лид → partner_leads → счёт partner_checkouts (вариант подписки, комиссия)
оплата предпринимателя → /api/yookassa/webhook → payments, partner_earnings (recurring_monthly)
выплата → partner_payouts; переписка → partner_messages
партнёр готовит сайты: ready_services (ingest → /admin/verticals → generateSitesForNiche)
```

Демо-кабинет партнёра идемпотентно создаётся `ensureDemoPartner()` (`общие/lib/demo.ts`).

### Демо-кабинеты

`/api/demo/{owner,partner,customer}` открывают **настоящую** сессию соответствующей роли на демо-аккаунтах.
Включены только при `DEMO_ENABLED=1` и только для своего origin (`общие/lib/demo-gate.ts`); иначе 404 / 403.
Пароль демо-аккаунтов — `DEMO_PASSWORD` (`общие/lib/demo-secret.ts`), в продакшене обязателен.

## Схема БД

Миграции `supabase/migrations/0001…0026` применяются по порядку; история — в `_applied_migrations`
(`служебное/scripts/apply-migrations.cjs` и `migrate.sh` используют одну и ту же таблицу и пропускают уже
применённое). Каждый файл написан так, чтобы его можно было прогнать повторно, но **накатывать нужно только
вперёд**: `0007` снимает все политики схемы `public` и создаёт свои, поэтому его повторный прогон после `0011+`
удалил бы политики, добавленные позже. Ключевые шаги:

| Миграция | Что добавляет |
|---|---|
| `0001_init` | ядро: 21 таблица, функция `is_business_member`, RLS |
| `0002_lifecycle` | `refused_at`, FK журнала, приватный bucket `backups` |
| `0003_seed` | 11 ниш, публичные buckets `photos` и `logos` |
| `0004_features` | `ssl_status`, версии шаблонов, `legacy_redirects`, ключи `settings` |
| `0005_indexes`, `0019_admin_query_indexes` | составные индексы под выборки админки и кабинета |
| `0006_partitions`, `0010_partitions`, `0014_partition_bookings` | помесячные партиции `bookings`, `audit_log`, `app_logs`, `analytics_events`, `license_pings` |
| `0007_rls_audit`, `0008_pg_cron`, `0009_retention` | аудит RLS, `pg_cron` + `cron_http_call()`, политика хранения |
| `0011_analytics`, `0012_rate_limit_hit`, `0013_data_requests_types` | `analytics_events`, атомарный `rate_limit_hit`, типы запросов по ПД |
| `0017_partners`, `0020_partner_referrals` | партнёры, лиды, счета, начисления, выплаты, сообщения |
| `0018_ready_services` | готовые сайты и дефолтные услуги ниш |
| `0021_staff_roles`, `0022_custom_roles`, `0023_custom_roles_lifecycle`, `0024_custom_roles_cron` | роли сотрудников и кастомные роли с жизненным циклом |
| `0025_customers` | клиенты кабинета `/my` |

Всего — около 60 базовых таблиц (плюс партиции). Часть таблиц создана по ТЗ и кодом не используется:
`feature_flags` (флаги фактически в `settings.feature_flags`), `pricing_plans`, `promo_codes`, `support_tickets`.

### Связи

```
vertical_templates 1 ──< businesses 1 ──< services 1 ──< bookings (service_id, on delete set null)
                              │      1 ──< photos
                              │      1 ──< bookings ──< customers
                              │      1 ──< admin_users ── auth.users (auth_user_id)
                              │      1 ──< business_custom_roles, business_holidays
                              │      1 ──< outreach_log 1 ──< emails_outgoing (outreach_log_id)
                              │      1 ──< emails_outgoing, emails_incoming, email_attachments
                              │      1 ──< business_telegram_codes, notifications, payments
                              │      1 ──1 business_requisites
                              └──── licenses (business_id, on delete set null) ··· license_pings (license_id, без FK)
partners 1 ──< partner_leads, partner_checkouts, partner_earnings, partner_payouts, partner_messages, partner_ready_sites
email_accounts ··· outreach_log.email_account_id (без FK)
Независимые: templates, templates_versions, settings, feature_flags, audit_log, app_logs, cookie_consents,
data_requests, rate_limits, legacy_redirects, cron_*, jobs, slug_locks, unsubscribes, webhook_events
```

`on delete cascade` от `businesses`: services, photos, bookings, admin_users, emails_*, business_telegram_codes,
business_requisites, customers. `outreach_log.business_id` — `on delete set null` (журнал рассылки переживает удаление).

Защита от двойной брони — частичный уникальный индекс:

```sql
create unique index bookings_slot_unique on bookings (business_id, scheduled_at)
  where status in ('new', 'confirmed');
```

Индекс ловит совпадение времени начала. Пересечение разных по длительности броней отсекает повторная проверка
`freeSlots` в `POST /api/bookings` и `reschedule`.

### RLS

RLS включён на всех таблицах (аудит — миграция `0007_rls_audit`). Политики:

| Роль | Доступ |
|---|---|
| `anon` | `select` активных `vertical_templates`; `businesses` со `status='client'`; их активных `services` и `photos` |
| `authenticated` | свои бизнесы через `is_business_member(id)`: `select`/`update` businesses, всё по services и photos, `select` bookings, `select` своей строки admin_users |
| `service_role` | обходит RLS; используется сервером через `adminClient()` |

Остальные таблицы для `anon` и `authenticated` закрыты полностью.

Storage: `photos`, `logos` — публичные, до 5 МБ, `image/jpeg|png|webp` (+ `svg+xml` для logos); `backups` — приватный.
Фото бизнеса грузятся браузером напрямую по подписанной ссылке (`createSignedUploadUrl`), сервер подтверждает объект
(`storage.info`) и только потом создаёт строку `photos`.

## Основные компоненты

| Модуль | Ответственность |
|---|---|
| `общие/lib/supabase.ts` | `publicClient()` (anon) и `adminClient()` (service_role) |
| `общие/lib/site.ts` | `SITE_URL` из `NEXT_PUBLIC_SITE_URL`, `MAIN_HOSTS` для middleware |
| `общие/lib/admin-session.ts`, `owner-session.ts`, `auth-*.ts` | вход, cookie, проверка прав, `cache()` на запрос, magic link, сброс пароля, приглашения |
| `общие/lib/customer-session.ts` | сессия клиента `/my`: подписанный JWT, привязка к `business_id` |
| `общие/lib/partners-auth.ts`, `partners.ts`, `referrals.ts` | партнёрская программа: сессия, лиды, счета, начисления |
| `общие/lib/business.ts` | `resolveBusiness(prefix, slug)`: найден / редирект по `slug_history` / 404 |
| `общие/lib/slots.ts`, `slots-client.ts`, `use-slots.ts` | чистая функция `freeSlots()` (интервалы `working_hours`, шаг, длительность, UTC+3) и её клиентская обвязка |
| `общие/lib/availability.ts` | занятость дня из БД + `freeSlots()` |
| `общие/lib/rate-limit.ts` | фиксированное окно в таблице `rate_limits` (атомарный `rate_limit_hit`) |
| `общие/lib/notify.ts`, `admin-notify.ts`, `email-*.ts` | `sendTelegram`, `sendMail` с ротацией ящиков, шаблоны, очередь, трекинг, IMAP-синк |
| `общие/lib/outreach.ts` | очередь рассылки, `renderTemplate`, письмо с пикселем и ссылкой-трекером |
| `общие/lib/generate.ts`, `generate-store.ts` | прототип: уникальный slug, услуги ниши, токен, логотип |
| `общие/lib/import2gis*.ts` | разбор xlsx 2GIS, определение ниши, дедупликация, пакетная запись |
| `общие/lib/ready-services.ts` | готовые сайты партнёров и дефолтные услуги ниш |
| `общие/lib/crypto.ts` | AES-256-GCM для паролей SMTP, ротация ключа (`ENCRYPTION_KEY_PREVIOUS`) |
| `общие/lib/license-client.ts`, `license-server.ts` | ping лицензии из middleware и серверная проверка |
| `общие/lib/ssrf.ts` | проверка внешних URL (импорт по ссылке, вебхуки) |
| `общие/lib/slug.ts`, `phone.ts`, `hours.ts`, `contrast.ts` | транслит и slug до 60 символов, телефон `+7XXXXXXXXXX`, разбор часов «10:00-19:00», контраст темы |
| `общие/lib/sections.ts`, `custom-roles.ts`, `auth-roles.ts` | разделы кабинетов и матрица прав ролей |
| `общие/lib/audit.ts`, `log.ts` | журнал действий и ошибок в `audit_log` / `app_logs` |
| `общие/lib/cron.ts`, `schedules.ts`, `cron-jobs/` | проверка `Bearer CRON_SECRET`, реестр расписаний, тела задач |
| `общие/lib/demo.ts`, `demo-gate.ts`, `demo-secret.ts` | демо-кабинеты: идемпотентное создание данных, гейт доступа, пароль |
| `общие/lib/database.types.ts`, `database.generated.ts` | типы строк таблиц |
| `общие/components/` | `Analytics`, `CookieBanner(+Lazy)`, `MapBlock`/`MapLazy` (Leaflet, `ssr:false`), `auth/*` |
| `шаблоны/_shared/` + ниши | разметка и стили сайта бизнеса по нишам |
| `главная/SuperAdmin.tsx` | клиентские экраны супер-админки (воронка, бизнесы, логи, рассылка) |

## Cron-задачи

Реестр — `общие/lib/schedules.ts` (единственный источник правды). Все выражения в UTC, МСК = UTC+3.
Тест `schedules.test.ts` сверяет с реестром `vercel.json`, миграции `0006–0008` и `служебное/scripts/cron-check.sh`.

**Vercel Cron (лимит Hobby — 2 задачи):**

| Задача | Расписание | Что делает |
|---|---|---|
| `backup` | `0 3 * * 0` (вс) | JSON ключевых таблиц в bucket `backups`, старше 30 дней — удаление |
| `cleanup-audit-log` | `0 6 * * *` | страховка retention, если `pg_cron` не сработал |

**pg_cron → HTTP** (`public.cron_http_call(name)` → `net.http_get` на `/api/cron/<name>`):

| Задача | Расписание | Что делает |
|---|---|---|
| `send-emails` | `* * * * *` | одно письмо из очереди рассылки |
| `check-replies` | `*/5 * * * *` | IMAP: входящие ответы |
| `booking-reminders` | `0 * * * *` | напоминания клиентам за 24 ч и 2 ч |
| `unconfirmed-reminder` | `0 * * * *` | письмо бизнесу о брони `new` старше 24 ч |
| `follow-up` | `0 8 * * *` | повторы молчунам 30/60 дней, архив на 90-й (11:00 МСК) |
| `subscription-reminders` | `0 7 * * *` | за 3 дня, в день окончания, +7 дней заглушка, +30 архив (10:00 МСК) |
| `reset-email-limits` | `0 21 * * *` | `sent_today = 0` (00:00 МСК) |
| `archive-refused` | `0 0 * * *` | `refused` старше 30 дней → `archived` |
| `process-deletions` | `0 1 * * *` | `pending_deletion` с наступившей датой → удаление |
| `process-transfers` | `30 1 * * *` | заглушка после `support_until`, +7 дней `transferred_out` |
| `cleanup-prototypes` | `0 2 * * *` | `preview_ready` > 90 дней → `archived`, `archived` > 30 дней → удаление |
| `check-domains` | `30 2 * * *` | `ssl_status` по Vercel API, алерт в Telegram |
| `cleanup-unused-roles` | `0 4 * * *` | неиспользуемые 30 дней кастомные роли: уведомление за 10 дней, затем удаление |

**pg_cron → SQL** (функция внутри БД, HTTP не нужен):

| Задача | Расписание | Функция |
|---|---|---|
| `keep-alive` | `0 * * * *` | `public.cron_keep_alive()` — активность БД (Supabase Free) |
| `cleanup-audit-log-90` | `0 3 * * *` | `cron_retention('audit_log')` |
| `cleanup-app-logs-30` | `0 4 * * *` | `cron_retention('app_logs')` |
| `cleanup-analytics-180` | `0 5 * * *` | `cron_retention('analytics_events')` |
| `cleanup-license-pings-180` | `0 6 * * *` | `cron_retention('license_pings')`, `cron_retention('cron_marks')` |
| `create-partitions` | `0 7 1 * *` | `public.create_monthly_partitions()` — партиции на 3 месяца вперёд |

Не запускаются по расписанию (`UNSCHEDULED_JOBS`): `cleanup-slots` (слоты не хранятся) и `warmup`.
Сроки хранения — `RETENTION_DAYS` в `schedules.ts`, должны совпадать с `public.cron_retention_policy` (`0007`).

Задачи без расписания в `vercel.json` вызываются `pg_cron` (миграции `0006–0008`) или внешним планировщиком —
см. [DEPLOY.md](DEPLOY.md).

## Безопасность

- `SUPABASE_SERVICE_ROLE_KEY` используется только в серверном коде; клиентские компоненты обращаются к API.
- Пароли SMTP — AES-256-GCM (`общие/lib/crypto.ts`), ключ `ENCRYPTION_KEY` (64 hex), ротация через
  `ENCRYPTION_KEY_PREVIOUS`; сравнение секретов — constant-time (`safeEqual`).
- Публичные POST-эндпоинты броней — rate limit в Postgres; валидация входа — zod.
- Проверка `Origin` в middleware для всех мутирующих методов; cookie сессий — `httpOnly`, `secure`, `sameSite=lax`.
- Click-трекер редиректит только на адреса, начинающиеся с `SITE_URL` (защита от open redirect).
- Превью: случайный `preview_token` (uuid), `noindex` в метаданных и заголовке, `robots.txt` закрывает `/preview/`,
  `/admin`, `/api/`, `/booking/`.
- Webhook Telegram сверяет секрет из заголовка; команды оператора (`/stats`, `/ping`, `/health`) обрабатывает только
  чат `TELEGRAM_CHAT_ID`.
- Демо-входы (`/api/demo/*`) выключены без `DEMO_ENABLED=1`, проверяют `Sec-Fetch-Site`/`Origin` и не пишут текст
  ошибки в URL (только в журнал).
- Загрузка фото из ZIP идёт в Supabase Storage, а не в `public/uploads`: на Vercel ФС только для чтения.
  Лимиты — 3000 файлов, 600 МБ распакованного объёма (считается по фактическому `getData().length`, а не по
  подделываемому `header.size`), только изображения.
- **Server actions защищают себя сами.** Проверено сплошным обходом: каждый action супер-админки вызывает
  `requireSuperAdmin`/`requireSuperAdminAction`, каждый action кабинета — `writeAccess(slug, section)` или
  `requirePartnerId()`, действия с cron — `isCronAuthorized()`. Layout — дополнительный, а не единственный рубеж.
- Секреты не попадают в клиентский бандл: `process.env` без префикса `NEXT_PUBLIC_` читается только в серверных
  модулях, это проверяет тест `общие/lib/env-example.test.ts`.

## Технологический стек

| Слой | Пакет | Версия (package.json) |
|---|---|---|
| Фреймворк | `next` | 14.2.35 |
| UI | `react`, `react-dom` | 18.3.1 |
| Язык | `typescript` | 5.6.2 |
| Стили | `tailwindcss`, `postcss`, `autoprefixer` | 3.4.13, 8.4.47, 10.4.20 |
| Иконки | `@phosphor-icons/react` | 2.1.10 |
| Данные | `@supabase/supabase-js` | 2.45.4 |
| Валидация и формы | `zod`, `react-hook-form`, `@hookform/resolvers` | 3.23.8, 7.53.0, 3.9.0 |
| Почта | `nodemailer`, `imapflow`, `mailparser` | 6.9.15, 1.0.164, 3.7.1 |
| Excel | `xlsx` | 0.18.5 |
| Карта | `leaflet` | 1.9.4 |
| Фото | `browser-image-compression`, `image-size` | 2.0.2, 2.0.4 |
| ZIP | `adm-zip` | 0.6.1 |
| HTML-санитайзер | `sanitize-html` | 2.13.1 |
| Тесты | `vitest`, `@vitest/coverage-v8`, `@playwright/test` | 2.1.9, 2.1.9, 1.48.2 |
| Типы | `@types/node`, `@types/react`, `@types/leaflet`, `@types/nodemailer`, `@types/mailparser` | 22.20.5, 18.3.5, 1.9.12, 6.4.16, 3.4.5 |
| Рантайм | Node (`engines`) | 22.x |
| Пакетный менеджер | pnpm (lockfile v9) | 10 |
| Инфраструктура | Vercel (`lhr1`), Supabase, GitHub Actions | — |

## Отличия от ТЗ 4.0

ТЗ 4.0 описывает целевое состояние после миграции (ТЗ §22). Код — состояние до миграции.

| Тема | ТЗ 4.0 | Код |
|---|---|---|
| Хостинг | VPS, Docker Compose, Caddy, Cloudflare | Vercel + Supabase |
| БД-доступ | `pg` + Kysely | `@supabase/supabase-js` |
| Auth | Better Auth, argon2id, magic link | Supabase Auth (email + пароль, magic link для владельца) |
| Storage | MinIO | Supabase Storage |
| Rate limit | Redis | таблица `rate_limits` |
| Cron | system crontab, все задачи | Vercel Cron (2 задачи) + `pg_cron` (13 HTTP + 6 SQL) |
| Очередь писем | `email_queue`, retry, unsubscribe | `outreach_log` со статусом `queued`, повтор — следующим запуском |
| Защита брони | exclusion constraint `tstzrange` | уникальный индекс по времени начала + триггер `trg_bookings_no_overlap` с advisory-lock по бизнесу (0027), пересечение → `23P01` |
| Домен | `servis-jade.ru` | `NEXT_PUBLIC_SITE_URL`, по умолчанию `zapishisya.ru` |
| Healthcheck | `/api/health` | есть: `/api/health` (версия + доступность БД) |
| Секреты Telegram | `TELEGRAM_ADMIN_SECRET`, `TELEGRAM_BIZ_SECRET`, ответ 403 | `TELEGRAM_WEBHOOK_SECRET`, ответ 403 |
| Single-tenant | `SINGLE_TENANT=true`, `scripts/build-single-tenant.ts` | нет; лицензия через `LICENSE_ID` |
| Manifest | `/manifest.json` | `/{prefix}/{slug}/manifest.webmanifest` |
| Таблиц | 48 | около 60 базовых (миграции 0001–0030) |
