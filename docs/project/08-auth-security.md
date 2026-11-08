# Том 08. Авторизация и безопасность

Источники: `общие/lib/admin-session.ts`, `owner-session.ts`, `partners-auth.ts`, `auth-*.ts`, `auth-request.ts`, `auth-rate.ts`, `auth-audit.ts`, `rate-limit.ts`, `crypto.ts`, `site.ts`, `domain-map.ts`, `license-client.ts`, `license-server.ts`, `ssrf.ts`, `next.config.mjs`, `middleware.ts`, `app/api/health/route.ts`.

## 1. Четыре контура авторизации

| Контур | Кем управляется | Где хранится сессия | Проверка на запросе |
|---|---|---|---|
| Супер-админ | Supabase Auth + `SUPERADMIN_EMAILS` | `sa_session` (access + refresh cookie, realm `admin`) | `isSuperAdmin()` → `readSession('admin')` + проверка email |
| Владелец/менеджер бизнеса | Supabase Auth + `admin_users` | `owner` realm cookie | `currentOwner(slug)` → `findMembership(userId, slug)` (бизнес в статусе `client`, роль `owner`/`manager`) |
| Партнёр | Таблица `partners` (свой scrypt-пароль) | `partner_session` — HMAC-подписанный токен | `readPartnerSession()` → `getPartnerById()` |
| Клиент бизнеса | Без аккаунта | Разовые токены (`cancel_token`, unsubscribe token, invite token, magic-link token) | Проверка токена в БД |

### Супер-админ (`admin-session.ts`)

`signInAdmin` / `signOut` / `isSuperAdmin`. Проверка `sameOrigin` (CSRF), rate limit по IP и email, `passwordSignIn`, `isSuperAdminEmail` (список из `SUPERADMIN_EMAILS`), `startSession('admin', session)`, запись в `auth-audit`. Парольный вход — `/panel/login`. Сброс — `/panel/forgot-password` → письмо → `/reset-password?token=`.

### Владелец (`owner-session.ts`)

`findMembership(userId, slug)`: бизнес по slug → `admin_users` по `(business_id, auth_user_id)` → статус бизнеса должен быть `client`, иначе `inactive`. `completeOwnerSignIn()` открывает сессию realm `owner`; `signInOwner()` — парольный вход с CSRF + rate limit + magic-link через `startRealmSession()`. `ownerAccess(slug)` (React cache) возвращает `ok | refresh | inactive | none`; layout при `refresh` уходит на `/api/auth/refresh?realm=owner&next=…`. `requireOwnerAction(slug, roles)` — для server actions: `sameOrigin` + при необходимости `refreshSession('owner')` + проверка роли `['owner','manager']`. `ownerPanelInfo(prefix, slug)` — существует ли кабинет (не раскрывает статус). `signOutOwner()` отзывает refresh-токен у провайдера и чистит cookie.

### Партнёр (`partners-auth.ts`)

Пароль: `scryptSync(plain, salt16, 64)` → `scrypt$<base64-salt>$<base64-hash>`, сравнение через `timingSafeEqual`. Сессия: `createPartnerSession(partnerId)` → `<id>.<exp>.<HMAC-SHA256 base64url>`; секрет — `PARTNER_SESSION_SECRET`, иначе `ENCRYPTION_KEY`, в dev — заглушка `dev-partner-session-secret-change-me` (в production без секрета бросается ошибка). Cookie `partner_session`: `httpOnly`, `secure`, `sameSite=lax`, `path=/`, 30 дней. `generateReferralCode()` → `PR-<8 символов base36>`. `clearPartnerSessionCookie()`, `readPartnerSession()`.

### Единая страница `/auth` (`app/auth/actions.ts`)

См. том 06. Партнёр проверяется первым, затем Supabase Auth. `requestCodeAction` использует OTP Supabase (6 цифр, 10 минут) и не раскрывает наличие аккаунта.

## 2. Общие механизмы сессий (`auth-session.ts`, `auth-cookies.ts`, `auth-provider.ts`)

- `readSession(realm)` — `verifyAccessToken()` (локально по `SUPABASE_JWT_SECRET`, если ключ надёжный; иначе запрос к Supabase Auth), `refreshSoon` при скором истечении.
- `refreshSession(realm)` — обновление пары токенов, запись cookie. Разрешено только в Server Action / Route Handler.
- `startSession(realm, session)`, `endSession(realm)` — отзыв refresh-токена (`revokeSession`) + очистка cookie.
- `refreshUrl(realm, next)` → `/api/auth/refresh?realm=…&next=…` для Server Components.
- `auth-provider.ts` — единственная точка обращения к Supabase Auth: `passwordSignIn`, `verifyAccessToken`, `refreshTokens`, `revokeSession`, `setUserPassword`, `jwtSecretTrusted()`. Слабый `SUPABASE_JWT_SECRET` отключает локальную проверку (каждый запрос идёт в Supabase Auth), что видно в `/api/health` как `security: weak_jwt_secret`.
- `auth-request.ts` — `requestContext()`: IP (`x-real-ip` / `x-forwarded-for`), хост, `sameOrigin` по `Origin`/`Host`.
- `auth-rate.ts` — rate limit auth-сценариев поверх Postgres: `allowAll([['login_ip', ip], ['login_email', email]])`.
- `auth-audit.ts` — события `login_failed`, `login_success`, `csrf_rejected`, `login_rate_limited`, `logout`, `session_refreshed` в `audit_log`.
- `auth-tokens.ts` — одноразовые токены magic-link и сброса пароля; `auth-magic.ts`, `auth-reset.ts`, `auth-invites.ts`, `auth-mail.ts`.
- `auth-roles.ts` — права ролей кабинета; `auth-forms.ts` — общие помощники страниц входа.
- `auth-flow.ts` — `slugFromPanelPath()`, `normalizeReturnTo()`, `loginPathFor()`, `isEligible()`, `startRealmSession()`: письмо для входа уходит только супер-админу из `SUPERADMIN_EMAILS` или участнику активного бизнеса из `returnTo`.

## 3. CSRF / Origin

- `middleware.ts` → `isForeignOrigin()`: для POST/PUT/PATCH/DELETE с `Origin`, чей host != host запроса → 403. Если `Origin` отсутствует (webhook Telegram, cron, сервер лицензий, curl) — пропуск (у этих маршрутов свои секреты).
- `requestContext().sameOrigin` повторно проверяется в `signInOwner`, `requireOwnerAction`, auth-действиях.
- `form-action 'self'` в CSP.

## 4. Rate limiting

- `общие/lib/rate-limit.ts` — атомарная функция Postgres `rate_limit_hit(bucket, limit, window_seconds)` (0012), таблица `rate_limits`. Fail open при недоступной БД (ТЗ §17.5).
- Бронирование: 5 попыток за 10 минут на IP.
- `/api/resolve-domain`: 60 запросов в минуту на IP.
- Auth: лимиты по IP и email.
- Аналитика: `analytics_rate_hit()`.
- Cron: блокировки `cron_try_lock`, `cron_claim`, `job_locks` (защита от параллельных запусков).

## 5. RLS и разграничение данных

RLS включён на всех таблицах; `service_role` используется только на сервере (`adminClient()`), публичный `publicClient()` — с anon-ключом. Изоляция арендаторов обеспечивается `business_id` во всех запросах и функциями `accessible_business_ids()` / `owned_business_ids()` / `public_business_ids()`. Политики для клиентского чтения — только активные бизнесы (`p_businesses_sel`), анонимная вставка разрешена только в `bookings` (`p_bookings_anon_ins`). Подробнее — том 07.

## 6. Шифрование и секреты

- `crypto.ts` — AES-256-GCM для паролей SMTP/IMAP (`smtp_pass_encrypted`), ключ `ENCRYPTION_KEY` (64 hex), поддержка ротации через `ENCRYPTION_KEY_PREVIOUS`.
- `ssrf.ts` — безопасный fetch внешних URL (`generate-og.ts`, og:image); запрет внутренних адресов.
- `analytics.ts` — IP и User-Agent не хранятся, только sha256 с `ANALYTICS_SALT`.
- `phone.ts` — маскирование телефона в логах; `audit.ts` — маскирование PII в `audit_log`; `log.ts` — обрезка и маскирование ошибок.
- `.env`, `.env.*` не попадают в git (`.gitignore`, `!.env.example`). Тест `env-example.test.ts` проверяет, что пример не содержит заполненных секретов.
- `next.config.mjs` — CSP/HSTS/XFO/nosniff/Referrer/Permissions/COOP/COEP-подобные заголовки (том 02).
- Партнёрские пароли — scrypt, не Supabase Auth.

## 7. Лицензии (код, переданный клиенту)

`LICENSE_ID`, `LICENSE_SERVER_URL`, `LICENSE_HMAC_SECRET` задаются только в копии клиента. `license-client.ts` (попадает в код клиента): `pingLicense(host, version)` → POST `/api/license/ping`; cookie `license_status`. `license-server.ts`: приём ping, HMAC, решение о блокировке, запись `license_pings`. `middleware.ts`: без `LICENSE_ID` проверка выключена; при `blocked` → rewrite `/blocked`; сетевой сбой → `unknown` → сайт не блокируется (fail-safe), повтор через час. `/api/license/revoke` — ручная блокировка/разблокировка.

## 8. Кастомные домены: подписанная cookie

`domain-map.ts`: `signDomainMap` / `verifyDomainMap` с `ENCRYPTION_KEY`, `DOMAIN_MAP_COOKIE`, `DOMAIN_MAP_MARKER`, `DOMAIN_MAP_TTL_SECONDS`, константы заголовков `RESOLVE_HOST_HEADER` (`x-resolve-host`), `RESOLVE_NEXT_HEADER`, `RESOLVE_RETRY_HEADER`. Cookie подписывается на сервере, middleware (Edge) проверяет её без обращения к БД. Значения `x-resolve-*` от клиента перезаписываются в middleware, чтобы нельзя было подсунуть чужой домен. `custom-domain.ts` ищет бизнес по `custom_domain` через `adminClient()`.

## 9. Загрузка файлов

Фото загружаются в Supabase Storage по подписанному URL: `createPhotoUpload` → `confirmPhotoUpload`. `browser-image-compression` сжимает изображение в браузере до загрузки. `next/image` разрешает только `*.supabase.co/storage/v1/object/public/**`, SVG запрещён (`dangerouslyAllowSVG: false`). `image-size` — проверка размеров, `photos/rules.ts` — лимиты.

## 10. Юридический слой

`legal.ts`, `legal-versions.ts`: версии документов (`PRIVACY_VERSION`), реквизиты (`LEGAL_EMAIL`, `LEGAL_ADDRESS`, `business_requisites`), cookie-согласие (`cookie_consents`, `CookieBanner`), отписка (`unsubscribes`, One-Click RFC 8058, `List-Unsubscribe`), запросы субъектов ПД (`data_requests`, ст. 14/20/21 ФЗ-152). Страницы `/oferta`, `/privacy`, `/dogovor-porucheniya`, `/data-request`, `/unsubscribe/[token]`.
