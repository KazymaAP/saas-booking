# Том 02. Стек, зависимости, конфиги, переменные окружения

Источники: `package.json`, `tsconfig.json`, `tsconfig.strict.json`, `next.config.mjs`, `vercel.json`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.config.mts`, `playwright.config.ts`, `playwright.config.mts`, `instrumentation.ts`, `.env.example`, `общие/lib/env.ts`, `.gitignore`, `pnpm-workspace.yaml`, `.npmrc`.

## 1. Манифест `package.json`

`name: saas-booking`, `version: 0.1.0`, `private: true`, `engines.node: "22.x"`.

> Расхождение: `README.md` в таблице стека пишет «Node: engines.node 24.x», а в быстром старте «Node 20+ (Vercel использует 24.x)». Фактическое значение в `package.json` — `22.x`.

### Скрипты

| Скрипт | Команда |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `next lint` (ESLint-конфига нет; `PROGRESS.md` фиксирует, что команда спрашивает конфиг и выходит с кодом 1) |
| `typecheck` | `tsc --noEmit` |
| `typecheck:strict` | `tsc --noEmit -p tsconfig.strict.json` |
| `test:unit` / `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:coverage` | `vitest run --coverage` |
| `test:cron` | `vitest run общие/lib/cron.test.ts общие/lib/schedules.test.ts общие/lib/cron-check.test.ts общие/lib/cron-jobs app/api/cron` |
| `cron:check` | `bash служебное/scripts/cron-check.sh` |
| `test:e2e` | `playwright test` |
| `test:e2e:install` | `playwright install --with-deps chromium` |
| `preflight` | `bash служебное/scripts/preflight.sh` |
| `migrate` | `node служебное/scripts/apply-migrations.mjs` |

### Зависимости (production)

| Пакет | Версия | Где используется |
|---|---|---|
| `next` | 14.2.15 | App Router, server actions, middleware |
| `react` / `react-dom` | 18.3.1 | UI |
| `@supabase/supabase-js` | 2.45.4 | БД, Auth, Storage (два клиента: public/admin) |
| `react-hook-form` | 7.53.0 | BookingForm, формы панелей |
| `@hookform/resolvers` | 3.9.0 | zodResolver |
| `zod` | 3.23.8 | Валидация (`schemas.ts`, actions, env CLI) |
| `@phosphor-icons/react` | 2.1.10 | Иконки панелей |
| `tailwindcss` | 3.4.13 (dev) | Утилитарные классы |
| `nodemailer` | 6.9.15 | SMTP-отправка |
| `imapflow` | 1.0.164 | IMAP-входящие |
| `mailparser` | 3.7.1 | Разбор писем |
| `sanitize-html` | 2.13.1 | Санитизация HTML писем |
| `xlsx` | 0.18.5 | Импорт 2GIS / экспорт таблиц |
| `archiver` | 7.0.1 | Архивы (передача кода, бэкапы) |
| `adm-zip` | ^0.6.1 | ZIP |
| `browser-image-compression` | 2.0.2 | Сжатие фото в браузере перед загрузкой |
| `image-size` | ^2.0.4 | Размеры изображений |
| `leaflet` | 1.9.4 | Карта на сайте бизнеса (OSM) |
| `pino` | 9.4.0 | Логирование |

Dev: `@playwright/test` 1.48.2, `vitest` 2.1.9, `@vitest/coverage-v8` 2.1.9, `typescript` 5.6.2, `autoprefixer` 10.4.20, `postcss` 8.4.47, типы `@types/*`.

Пакетный менеджер — pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`). `README.md`: нужен pnpm 10 (pnpm 9 не принимает текущий `pnpm-workspace.yaml`).

## 2. `tsconfig.json`

- `target: ES2022`, `lib: dom/dom.iterable/es2022`, `module: esnext`, `moduleResolution: bundler`, `jsx: preserve`.
- Строгие флаги: `strict`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `forceConsistentCasingInFileNames`, `noEmit`, `isolatedModules`, `esModuleInterop`, `skipLibCheck`, `resolveJsonModule`, `incremental`.
- `plugins: [{ name: "next" }]`, `baseUrl: "."`.

**Алиасы (критично для понимания кода):**

| Алиас | Куда |
|---|---|
| `@/lib` | `./общие/lib` |
| `@/lib/*` | `./общие/lib/*` |
| `@/components` | `./общие/components` |
| `@/components/*` | `./общие/components/*` |
| `@/types` | `./общие/types` |
| `@/types/*` | `./общие/types/*` |
| `@/*` | `./*` (корень проекта) |

То есть `@/lib/supabase` → `общие/lib/supabase.ts`, а `@/главная/...` → `./главная/...`, `@/шаблоны/...` → `./шаблоны/...`.

`include`: `next-env.d.ts`, `общие/types/**/*.d.ts`, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts`, `dist/types/**/*.ts`, `.next-prod/types/**/*.ts`. `exclude`: `node_modules`, `.next`, `out`, `coverage`.

## 3. `next.config.mjs`

- `reactStrictMode: true`, `poweredByHeader: false`, `compress: true`.
- `distDir: process.env.VERCEL ? '.next' : (process.env.NEXT_DIST_DIR || '.next')` — на Vercel принудительно `.next` (иначе `NEXT_OUTPUT_DIR_MISSING`), локально можно переопределить через `NEXT_DIST_DIR`.
- `images.remotePatterns`: только `https://*.supabase.co/storage/v1/object/public/**`; `formats: ['image/avif','image/webp']`; `deviceSizes: [360,414,640,750,828,1080,1200,1920]`; `minimumCacheTTL: 86400`; `dangerouslyAllowSVG: false`. Логотипы и og:image выводятся через обычный `<img>`, без оптимизатора.
- `experimental.serverComponentsExternalPackages`: `imapflow`, `nodemailer`, `archiver`, `xlsx`.
- `experimental.optimizePackageImports`: `@phosphor-icons/react`, `leaflet`.
- `experimental.instrumentationHook: true` → `instrumentation.ts` проверяет env при старте.
- `experimental.staleTimes`: `dynamic: 30`, `static: 180`.
- `headers()` применяет статические security-заголовки ко всем путям `/:path*`: CSP, HSTS (`max-age=31536000; includeSubDomains`), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`, `X-DNS-Prefetch-Control: on`, `Cross-Origin-Opener-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`.

**CSP** собирается функцией `buildSecurityHeaders()` ( origin Supabase берётся из `NEXT_PUBLIC_SUPABASE_URL` в момент вызова):
```
default-src 'self';
script-src 'self' 'unsafe-inline' ['unsafe-eval' только в dev];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' <supabase-origin> <wss-supabase-origin> [ws: в dev];
manifest-src 'self'; worker-src 'self'; frame-ancestors 'self'; base-uri 'self';
form-action 'self'; object-src 'none'; [upgrade-insecure-requests в production]
```
`unsafe-inline` для script-src — осознанно: Next 14 вставляет inline-скрипты гидрации, nonce потребовал бы динамического рендера и убил бы ISR.

## 4. `vercel.json`

```json
{
  "regions": ["lhr1"],
  "crons": [
    { "path": "/api/cron/backup", "schedule": "0 3 * * 0" },
    { "path": "/api/cron/cleanup-audit-log", "schedule": "0 6 * * *" }
  ]
}
```
Ровно 2 задачи — лимит Vercel Hobby. Остальные задания идут через pg_cron → HTTP (`общие/lib/schedules.ts`, том 10).

## 5. `tailwind.config.ts` / `postcss.config.mjs`

Tailwind без shadcn. `content`: `./app/**/*.{ts,tsx}`, `./общие/**/*.{ts,tsx}`, `./шаблоны/**/*.{ts,tsx}`, `./главная/**/*.{ts,tsx}`. `corePlugins.preflight: false` (preflight отключён и в `app/globals.css`), `theme.extend: {}`, `plugins: []`. Цвета задаются произвольными значениями (`text-[#666666]`) и CSS-переменными из `globals.css`. PostCSS: `tailwindcss` + `autoprefixer`.

## 6. `instrumentation.ts`

Выполняется один раз при старте Node-сервера (`NEXT_RUNTIME === 'nodejs'`), вызывает `checkEnv()` из `./общие/lib/env.ts` и при проблемах бросает `EnvError` со списком. Во время `next build` не вызывается — сборка без секретов в CI возможна.

`REQUIRED_ENV` (6 обязательных):
```
NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY, CRON_SECRET
```
Форматные правила: `NEXT_PUBLIC_SITE_URL` — `http(s)://host` без пути; `NEXT_PUBLIC_SUPABASE_URL` — `https://<...>` (либо `http://localhost:54321` / `127.0.0.1` для локального Supabase); `ENCRYPTION_KEY` — 64 hex-символа; `CRON_SECRET` — не короче 32 символов.

## 7. Тестовые конфиги

**`vitest.config.ts`** (используется по умолчанию при `vitest run`): алиасы те же, что в tsconfig (`@/lib` → `./общие/lib`), `esbuild.jsx: 'automatic'`, `environment: 'node'`, `restoreMocks: true`, `include`: `общие/lib/**/*.test.ts`, `главная/**/*.test.ts`, `телеграмм-бот/**/*.test.ts`, `app/**/*.test.ts`, `служебное/tests/unit/**/*.test.ts`; `exclude`: `node_modules`, `.next`, `служебное/tests/*.spec.*`. Env для тестов подставляет `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_SERVICE_ROLE_KEY=test-service-role` и т.п. Unit-тесты не ходят в сеть и БД — Supabase мокается.

**`vitest.config.mts`** — более старый/параллельный конфиг: `include` содержит `общие/lib/**/*.test.ts`, `главная/**/*.test.ts`, `телеграмм-бот/**/*.test.ts`, `app/**/*.test.ts`, `служебное/tests/unit/**/*.test.ts`; `exclude` дополнительно `служебное/tests/*.spec.*`. `PROGRESS.md` ссылается на запуск `vitest run --config vitest.config.mts`. В корне также есть `vitest.config.mts.timestamp-*.mjs` — временный артефакт Vitest.

**`playwright.config.ts` / `playwright.config.mts`** — E2E против локального production build (`next build && next start -p 3100`). `E2E_PORT` (по умолчанию 3100), `E2E_BASE_URL`, `CI`, `reuseExistingServer`. Переменные `TEST_SUPABASE_*` переименовываются в боевые имена только для процесса тестового сервера; `TEST_ENCRYPTION_KEY` по умолчанию `'0'.repeat(64)`. E2E-спеки в `tests/*.spec.ts` и их копии в `служебное/tests/`.

## 8. `.gitignore`

`node_modules/`, `.next/`, `dist/`, `out/`, `next-env.d.ts`; `.env`, `.env.*` с исключением `!.env.example`; `*.log`, `.DS_Store`, `Thumbs.db`, `.vercel`; `scripts/import/`, `check-log.txt`, `tsconfig.tsbuildinfo`, `supabase/.temp/`; артефакты сборки `.next-prod/`, `.next-prod_bak_*/`, `.next_bak_*/`, `build_out/`, `.tmp-vitest/`, `coverage/`, `public/uploads/`, `*.timestamp-*.mjs`.

## 9. Переменные окружения (все 66 из `.env.example`)

### Публичный домен и сборка
| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Основной адрес сервиса (пример `https://zapishisya.ru`). Из него выводятся `MAIN_HOSTS` |
| `NEXT_DIST_DIR` | Каталог сборки Next (по умолчанию `.next`); только для локальных сред |
| `NEXT_PUBLIC_MAIN_HOSTS` | Дополнительные основные хосты через запятую (алиасы, CDN, старые домены) |

### Supabase
| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | REST-URL проекта `https://<ref>.supabase.co` (443) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon-ключ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (только сервер, обходит RLS) |
| `SUPABASE_POOLER_URL` | Оставить пустым. Порт 6543 — Postgres-wire пулер, supabase-js по нему не работает |
| `SUPABASE_JWT_SECRET` | JWT-секрет проекта для локальной проверки токенов; слабый/короткий отключает локальную проверку |
| `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, `TEST_ENCRYPTION_KEY` | Тестовый Supabase для Playwright |
| `MOCK_SUPABASE_PORT`, `E2E_DB` | Мок-сервер Supabase в E2E |

### Партнёрская программа и платежи
| Переменная | Назначение |
|---|---|
| `PARTNER_SESSION_SECRET` | HMAC-SHA256 подписи партнёрской сессии; пусто → `ENCRYPTION_KEY` |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | Реквизиты ЮKassa; пусто или `YOOKASSA_TEST_MODE=true` → тестовый режим без списаний |
| `YOOKASSA_TEST_MODE` | `false` по умолчанию |

### Шифрование, cron, почта
| Переменная | Назначение |
|---|---|
| `ENCRYPTION_KEY` | AES-256-GCM, 64 hex (32 байта) |
| `ENCRYPTION_KEY_PREVIOUS` | Предыдущий ключ на время ротации |
| `CRON_SECRET` | `Authorization: Bearer …` для всех cron-роутов |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.yandex.ru`, `465`; пароли ящиков хранятся в БД зашифрованно |
| `ANALYTICS_SALT`, `HASH_SALT` | Соли хэшей (IP/UA не хранятся, только sha256) |

### Telegram
| Переменная | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Один бот на роли бизнеса и оператора |
| `TELEGRAM_CHAT_ID` | Чат оператора: команды `/stats`, `/health`, `/ping` только отсюда |
| `TELEGRAM_BUSINESS_BOT_TOKEN`, `TELEGRAM_BUSINESS_BOT_USERNAME` | Опциональный отдельный бот (обратная совместимость) |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет заголовка `X-Telegram-Bot-Api-Secret-Token` |
| `TELEGRAM_BIZ_SECRET` | Фолбэк-имя секрета webhook |
| `TELEGRAM_HASH_SECRET`, `TELEGRAM_BOT_USERNAME` | Соль хэшей кодов привязки, username для ссылок |

### Лицензии, админка, Vercel
| Переменная | Назначение |
|---|---|
| `LICENSE_ID`, `LICENSE_SERVER_URL`, `LICENSE_HMAC_SECRET` | Клиентская лицензия: только в коде, переданном клиенту; HMAC для `/api/license/ping` |
| `SUPERADMIN_EMAILS` | Список email супер-админов через запятую |
| `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Vercel API для кастомных доменов и проверки SSL |
| `APP_VERSION` | Версия в `/api/health` и license ping |
| `HEALTH_DB_TIMEOUT_MS` | Порог ожидания БД в healthcheck (по умолчанию 150 мс, локально 1500) |

### Юридическое и поддержка
| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_TELEGRAM` | Контакты на странице блокировки и в футере |
| `LEGAL_EMAIL`, `LEGAL_ADDRESS` | Реквизиты в письмах и документах (`общие/lib/legal.ts`) |
| `UNSUBSCRIBE_SECRET` | Секрет токенов отписки |

### E2E / CI
`E2E_PORT`, `E2E_BASE_URL`, `CI`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_ALLOW_WRITES`, `E2E_ALLOW_SAME_DB`, `E2E_BUSINESS_PATH`, `E2E_CRON_SECRET`, `E2E_LICENSE_ID`, `E2E_LICENSE_KEY`, `E2E_PANEL_PATH`, `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD`, `E2E_STAND`, `E2E_TG_SECRET`, `E2E_TG_CHAT_ID`.

Тест `общие/lib/env-example.test.ts` требует, чтобы каждая `process.env.X` из исходников была описана в `.env.example`; платформенные `NODE_ENV`, `NEXT_RUNTIME`, `VERCEL`, `VERCEL_GIT_COMMIT_SHA` исключены.
