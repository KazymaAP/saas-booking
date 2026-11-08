# Том 06. Server actions и API-роуты

Источники: `grep "^export async function"` по всем `app/**/actions*.ts`, `find app/api -name route.ts` с заголовочными комментариями, `общие/lib/cron-jobs/index.ts`, `app/api/health/route.ts`.

## 1. Server actions — авторизация (`app/auth/actions.ts`)

| Функция | Действие |
|---|---|
| `registerAction(input)` | Валидация имени/email/пароля (≥8), rate limit по IP+email. Партнёр: `createPartner()` → `authenticatePartner()` → `writePartnerSessionCookie()` → `/partner`. Предприниматель: `createEntrepreneurRequest()` → `adminClient().auth.admin.createUser({ email_confirm: true })` → сообщение |
| `loginAction(email, password)` | Партнёр (`authenticatePartner`) → cookie → `/partner`; иначе `passwordSignIn` → супер-админ (`isSuperAdminEmail`) → `/admin`; владелец (поиск `admin_users` → `businesses`) → `/{prefix}/{slug}/panel` |
| `requestCodeAction(email)` | Не раскрывает наличие аккаунта; `publicClient().auth.signInWithOtp({ shouldCreateUser: true })` |
| `resetPasswordAction(email, code, password)` | `verifyOtp` (6 цифр) → обновление `partners.password_hash` либо пароля Supabase Auth |

## 2. Server actions — супер-админка `app/panel/(protected)/`

| Файл | Экспорты |
|---|---|
| `actions.ts` | `moveToInProgress`, `generateOne`, `generateForSelected`, `approveSelected`, `sendBackForRework`, `queueOutreach` |
| `funnel/actions.ts` | `moveToInProgress`, `approveSelected`, `sendBackForRework`, `generateBatch`, `generationProgress`, `queueOutreach` |
| `businesses/actions.ts` | `addBusiness`, `massSetStatus` |
| `businesses/[id]/actions.ts` | `saveNotes`, `saveDomain`, `checkSsl`, `changeSlug`, `changeStatus`, `cardAction` |
| `clients/actions.ts` | `clientAction`, `createOwnerAccess` |
| `inbox/actions.ts` | `setRead`, `replyToIncoming` |
| `templates/actions.ts` | `saveTemplate`, `restoreVersion`, `deleteTemplate` |
| `verticals/actions.ts` | `saveVertical`, `setVerticalActive`, `importVerticals` |
| `email-accounts/actions.ts` | `saveEmailAccount`, `setEmailAccountActive`, `resetEmailLimit`, `deleteEmailAccount`, `testEmailAccount`, `sendTestEmail` |
| `licenses/actions.ts` | `createLicense`, `setRevoked`, `allowDomain`, `ignoreSignal` |
| `settings/actions.ts` | `saveRequisites`, `saveTariffs`, `saveDefaultPrice`, `saveRateLimits`, `saveFlags` |
| `stats/actions.ts` | `refreshStats` |
| `backup/actions.ts` | `runBackupNow` |

## 3. Server actions — админ-студия `app/admin/`

**`data-actions.ts`** (чтение): `getDashboardDataAction`, `getBusinessesAction`, `setBusinessStatusAction`, `getModerationQueueAction`, `getBookingsAction`, `getPlatformUsersAction`, `getPaymentsAction`, `getAuditLogAction`, `getLeadsAction`, `getTicketsAction`, `setTicketStatusAction`, `getPromoCodesAction`, `getWebhookEventsAction`, `getPhotosAction`, `getAllServicesAction`, `getCitiesAction`, `getClientsFromBookingsAction`, `getLocationsAction`, `createBusinessAction`, `getBotStatsAction`, `getBroadcastHistoryAction`, `getGrowthStatsAction`, `getDomainsAction`.

**`chat-actions.ts`**: `getChatThreadsAction`, `getChatMessagesAction`, `sendChatMessageAction`.

**`platform-actions.ts`**: `getPlatformApiKeyAction`, `rotatePlatformApiKeyAction`, `queuePlatformEmailAction`, `sendPlatformBroadcastAction`, `getPlatformSettingsAction`, `savePlatformSettingsAction`, `getNotificationSettingsAction`, `saveNotificationSettingsAction`, `changeAdminPasswordAction`, `setBotCommandsAction`, `getTariffsAction`, `saveTariffsAction`, `getIntegrationsStatusAction`, `getNotifTemplatesAction`, `saveNotifTemplateAction`, `toggleNotifTemplateAction`, `listBackupsAction`, `getFeatureFlagsAction`, `saveFeatureFlagsAction`, `getPartnerProgramAction`, `savePartnerProgramAction`.

**`app/admin/preview/tenant/`** — интерактивный предпросмотр кабинета предпринимателя (`TenantPreview.tsx`).

## 4. Server actions — кабинет владельца

| Файл | Экспорт | Действие |
|---|---|---|
| `dashboard-actions.ts` | `createManualBookingAction` | Ручная запись из дашборда |
| `bookings/actions.ts` | `changeBookingStatus` | Смена статуса брони |
| `services/actions.ts` | `addService`, `updateService`, `setServiceActive` | CRUD услуг |
| `photos/actions.ts` | `createPhotoUpload`, `confirmPhotoUpload`, `updatePhotoAlt`, `deletePhoto` | Загрузка через подписанные URL Storage |
| `texts/actions.ts` | `saveTexts` | Тексты сайта |
| `settings/actions.ts` | `saveSettings` | Настройки бизнеса |
| `appearance/appearance-actions.ts` | `saveAppearance` | Стиль кабинета/сайта |
| `subscription/actions.ts` | `reportPayment` | «Уже оплатили» |
| `team/actions.ts` | `inviteManager`, `removeMember` | Команда |
| `notifications/actions.ts` | `createTelegramCode`, `disconnectTelegram`, `checkTelegramStatus` | Привязка Telegram |
| `data/actions.ts` | `requestDeletion` | Запрос удаления аккаунта |

## 5. Server actions — партнёрский кабинет

| Файл | Экспорт |
|---|---|
| `app/partner/actions.ts` | `partnerAuthAction`, `partnerLogoutAction`, `addLeadAction`, `updateLeadAction`, `markReferralSentAction`, `deleteLeadAction`, `createCheckoutAction`, `createDraftSiteAction` |
| `app/partner/ready-actions.ts` | `takeReadyServiceAction`, `setPartnerCoverAction`, `setOutcomeAction`, `listReadyPhotosAction`, `setReadyPhotosAction` |
| `app/partner/admin-actions.ts` | `getPartnersOverviewAction`, `ingestReadyUploadAction`, `getReadyServicesAction`, `setReadyStatusAction`, `generateSitesAction`, `getPartnerAccountsAction`, `updatePartnerNameAction`, `banPartnerAction`, `adjustPartnerMoneyAction`, `messagePartnerAction`, `getPartnerMessagesAction`, `getReadyNichesAction`, `deleteReadyServicesAction`, `deleteReadyServicesByFilterAction`, `getNicheDefaultsAction`, `saveNicheDefaultsAction`, `saveReadyServicesAction`, `setReadyCoverAction` |

## 6. Server actions — прочие страницы

| Файл | Экспорт |
|---|---|
| `app/booking/cancel/[token]/actions.ts`, `app/[prefix]/[slug]/booking/cancel/[token]/actions.ts` | `cancelAction` |
| `app/booking/reschedule/[token]/actions.ts` | `rescheduleAction` |
| `app/pay/actions.ts` | `simulatePaymentAction`, `updateCheckoutEntrepreneurAction` |
| `app/invite/[token]/actions.ts` | `acceptInviteAction` |
| `app/magic-link/actions.ts` | `requestMagicLinkAction`, `consumeMagicLinkAction` |
| `app/reset-password/actions.ts` | `requestResetAction`, `completeResetAction` |
| `app/data-request/actions.ts` | `submitDataRequest` |
| `app/unsubscribe/[token]/actions.ts` | `confirmUnsubscribe`, `saveUnsubscribeReason` |

## 7. API-роуты `app/api/**/route.ts`

Формат: `путь | метод | назначение`.

### Бронирование
| Путь | Метод | Назначение |
|---|---|---|
| `/api/bookings` | POST | Создание брони: CSRF → rate limit 5/10 мин на IP → zod → `availability.ts` → вставка. Уведомления владельцу |
| `/api/bookings/slots` | GET | Свободные слоты: `?prefix&slug&serviceId&date` |
| `/api/bookings/[token]/cancel` | POST | Отмена по токену, идемпотентно |
| `/api/bookings/[token]/reschedule` | POST | Перенос по токену, проверки статуса/слотов |

### Авторизация, здоровье, cookie
| Путь | Метод | Назначение |
|---|---|---|
| `/api/auth/refresh` | GET | Обновление сессии по refresh-токену (30 дней без повторного входа); `?realm=&next=` |
| `/api/health` | GET | Healthcheck: `checkEnv()`, HEAD-запрос к `settings` с таймаутом `HEALTH_DB_TIMEOUT_MS` (50…5000, по умолчанию 150). 200 → `{status:'ok', version, uptime_s, time, checks:{env,db,db_latency_ms,security}}`; 503 при деградации. `Cache-Control: no-store`, `X-Robots-Tag: noindex` |
| `/api/cookie-consent` | POST | Запись согласия в `cookie_consents` (хэши IP/UA) |

### Кастомные домены
| Путь | Метод | Назначение |
|---|---|---|
| `/api/resolve-domain` | GET | Два режима: JSON `?host=` (кэш 60 с, rate limit 60/мин) и redirect из middleware с `x-resolve-*` заголовками → подписанная cookie `domain_map` + 307 |

### Cron (все требуют `Authorization: Bearer CRON_SECRET`)
| Путь | Логика |
|---|---|
| `/api/cron/[job]` | Универсальный: `handleCronRequest()` → 401 без секрета → 404 неизвестный джоб → `runCronJob` → журнал `audit_log cron:<job>` → 500 + `logError('cron')`. `maxDuration = 60`, `dynamic = 'force-dynamic'`, `runtime = 'nodejs'` |
| `/api/cron/send-emails` | Отправка писем из `email_queue`, до 50 за запуск, раз в минуту |
| `/api/cron/check-replies` | IMAP-входящие, раз в 5 минут, ≤ 60 с |
| `/api/cron/booking-reminders` | Напоминания за 24 ч и 2 ч |
| `/api/cron/unconfirmed-reminder` | Брони в статусе `new` дольше 24 ч → письмо бизнесу |
| `/api/cron/follow-up` | Повтор молчунам 30/60 дней, архив 90 |
| `/api/cron/subscription-reminders` | За 3 дня, в день, +7 дней заглушка, +30 архив |
| `/api/cron/reset-email-limits` | Сброс `sent_today` ящиков |
| `/api/cron/archive-refused` | Отказы старше 30 дней → `archived` |
| `/api/cron/process-deletions` | `pending_deletion` с наступившей датой → удаление |
| `/api/cron/cleanup-prototypes` | `preview_ready` > 90 дней → archived; archived > 30 → удаление |
| `/api/cron/check-domains` | Кастомные домены через Vercel API → `ssl_status` |
| `/api/cron/backup` | JSON-бэкап 9 таблиц в bucket `backups` (Vercel Cron: воскресенье 03:00 UTC; в коде маршрут назван «ежедневный» — расхождение комментария с `vercel.json`) |
| `/api/cron/warmup` | Лёгкий ping БД, чтобы проект Supabase Free не засыпал |

### Email, аналитика, отписка
| Путь | Метод | Назначение |
|---|---|---|
| `/api/track/open/[token]` | GET | Пиксель открытия письма, всегда 204 без тела |
| `/api/track/click/[token]` | GET | Клик по ссылке → 302 на `?url=` (защита от open redirect) |
| `/api/track/page` | POST | События аналитики с сайтов клиентов |
| `/api/analytics/summary` | GET | JSON-агрегаты для дашборда: `?business_id&from&to` |
| `/api/unsubscribe/[token]` | POST | One-Click отписка RFC 8058 |
| `/api/cookie-consent` | POST | (см. выше) |

### Интеграции и данные
| Путь | Метод | Назначение |
|---|---|---|
| `/api/telegram/webhook` | POST | Webhook бота: секрет `X-Telegram-Bot-Api-Secret-Token` → 403; идемпотентность через `webhook_events` |
| `/api/yookassa/webhook` | POST | `verifyYookassaWebhook()` → `markCheckoutPaid()` |
| `/api/license/ping` | POST | Приём ping от переданных клиенту копий, HMAC |
| `/api/license/revoke` | POST | Ручная блокировка/разблокировка лицензии |
| `/api/verticals` | GET | Выгрузка всех ниш JSON, только супер-админ |
| `/api/import/2gis` | POST | Загрузка xlsx-выгрузки 2GIS, только супер-админ |
| `/api/export/businesses` | GET | Экспорт бизнесов CSV/XLSX, только супер-админ |
| `/api/backup/restore` | POST | Восстановление из JSON-копии в bucket `backups`, только супер-админ |
| `/api/transfer/[id]` | GET | Передача кода клиенту (один `.txt` без ZIP), только супер-админ |

### Демо
| Путь | Метод | Назначение |
|---|---|---|
| `/api/demo/partner` | GET | `ensureDemoPartner()` → `createPartnerSession()` → cookie `partner_session` → 302 `/partner` |
| `/api/demo/owner` | GET | `ensureDemoBusiness()` → `passwordSignIn(demo-owner@…)` → `startSession('owner')` → 302 `/m/demo/panel` |

### Прочие route handlers (не в `app/api/`)
| Путь | Назначение |
|---|---|
| `app/[prefix]/[slug]/manifest.webmanifest/route.ts` | PWA-манифест бизнеса |
| `app/[prefix]/[slug]/panel/export/route.ts` | CSV-выгрузка броней |
| `app/sw.js/route.ts` | Service worker с `Content-Type: application/javascript`, `Cache-Control: no-cache`, `Service-Worker-Allowed: /` |
| `app/robots.ts`, `app/sitemap.ts` | SEO-файлы |

## 8. Общие правила API

- **Cron:** `requireCron(req)` из `общие/lib/cron.ts` проверяет Bearer до имени джоба (чтобы перебором нельзя было узнать список). `runCronJob` ставит блокировку от параллельного запуска, считает бюджет времени (`ctx.deadline`, `CRON_BUDGET_MS = 50 с`), пишет `audit_log`.
- **Админские роуты:** `isSuperAdmin()`; защита от ошибок через `главная/lib/guard.ts`.
- **Публичные мутации:** проверка `sameOrigin` из `requestContext()`, rate limit в Postgres (`rate_limits`, `rate_limit_hit()`, `analytics_rate_hit()`), zod-схемы из `общие/lib/schemas.ts`.
- **Ошибки:** `общие/lib/booking-http.ts` даёт единый формат ответов; `logError()` в `общие/lib/log.ts` маскирует PII.
- **PII в логах:** маскирование телефонов/email (`phone.ts`, `audit.ts`), хэши IP/UA в аналитике.
