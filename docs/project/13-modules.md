# Том 13. Каталог модулей `общие/lib/`

Назначение каждого файла взято из его первого смыслового комментария. Файлы `*.test.ts` / `*.test.mts` перечислены в томе 11 (тесты), здесь — только рабочие модули. Полный перечень всех ~180 файлов с ключевыми экспортами есть в `служебное/docs/PROJECT_FILES_CATALOG.md`.

## Авторизация и доступ
| Файл | Назначение |
|---|---|
| `admin-session.ts` | Сессия супер-админа: email + пароль, доступ по `SUPERADMIN_EMAILS` |
| `owner-session.ts` | Сессия владельца/менеджера: `findMembership`, `completeOwnerSignIn`, `signInOwner`, `ownerAccess`, `currentOwner`, `requireOwnerAction`, `ownerPanelInfo`, `signOutOwner` |
| `partners-auth.ts` | Партнёрские пароль (scrypt), HMAC-сессия, cookie `partner_session`, рефкод |
| `auth-provider.ts` | Единственная точка обращения к Supabase Auth (`passwordSignIn`, `verifyAccessToken`, `refreshTokens`, `revokeSession`, `setUserPassword`, `jwtSecretTrusted`) |
| `auth-core.ts` | Чистые функции аутентификации: `AuthRealm`, `JwtClaims`, `normalizeEmail`, `sanitizePanelNext`, `panelRootOf`, `isMainHost`, `isSameOrigin`, `parseClientIp` |
| `auth-cookies.ts` | Cookie сессий супер-админа и владельца |
| `auth-session.ts` | `readSession`, `refreshSession`, `startSession`, `endSession`, `refreshUrl` |
| `auth-request.ts` | Контекст запроса: IP, хост, проверка Origin |
| `auth-rate.ts` | Rate limit auth-сценариев поверх Postgres |
| `auth-audit.ts` | Журнал событий аутентификации в `audit_log` |
| `auth-flow.ts` | `slugFromPanelPath`, `normalizeReturnTo`, `loginPathFor`, `isEligible`, `startRealmSession` |
| `auth-forms.ts` | Общие помощники страниц входа/приглашения/magic-link/сброса |
| `auth-invites.ts` | Приглашения в кабинет бизнеса |
| `auth-magic.ts` | Вход по одноразовой ссылке (не основной метод) |
| `auth-mail.ts` | Письма: приглашение, magic-link, сброс пароля |
| `auth-reset.ts` | Сброс пароля: `/panel/forgot-password` → письмо → `/reset-password?token=` |
| `auth-roles.ts` | Права ролей кабинета |
| `auth-tokens.ts` | Одноразовые токены magic-link и сброса пароля |
| `rate-limit.ts` | Атомарный rate limit в Postgres |
| `crypto.ts` | AES-256-GCM шифрование секретов, ротация ключа |
| `ssrf.ts` | Безопасный fetch внешних URL |

## Бронирование
| Файл | Назначение |
|---|---|
| `availability.ts` | Единая точка расчёта доступности: слоты, создание брони, перенос |
| `slots.ts` | Расчёт свободных слотов (чистые функции без БД) |
| `slots-client.ts` | Загрузка слотов в браузере |
| `use-slots.ts` | React-хуки загрузки слотов для BookingForm и RescheduleForm |
| `booking-dates.ts` | Даты для выбора в форме записи |
| `schemas.ts` | Общие zod-схемы бронирования (одна валидация на клиенте и сервере) |
| `booking-actions.ts` | Отмена и перенос брони по токену (ядро) |
| `booking-action-state.ts` | Ядро server actions отмены/переноса |
| `booking-action-state-types.ts` | Типы состояния этих actions |
| `booking-http.ts` | HTTP-хелперы route handlers бронирования: формат ошибок, CSRF, чтение тела, 429 |
| `booking-client.ts` | Вызовы API брони из браузера |
| `booking-notify.ts` | Уведомления о событиях брони |
| `booking-view.ts` | Данные для страниц отмены/переноса (Server Components) |
| `hours.ts` | Рабочее время бизнеса, интервалы, null = выходной |
| `phone.ts` | Телефон РФ: нормализация `+7XXXXXXXXXX`, маска, маскирование в логах |
| `business.ts` | Резолв бизнеса по префиксу и slug (параллельные запросы) |

## Почта и рассылки
| Файл | Назначение |
|---|---|
| `email-accounts.ts` | Ящики Yandex 360: выбор, лимиты, учёт отправок |
| `email-queue.ts` | Обработка очереди `email_queue`: лимит 50, бюджет времени, retry 1ч/4ч → failed + алерт |
| `email-render.ts` | Рендер писем: тема, текст, HTML с inline-CSS |
| `email-template-types.ts` | Константы каналов и типов шаблонов |
| `email-inbound.ts` | Разбор входящих: автоответы, bounce (DSN), threading, sanitize, вложения |
| `email-panel.ts` | Чистая логика админ-разделов email: разбор форм, нити, тема и References ответа |
| `email-tracking.ts` | Открытия, клики и отписка по `tracking_token` |
| `inbox-sync.ts` | Приём почты по IMAP для cron `check-replies` |
| `inbox-store.ts` | Реализация InboxStore на Supabase |
| `outreach.ts` | Холодная рассылка: `buildEmail`, трекинг, List-Unsubscribe, защита от open redirect, `queueApproved` |
| `notify.ts` | Уведомления: Telegram бизнесу и email через ящики Yandex 360 |
| `admin-notify.ts` | Уведомления владельцу сервиса в Telegram |

## Cron
| Файл | Назначение |
|---|---|
| `cron.ts` | Авторизация cron и обёртка `runCronJob` |
| `cron-context.ts` | Боевой контекст: service_role, письма/Telegram, журнал |
| `schedules.ts` | Центральный реестр расписаний, `toVercelCrons`, `toCrontab`, валидация выражений |
| `cron-jobs/index.ts` | Реестр `JOBS`, `handleCronRequest`, `cronRoute` |
| `cron-jobs/*.ts` | 14 хендлеров: `archive-refused`, `backup`, `booking-reminders`, `business-removal`, `check-domains`, `cleanup-audit-log`, `cleanup-prototypes`, `follow-up`, `process-deletions`, `process-transfers`, `reset-email-limits`, `subscription-reminders`, `unconfirmed-reminder`, `warmup`, `shared` |

## Партнёрская программа и готовые сервисы
| Файл | Назначение |
|---|---|
| `partners.ts` | Бизнес-логика партнёрки: CRUDL лидов, `computeDeal`, `createCheckout`, `markCheckoutPaid`, `partnerSummary`, `listAllPartnersOverview`, `createDraftSiteVizitka`, `yookassaConfigured` |
| `ready-services.ts` | Готовые сайты-визитки из выгрузки парсера и раздача партнёрам: инжест, генерация сайтов, фото, итоги, тексты, администрирование |
| `referrals.ts` | Второй уровень: `DEFAULT_REFERRAL_PERCENT = 10`, `referralPercent`, `bonusAmount`, `resolveReferrerByCode`, `linkReferrer`, `accrueReferralBonus`, `listReferrals` |
| `entrepreneur.ts` | Заявка предпринимателя с публичной страницы `/auth` |
| `yookassa.ts` | Интеграция с ЮKassa (платежи по партнёрским счетам) |
| `demo.ts`, `demo-constants.ts` | Демо-кабинеты (том 12) |

## Генерация, импорт, передача
| Файл | Назначение |
|---|---|
| `generate.ts` | Генератор прототипов |
| `generate-store.ts` | Доступ к БД генератора (отделён от логики для тестов) |
| `generate-og.ts` | og:image с сайта клиента через SSRF-safe fetch |
| `import2gis.ts` | Импорт выгрузки 2GIS |
| `import2gis-parse.ts`, `import2gis-store.ts`, `import2gis-apply.ts`, `import2gis-http.ts` | Разбор xlsx, БД-доступ, запись кандидатов, HTTP-ядро |
| `legacy-csv.ts`, `legacy-apply.ts` | Миграция legacy-клиентов из CSV, редиректы старых доменов |
| `slug.ts` | Транслит и slug (свой словарь) |
| `retry.ts` | Повтор операций и ограничение параллельности |
| `transfer.ts` | Передача кода клиенту: один `.txt` вместо ZIP |
| `backup.ts`, `backup-shared.ts`, `backup-deps.ts` | JSON-бэкап таблиц в bucket `backups` и восстановление |

## Сайт, аналитика, юридическое
| Файл | Назначение |
|---|---|
| `analytics.ts` | Собственная аналитика сайтов клиентов |
| `analytics-summary.ts` | Агрегаты для `/panel/stats` и `/api/analytics/summary` |
| `appearance.ts` | 10 готовых стилей оформления кабинета и сайта |
| `contrast.ts` | Выбор текста поверх акцентного цвета (WCAG) |
| `json-ld.ts` | Безопасная сериализация JSON-LD |
| `generate-store.test.mts` и др. | Тесты |
| `legal.ts` | Юридический слой: версии документов, реквизиты, cookie-согласие |
| `legal-versions.ts` | Версии юридических документов, сроки ФЗ-152, ключи cookie |
| `data-request.ts` | Запросы субъектов ПД (ст. 14, 20, 21 ФЗ-152) |
| `site.ts` | `SITE_URL`, `normalizeHost`, `mainHostsFor`, `mainHostsFromEnv`, `MAIN_HOSTS`, `isMainHost`; `DEFAULT_SITE_URL = 'https://zapishisya.ru'` |
| `domain-map.ts` | Подписанная cookie «кастомный домен → prefix/slug» |
| `custom-domain.ts` | Поиск бизнеса по кастомному домену (service_role) |
| `license-client.ts` | Клиентская часть лицензии (попадает в код клиенту) |
| `license-server.ts` | Сервер: приём ping, HMAC, решение по статусу |
| `sw-rules.ts`, `sw-source.ts` | Правила и текст service worker |

## Инфраструктура и утилиты
| Файл | Назначение |
|---|---|
| `supabase.ts` | Клиенты `publicClient()` и `adminClient()` (синглтоны с ключом кэша = url+key), `poolerUrl()` |
| `env.ts` | `REQUIRED_ENV`, `EnvError`, `checkEnv`, `requireEnv` |
| `database.generated.ts`, `database.types.ts` | Типы схемы БД и строки таблиц |
| `audit.ts` | Единая точка записи в `audit_log`, маскирование ПД |
| `log.ts` | Журнал ошибок: обрезка, маскирование, устойчивость к сбоям БД |
| `flash.ts` | Одноразовые уведомления между server action и страницей (5 минут) |
| `react-cache.ts` | `cache()` из React для серверных функций |
| `middleware.test.ts` | Тесты middleware (в `общие/lib` лежит копия) |
| `__fixtures__/`, `__test__/`, `test-utils/` | Фикстуры, setup, утилиты тестов |

## Другие деревья с кодом

| Каталог | Назначение |
|---|---|
| `главная/lib/` | `action.ts`, `audit-labels.ts`, `business-filters.ts`, `db.ts`, `fake-db.ts`, `guard.ts`, `network.ts`, `statuses.ts`, `url.ts` — утилиты админ-студии; `guard.ts` — обёртка проверки `isSuperAdmin` для actions |
| `главная/components/` | `ActionForm`, `BulkTable`, `ConfirmDialog`, `Pager`, `PanelNav`, `PrefetchLink`, `Skeleton`, `StatusBadge`, `Toast` |
| `общие/components/` | `Analytics`, `CookieBanner`, `CookieBannerLazy`, `CookieSettingsButton`, `Hero`, `MapBlock`, `MapLazy`, `OceanBackdrop`, `auth/AuthUi`, `auth/SubmitButton`, `templates/StudioTemplate` (дубли `components/`) |
| `телеграмм-бот/` | `telegram.ts`, `telegram-admin.ts`, `telegram-connect.ts`, `telegram-events.ts`, `telegram-format.ts`, `telegram-webhook.ts`, `telegram.fake-db.ts` |
| `шаблоны/_shared/` | `NicheSite.tsx`, `NicheBookingFlow.tsx`, `niche-tenant.ts`, `themes.ts`, `glyph.tsx` + 10 папок тем |
| `связь/` | `registry.ts` — реестр манифестов шаблонов (читает `template.json`) |
| `types/`, `общие/types/` | `imapflow.d.ts` |
