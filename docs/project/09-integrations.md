# Том 09. Интеграции и подсистемы

Источники: заголовочные комментарии `общие/lib/*.ts`, `app/api/**/route.ts`, `supabase/migrations/0008_pg_cron.sql`, `общие/lib/schedules.ts`, `.github/workflows/backup.yml`, `docs/email-setup.md`, `docs/telegram-setup.md`.

## 1. Почта (Yandex 360, SMTP + IMAP)

Модули: `email-accounts.ts`, `email-queue.ts`, `email-render.ts`, `email-template-types.ts`, `email-inbound.ts`, `email-inbound`-тесты, `email-panel.ts`, `email-tracking.ts`, `inbox-sync.ts`, `inbox-store.ts`, `outreach.ts`, `notify.ts`, `auth-mail.ts`, `admin-notify.ts`.

- **Ящики** (`email_accounts`): SMTP/IMAP-хосты и порты, `smtp_pass_encrypted` (AES-256-GCM), `daily_limit` = 50, `sent_today`, `last_reset`, `active`. Ротация ящиков и учёт лимитов — `email-accounts.ts`; сброс `sent_today` в 00:00 МСК (cron `reset-email-limits` в 21:00 UTC).
- **Очередь** (`email_queue`): до 50 писем за запуск, бюджет времени, `retry_count`/`max_retries=3`, `next_retry_at`, retry через 1 ч и 4 ч → `failed` + алерт. Обработчик — `email-queue.ts`, точка входа `GET /api/cron/send-emails` (раз в минуту).
- **Рендер** (`email-render.ts`): тема, текст, HTML с inline-CSS; переменные шаблонов экранируются; `email-template-types.ts` — каналы и типы шаблонов; `templates` + `templates_versions` — версионирование; `app/panel/(protected)/templates/` — предпросмотр и восстановление версий.
- **Холодная рассылка** (`outreach.ts`): `buildEmail()`, `queueApproved()`, трекинг, `List-Unsubscribe`, защита от open redirect.
- **Трекинг**: `GET /api/track/open/[token]` — пиксель, всегда 204; `GET /api/track/click/[token]` — 302 на целевой URL; идемпотентность, legacy-токены, fail open. `email-tracking.ts`.
- **Отписка**: `unsubscribes`, One-Click RFC 8058 (`POST /api/unsubscribe/[token]`), страница `/unsubscribe/[token]` с причиной, `List-Unsubscribe` в заголовках писем.
- **Входящие** (`inbox-sync.ts` + `inbox-store.ts`): IMAP через `imapflow`, `imap_state` (UIDVALIDITY/UIDNEXT), разбор `mailparser`, автоответы, bounce (DSN RFC 3464), threading (`in_reply_to`/`references`), санитизация `sanitize-html`, вложения (`email_attachments`). Cron `check-replies` раз в 5 минут. Ответ из панели — `replyToIncoming`.
- **Письма аутентификации** (`auth-mail.ts`): приглашение, magic-link, сброс пароля.
- **Транзакционные письма** клиентам (подтверждение, напоминания, отмена/перенос) не тратят лимит рассылки — реализовано в `email-queue`/`notify`.
- Настройка домена почты (SPF/DKIM/DMARC/MX) — `docs/email-setup.md`.

## 2. Telegram

Модули: `телеграмм-бот/telegram.ts`, `telegram-admin.ts`, `telegram-connect.ts`, `telegram-events.ts`, `telegram-format.ts`, `telegram-webhook.ts`, `telegram.fake-db.ts`; в `общие/lib/` — `notify.ts`, `admin-notify.ts`. Корневой `lib/` содержит ещё одну копию telegram-модулей (см. том 03).

- **Один бот на все роли** (`TELEGRAM_BOT_TOKEN`): уведомления бизнесам и команды оператора. `TELEGRAM_BUSINESS_BOT_TOKEN` — опциональный отдельный бот для обратной совместимости.
- **Webhook**: `POST /api/telegram/webhook`, секрет `X-Telegram-Bot-Api-Secret-Token` (`TELEGRAM_WEBHOOK_SECRET`, фолбэк `TELEGRAM_BIZ_SECRET`), идемпотентность через `webhook_events`, `telegram_messages` (direction in/out).
- **Привязка бизнеса**: код `BIZ-…` с TTL 15 минут (`business_telegram_codes`), `createTelegramCode` / `checkTelegramStatus` / `disconnectTelegram`, соль `TELEGRAM_HASH_SECRET`, `businesses.telegram_chat_id`.
- **Оператор**: команды `/stats`, `/health`, `/ping`, алерты — только из `TELEGRAM_CHAT_ID`. `setBotCommandsAction` в админ-студии.
- **Уведомления**: новая бронь, напоминания, отмена/перенос, оплаты, ошибки cron (`admin-notify.ts`).
- Инструкция — `docs/telegram-setup.md`.

## 3. ЮKassa

`общие/lib/yookassa.ts`: `createYookassaPayment`, `isYookassaConfigured`, `verifyYookassaWebhook`. `app/api/yookassa/webhook/route.ts` → `markCheckoutPaid()` (`общие/lib/partners.ts`). Счета `partner_checkouts`: `yookassa_payment_id`, `yookassa_confirmation_url`, `paid_at`. Страница оплаты `/pay/[id]`. Если `YOOKASSA_SHOP_ID`/`YOOKASSA_SECRET_KEY` пусты или `YOOKASSA_TEST_MODE=true` — тестовый режим: `simulatePaymentAction`, ссылка-заглушка, деньги не списываются; в кабинете партнёра показывается предупреждение.

## 4. Vercel API (кастомные домены)

`VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`. Используется в cron `check-domains` (`общие/lib/cron-jobs/check-domains.ts`) для проверки SSL кастомных доменов и в админских действиях (`saveDomain`, `checkSsl`, `getDomainsAction`). Бизнес хранит `custom_domain` и `ssl_status`; редиректы старых доменов — `legacy_redirects`. Маршрутизация доменов — `middleware.ts` + `/api/resolve-domain` + `domain-map.ts` (том 08).

## 5. Импорт 2GIS

`POST /api/import/2gis` (только супер-админ) и `scripts/import-excel.ts` (CLI). Модули: `import2gis-parse.ts` (чтение xlsx через `xlsx`, нормализация, zod, дедупликация), `import2gis-store.ts` (пакетные запросы без N+1), `import2gis-apply.ts` (сопоставление с существующими, подбор slug через `slug.ts`, пачки по 100 с `retry.ts`), `import2gis-http.ts`, `import2gis.ts`. Результат — строки `businesses` со статусом `new` и `source_2gis_url`. Экспорт обратно: `GET /api/export/businesses` (CSV/XLSX).

## 6. Генератор прототипов

`generate.ts` (логика), `generate-store.ts` (БД), `generate-og.ts` (og:image через SSRF-safe fetch), `slug.ts` (свой словарь транслита), `retry.ts`. Вызывается из `generateOne`, `generateForSelected`, `generateBatch`, `generateSitesAction`. Прототип доступен по `/preview/{slug}?token=` с `noindex`; `jobs.type = 'generate_prototypes'`.

## 7. Аналитика

`analytics.ts` (собственная аналитика сайтов клиентов: хэширование, сессия, DNT, валидация), `analytics-summary.ts` (агрегаты для `/panel/stats` и `GET /api/analytics/summary`), `components/Analytics.tsx`, `API POST /api/track/page`. БД: партиционированная `analytics_events`, materialized view `analytics_daily`, `analytics_refresh_log`, функции `analytics_refresh*`, `analytics_business_summary`, `analytics_outreach_summary`, `analytics_traffic_summary`, `analytics_series`, `analytics_rate_hit`, `analytics_purge_rate_limits`. 4 SQL-cron из миграции 0011 (`analytics-refresh`, `analytics-partitions`, `analytics-retention`, `analytics-rate-purge`).

## 8. Бэкапы

- `backup.ts`, `backup-shared.ts`, `backup-deps.ts`: JSON-выгрузка 9 ключевых таблиц в приватный bucket `backups`, восстановление (`POST /api/backup/restore`), ретеншн 30 дней, пагинация, порядок restore, идемпотентность.
- `/api/cron/backup` (Vercel Cron, воскресенье 03:00 UTC) и `runBackupNow` из `/panel/backup`.
- `.github/workflows/backup.yml`: еженедельный `pg_dump` на Ubuntu-раннере (воскресенье 00:00 UTC), артефакт `db-backup-<run_id>`, хранение 60 дней, секрет `SUPABASE_DB_URL`.
- `INSTALL.md` — установка копии для одного бизнеса (выкуп кода); `transfer.ts` + `/api/transfer/[id]` — передача одним `.txt` без ZIP и без исходников.

## 9. PWA и service worker

- `app/sw.js/route.ts` отдаёт текст из `общие/lib/sw-source.ts`; правила кэширования — `общие/lib/sw-rules.ts` (`SW_CACHE = 'booking-shell-v3'`, `RESERVED_SEGMENTS`, `SHELL_PATHS = ['/', '/oferta', '/privacy', '/dogovor-porucheniya']`, `isShellPathWith`, `isCacheableResponse`).
- Логика: только GET с `mode === 'navigate'`, свой origin, без query; сеть с таймаутом 4 с (`AbortController`), ответ отдаётся сразу, кэш пишется в фоне через `e.waitUntil`; при офлайне — из кэша публичной оболочки; `install` → `skipWaiting`, `activate` → удаление старых кэшей + `clients.claim`.
- `app/[prefix]/[slug]/manifest.webmanifest/route.ts` — манифест бизнеса; `SwRegister.tsx` регистрирует `/sw.js` в production.
- Один глобальный SW на все сайты (per-site SW не реализован — `PROGRESS.md`).

## 10. Партнёрская программа

`общие/lib/partners.ts` (613 строк), `partners-auth.ts`, `ready-services.ts` (~790 строк), `referrals.ts`, `demo.ts`.

- **Лиды**: `createLead`, `updateLead`, `markLeadReferralSent`, `deleteLead`, `listLeads`.
- **Сделки**: `computeDeal(variant, customAmount)` — подписка 5 000 ₽ → 1 000 ₽/мес рекуррентно; код 5 000 ₽ → 1 000 ₽ разово; своя сумма → 25% партнёру. `createCheckout`, `getCheckoutForPay`, `updateCheckoutEntrepreneur`, `listCheckouts`, `markCheckoutPaid` (начисление + рекуррентный `next_accrual_at` + бонус наставнику).
- **Сводка**: `partnerSummary()` — начислено только по оплаченным, к выплате = начислено − выплачено, рекуррентные/мес, разовые.
- **Готовые сервисы**: `ingestLeads` (импорт выгрузки парсера лидов), `detectNiche`, `detectCategory`, `listReadyServices`, `listReadyNiches`, `setReadyStatus`, `generateSitesForNiche`, `saveReadyServices`, `setReadyCover`, `takeReadyService`, `setPartnerOutcome`, `photoCandidates`, `listReadyPhotos`, `setReadyPhotos`, `canPartnerEditReady`, `outreachText`/`outreachForRows`, `deleteReadyServices*`, `getNicheDefaultServices`/`saveNicheDefaultServices`, админские `listPartnerAccounts`, `updatePartnerName`, `setPartnerBanned`, `adjustPartnerMoney`, `sendPartnerMessage`, `listPartnerMessages`.
- **Второй уровень**: `referrals.ts` — `DEFAULT_REFERRAL_PERCENT = 10`, `referralPercent()` из `settings.referral_percent`, `bonusAmount`, `resolveReferrerByCode`, `linkReferrer`, `accrueReferralBonus`, `listReferrals`. Тип начисления `referral_bonus` добавлен миграцией 0020.
- **Администрирование**: `app/partner/admin-actions.ts` (загрузка выгрузки, генерация сайтов, баны, корректировки денег, сообщения).
- Партнёрские счета проверяются webhook'ом ЮKassa.

## 11. Визуальные темы и шаблоны сайтов

`шаблоны/_shared/themes.ts` — 10 пресетов (`detailing`, `beauty`, `dentist`, `fitness`, `tutor`, `photographer`, `lawyer`, `vet`, `cleaning`, `repair`); `NicheSite.tsx` — общий движок сайта ниши; `NicheBookingFlow.tsx` — форма записи для нишевых сайтов; `niche-tenant.ts` — сборка tenant-объекта; `glyph.tsx` — иконки. `общие/lib/appearance.ts` — 10 стилей оформления с ключами и названиями: Графит, Пудра, Лёд, Хаки, Янтарь, Ночь, Строгий, Мята, Свежесть, Терракота; `PANEL_THEME_KEY` / `SITE_THEME_KEY` в `custom_texts`. `components/templates/StudioTemplate.tsx` — универсальный шаблон, если ниша не совпала.
`связь/registry.ts` читает `шаблоны/*/template.json` как реестр манифестов.

## 12. Прочие утилиты

`hours.ts` (график работы, массив интервалов), `slots.ts` (расчёт свободных слотов: обеды, буферы, окна записи, выходные, часовые пояса, полночь), `availability.ts` (единая точка доступности: слоты + создание брони + перенос), `booking-dates.ts`, `phone.ts`, `contrast.ts` (WCAG-контраст текста поверх brand_color), `json-ld.ts` (экранирование JSON-LD), `flash.ts` (одноразовые уведомления между action и страницей, 5 минут), `log.ts`, `audit.ts`, `retry.ts` (повтор + ограничение параллельности), `react-cache.ts`, `legal.ts`, `data-request.ts`.
