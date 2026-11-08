# Том 11. Запуск, сборка, тесты, скрипты, деплой

Источники: `package.json`, `README.md`, `DEPLOY.md`, `INSTALL.md`, `TESTING.md`, `CONTRIBUTING.md`, `scripts/`, `служебное/scripts/`, `tests/`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/backup.yml`.

## 1. Локальный запуск

Требования: Node 22.x (`engines`), pnpm 10, проект Supabase.

```bash
pnpm install
cp .env.example .env
# заполнить 6 обязательных + SUPERADMIN_EMAILS
pnpm dev            # next dev, порт 3000
```

Генерация ключей (`README.md`):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"        # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"  # CRON_SECRET
```

Проверки:
```bash
pnpm typecheck                     # tsc --noEmit
pnpm typecheck:strict              # tsconfig.strict.json
pnpm test:unit                     # vitest run
pnpm test:coverage
pnpm test:e2e                      # нужен TEST_SUPABASE_*
pnpm build
pnpm preflight                     # env → install → typecheck → тесты → build
pnpm cron:check                    # сверка расписаний pg_cron
```

Фактические результаты: `npx tsc --noEmit` — exit 0. Последние запуски `npx vitest run`: 08.11.2026 — 99 файлов passed / 1 skipped, 1501 тестов passed / 7 skipped; 09.11.2026 — 97 файлов passed / 1 skipped, 1409 тестов passed / 7 skipped, 2 unhandled errors (не влияют на exit code, код возврата 0).

> `TESTING.md` начинается с «Автотестов (unit, e2e) в проекте нет: ТЗ §0.4 — Тесты не пишем». Это утверждение устарело: в проекте 155 файлов `*.test.ts` + 14 `*.test.mts` (юнит) и 23 `*.spec.ts` в `tests/` (Playwright e2e; ещё 23 копии в `служебное/tests`, в run не входят). Vitest по `include`-паттерну собирает 98 файлов. `PROGRESS.md` от 30.10.2026 фиксирует 1296 passed / 85 файлов; по факту на 08.11.2026 — 1501 / 99, на 09.11.2026 — 1409 / 97+1 skipped.

## 2. Скрипты `scripts/` и `служебное/scripts/`

| Файл | Назначение |
|---|---|
| `apply-migrations.cjs` / `apply-migrations-api.cjs` | Накат миграций 0001–0014: прямой Postgres / Supabase Management API по HTTPS (в песочнице порт 5432 недоступен, DNS `ENOTFOUND`) |
| `migrate.sh` | Применение `supabase/migrations/*.sql` по порядку |
| `configure-cron.sql` | `vault.create_secret('https://zapishisya.ru','site_url')`, `vault.create_secret('<CRON_SECRET>','cron_secret')`; `ALTER DATABASE … SET app.*` закомментирован (42501 на Supabase) |
| `cron-check.sh` | Проверка расписаний pg_cron против `schedules.ts` (на заглушке psql в тестах) |
| `db-check.sh`, `db-check.sql` | Проверка схемы после миграций 0001–0007 |
| `db-supabase-shim.sql` | Имитация окружения Supabase для локальной проверки миграций |
| `probe-db.cjs` | Диагностика локального Postgres 127.0.0.1:5432 |
| `preflight.sh` | Smoke-проверка перед деплоем |
| `smoke-test.sh` | Проверка после деплоя (`TESTING.md`) |
| `check.ps1` | Windows: node, pnpm, install, typecheck, unit, build одной командой |
| `seed-demo.cjs` | Засев демо-бизнеса `m/lyubava` («Студия маникюра «Любава»»): услуги, `status='client'`, подписка до 2030-01-01; идемпотентно |
| `import-excel.ts` | CLI-импорт выгрузки 2GIS |
| `migrate-legacy.ts` | Миграция legacy-клиентов из CSV (`legacy-csv.ts` + `legacy-apply.ts`) |
| `cli.ts` | Общее для CLI: `.env.local`, проверка переменных через zod, аргументы |
| `gen-db-types.ps1` | Генерация `database.generated.ts` из схемы тестовой БД |
| `shoot.mjs`, `shoot-one.mjs` | Пакетный/одиночный скриншот страниц локального dev-сервера (Playwright) |
| `overflow.mjs` | Проверка горизонтального переполнения |

## 3. Тесты

**Unit (Vitest, `environment: node`, Supabase мокается, без сети и БД):**
- `общие/lib/` — 59 тест-файлов: auth, booking, cron, email, import2gis, analytics, legal, rate-limit, slots, schemas, site, security-headers, sw-rules, env, crypto, log, audit, notify, outreach, referrals, ready-services, phone, hours, json-ld, ssrf, transfer, backup, availability, contrast, email-*, inbox-sync, generate/import (`.test.mts`), slug, business, supabase, middleware.
- `app/` — 39 тест-файлов (route handlers, actions, страницы).
- `главная/` — `db.test.ts`, `network.test.ts`, `url.test.ts`.
- `телеграмм-бот/` — telegram-тесты.
- `tests/unit/` — `panel-actions.test.ts`, `panel-export.test.ts`, `panel-pure.test.ts` + фикстуры/моки.
- `middleware.test.ts` в корне — маршрутизация кастомных доменов, Origin, лицензия, X-Robots-Tag.

**E2E (Playwright, `tests/*.spec.ts`, 23 спеки):** `admin-businesses`, `admin-funnel`, `admin-settings`, `admin-verticals`, `analytics`, `auth`, `backup`, `cookie`, `email-accounts`, `email-inbox`, `email-templates`, `invite`, `legal`, `license`, `owner-bookings`, `owner-login`, `owner-photos`, `owner-services`, `owner-settings`, `reset`, `telegram-connect`, `unsubscribe` и др. Вспомогательные: `helpers.ts`, `admin-helpers.ts`, `owner-helpers.ts`, `email-helpers.ts`, `ui.ts`, `stand.ts`, `e2e-mock-supabase.ts`, `memory-backup-db.ts`, `support/`.

E2E использует отдельный тестовый Supabase (`TEST_SUPABASE_*`), переменные переименовываются в боевые только для процесса тестового сервера; `E2E_ALLOW_WRITES`, `E2E_ALLOW_SAME_DB` — защита от записи в прод.

## 4. Деплой (`DEPLOY.md`, 13 шагов)

| Шаг | Содержание |
|---|---|
| 0 | Что нужно заранее (аккаунты Vercel, Supabase, домен, Yandex 360, Telegram) |
| 1 | Создание проекта Supabase |
| 2 | Миграции 0001… в SQL Editor по порядку |
| 3 | Supabase Auth и первый супер-админ |
| 4 | Переменные окружения (`NEXT_PUBLIC_SITE_URL`, ключи Supabase, секреты и т.д.) |
| 5 | Vercel: проект и первый деплой |
| 6 | Домен (A/CNAME, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MAIN_HOSTS`, Vercel Domains) |
| 7 | Yandex 360: почтовые ящики |
| 8 | Telegram-боты |
| 9 | Частые cron-задачи (внешний планировщик / pg_cron + `configure-cron.sql`) |
| 10 | Резервные копии |
| 11 | Импорт 2GIS |
| 12 | Финальная проверка |

Каждый шаг заканчивается проверкой; время на всё — 2–3 часа, основная часть уходит на DNS.

## 5. Фактическая конфигурация прода (на дату составления)

- Vercel: `regions: ["lhr1"]`, 2 cron-задачи, переменные окружения в Settings → Environment Variables.
- Supabase: проект `oryzoexstuzgpbqvpjbr`, регион `aws-1-eu-west-3`; миграции 0001–0014 накатывались через Management API 29.10.2026.
- `NEXT_PUBLIC_SUPABASE_URL` должен быть REST-URL `https://oryzoexstuzgpbqvpjbr.supabase.co` (порт 443); `SUPABASE_POOLER_URL` — пустым.
- Домен `zapishisya.ru`: NS `ns1.reg.ru` / `ns2.reg.ru` (reg.ru); зона `A @ 76.76.21.21`, `A www 76.76.21.21`. Vercel в панели Domains рекомендует `A @ 216.198.79.1` и `CNAME www c404594c0542493b.vercel-dns-017.com.` — это рекомендация, а не обязательное условие; legacy-записи поддерживаются. Apex отдаёт 308 на `https://www.zapishisya.ru/`.
- `/api/health` при корректных ключах возвращает 200 `{"status":"ok","checks":{"env":"ok","db":"ok","db_latency_ms":…,"security":"ok"}}`.

## 6. Мониторинг

- `/api/health` — 200/503, без чувствительных данных; `X-Robots-Tag: noindex`, `Cache-Control: no-store`.
- `audit_log` — журнал действий (маскирование PII), `/panel/logs` и «Журнал» в админ-студии.
- `app_logs` — ошибки приложения, `logError()`.
- `cron_marks`, `cron_locks`, `cron_registry` — идемпотентность и блокировки cron.
- Алерты в Telegram оператору (`TELEGRAM_CHAT_ID`) из `admin-notify.ts`, `cron_log_error`.
- `/panel/stats` + `/api/analytics/summary` — агрегаты; materialized view `analytics_daily`.

## 7. Сборка и артефакты

`next build` → `.next` (на Vercel принудительно, см. `distDir` в томе 02). Локально при блокировке записи в `.next` используется `NEXT_DIST_DIR` (например `.next-prod`), каталоги `.next-prod_bak_*`, `.next_bak_*`, `build_out/`, `coverage/`, `.tmp-vitest/`, `public/uploads/` исключены из git. `.env`, `.env.local` в git не попадают.

## 8. Git

Ветка `master`, remote `https://github.com/KazymaAP/saas-booking.git`. Последние коммиты (по `git log`):
```
5aab7c4 refactor: demo открывается сразу как боевой кабинет; DEMO только в названии, без витрин и бейджей
6bd7260 feat: рабочие demo-кабинеты партнёра и предпринимателя — реальные данные в БД, вход в один клик, бейдж ДЕМО
239b6cf fix: service worker отдаёт ответ сразу (кэш в фоне) + таймаут сети
129ebcf fix: poolerUrl отсекает Postgres connection string (postgresql://)
f8b6cfa fix: защита poolerUrl() от Postgres connection string в env
181a2a3 fix: принудительно .next как distDir на Vercel (NEXT_OUTPUT_DIR_MISSING)
33f3cab feat: актуальное состояние платформы saas-booking
afdb5ba fix: задокументирован NEXT_DIST_DIR в .env.example
```
`git status` чистый на момент составления документа (до его добавления). `CONTRIBUTING.md` — проприетарный проект, правила веток/коммитов/стиля.
