# Том 03. Структура каталогов, алиасы, дублирующие деревья

Источники: обход файловой системы, `tsconfig.json`, `vitest.config.ts`, `vitest.config.mts`, `middleware.ts`, `instrumentation.ts`, `связь/registry.ts`.

## 1. Дерево корня

```
project/
├── app/                     315 файлов — маршруты App Router
├── общие/                   180 в lib + components + types + fixtures
│   ├── lib/                 РАБОЧАЯ бизнес-логика (алиас @/lib)
│   ├── components/          дубли публичных компонентов (алиас @/components)
│   ├── types/               imapflow.d.ts (алиас @/types)
│   ├── __fixtures__/, __test__/, test-utils/, cron-jobs/
├── lib/                     174 файла — второе дерево библиотеки (см. §3)
├── главная/                 23 файла — супер-админ-студия
│   ├── SuperAdmin.tsx       4688 строк, клиентский компонент
│   ├── components/           ActionForm, BulkTable, ConfirmDialog, Pager,
│   │                        PanelNav, PrefetchLink, Skeleton, StatusBadge, Toast
│   ├── lib/                  action.ts, audit-labels.ts, business-filters.ts,
│   │                        db.ts, fake-db.ts, guard.ts, network.ts,
│   │                        statuses.ts, url.ts + тесты
│   └── README.md
├── шаблоны/                 36 файлов — 10 визуальных тем ниш + _shared
│   ├── _shared/             NicheSite.tsx, NicheBookingFlow.tsx, niche-tenant.ts,
│   │                        themes.ts, glyph.tsx
│   └── <тема>/              README.md, template.json, theme.ts
├── components/              12 файлов — дубли публичных компонентов
│   ├── Analytics.tsx, CookieBanner.tsx, CookieBannerLazy.tsx,
│   │   CookieSettingsButton.tsx, Hero.tsx, MapBlock.tsx, MapLazy.tsx,
│   │   OceanBackdrop.tsx, Analytics.test.ts
│   ├── auth/                AuthUi.tsx, SubmitButton.tsx
│   └── templates/           StudioTemplate.tsx
├── телеграмм-бот/           telegram.ts, telegram-admin.ts, telegram-connect.ts,
│                            telegram-events.ts, telegram-format.ts,
│                            telegram-webhook.ts, telegram.fake-db.ts + тесты
├── связь/                   registry.ts — реестр манифестов шаблонов
├── служебное/               docs/ (20), patches/ (9), scripts/ (16), tests/ (41)
├── supabase/migrations/     20 SQL-файлов 0001…0020
├── scripts/                 19 файлов миграций/проверок/сидов
├── tests/                   41 файл E2E + helpers + unit
├── public/                  3769 файлов: assets/, media/, media/covers/,
│                            media/glowdetailing/, uploads/
├── types/                   imapflow.d.ts
├── patches/                 патчи
├── docs/                    design-spec, email-setup, faq, telegram-setup,
│                            troubleshooting + project/ (эта документация)
├── .github/workflows/       backup.yml (еженедельный pg_dump)
├── middleware.ts, instrumentation.ts, next.config.mjs, vercel.json,
│   tailwind.config.ts, postcss.config.mjs, playwright.config.{ts,mts},
│   vitest.config.{ts,mts}, tsconfig{,.strict}.json, package.json,
│   pnpm-lock.yaml, pnpm-workspace.yaml, .npmrc, .env.example, .gitignore
└── README.md, ARCHITECTURE.md, PROGRESS.md, DECISIONS.md, CHANGELOG.md,
    DEPLOY.md, INSTALL.md, TESTING.md, DEMO.md, KP.md, CONTRIBUTING.md,
    PROJECT_DOCUMENTATION.md
```

## 2. Алиасы и почему это важно

`tsconfig.json` маппит:
```
@/lib          → ./общие/lib
@/lib/*        → ./общие/lib/*
@/components   → ./общие/components
@/types        → ./общие/types
@/*            → ./*
```

`vitest.config.ts` и `vitest.config.mts` повторяют те же алиасы. `middleware.ts` и `instrumentation.ts` импортируют `./общие/lib/...` относительным путём (middleware — Edge, работает без алиасов Next).

**Следствие:** весь код `app/**` и `главная/**`, написанный как `import … from '@/lib/supabase'`, исполняет **`общие/lib/supabase.ts`**, а не `lib/supabase.ts`.

## 3. Два дерева `lib/` и `общие/lib/`

| | `общие/lib/` (180 файлов) | `lib/` (174 файла) |
|---|---|---|
| Статус | Рабочее, импортируется через `@/lib` | Второе дерево; прямые относительные импорты из `app/`, `главная/`, `общие/`, `middleware.ts` не найдены |
| Unit-тесты | 59 `.test.ts` в `общие/lib`, включены в `vitest.config.ts` | Тесты есть, но `include` конфига их не покрывает |
| Есть только здесь | `demo.ts`, `demo-constants.ts`, `partners.ts`, `partners-auth.ts`, `ready-services.ts`, `referrals.ts`, `entrepreneur.ts`, `appearance.ts`, `custom-domain.ts`, `auth-provider.jwt.test.ts`, `business.test.ts` | `telegram*.ts`, `yookassa` отсутствует в обоих? (присутствует в `общие/lib`), `use-slots` есть в обоих |
| Отличия | `supabase.ts` — валидация `http(s)` в `poolerUrl()`; `sw-rules.ts` — `SW_CACHE = 'booking-shell-v3'` | `supabase.ts` — иная редакция; telegram-модули |

Проверка: `grep -rn "from '\./lib\|from '\.\./lib\|from '\.\./\.\./lib"` по `app/`, `главная/`, `общие/`, `middleware.ts` — совпадений нет. Все импорты в приложении идут через `@/lib`.

**Практический вывод:** при правке бизнес-логики править нужно `общие/lib/`. Правка корневого `lib/` на работающее приложение не влияет. Это же касается `sw-source.ts` / `sw-rules.ts` (service worker берётся из `общие/lib/` через `@/lib/sw-source`).

Аналогично существуют пары `components/` ↔ `общие/components/`, `types/` ↔ `общие/types/`, `scripts/` ↔ `служебное/scripts/`, `tests/` ↔ `служебное/tests/`, `docs/*.md` ↔ `служебное/docs/*.md`. В `служебное/docs/` дополнительно лежат `PROJECT_FILES_CATALOG.md`, `AUDIT-CHECKLIST.md`, `detailing-reference.md`, `detailing-template-port.md`, `glowdetailing-demo.md`.

## 4. `app/` — организация маршрутов

```
app/
├── layout.tsx, page.tsx, globals.css, error.tsx, global-error.tsx,
│   not-found.tsx, robots.ts, sitemap.ts, icon.svg
├── [prefix]/[slug]/                     публичный сайт бизнеса
│   ├── page.tsx                         BusinessPage + generateMetadata + generateViewport
│   ├── BookingForm.tsx, booking-ui.tsx, use-booking-submit.ts, SwRegister.tsx
│   ├── booking/                         error.tsx, booking-page-ui.tsx, cancel/, reschedule/
│   ├── manifest.webmanifest/route.ts    PWA-манифест
│   └── panel/                           кабинет владельца
│       ├── login/page.tsx
│       ├── export/route.ts
│       └── (protected)/                 layout + 11 разделов
├── domain-site/by-domain/[[...rest]]/   рендер главной на кастомном домене без cookie
├── panel/                               супер-админка (старая, 13 разделов)
│   ├── page.tsx → redirect('/admin')
│   ├── login/, forgot-password/
│   └── (protected)/                     funnel, businesses, clients, inbox,
│                                         templates, verticals, email-accounts,
│                                         licenses, stats, logs, settings, backup
├── admin/                               админ-студия + предпросмотр
│   ├── page.tsx → SuperAdmin.tsx
│   ├── preview/tenant/                  TenantPreview.tsx
│   ├── chat-actions.ts, data-actions.ts, platform-actions.ts
├── partner/                             кабинет партнёра
│   ├── page.tsx, layout.tsx, PartnerShell.tsx, components.tsx,
│   │   ready-panel.tsx, actions.ts, admin-actions.ts, ready-actions.ts
│   ├── demo/page.tsx
│   └── login/page.tsx → redirect('/auth')
├── demo/                                лаунчер демо-кабинетов
│   ├── page.tsx, business/page.tsx
├── auth/                                единая страница входа/регистрации
│   ├── page.tsx, AuthCard.tsx, actions.ts
├── api/                                 ~45 route handlers (том 06)
│   ├── cron/                            14 подкаталогов + [job]
│   ├── bookings/, bookings/[token]/, bookings/slots/
│   ├── demo/, license/, telegram/, yookassa/, track/, … 
├── pay/[id]/, preview/[slug]/, invite/[token]/, unsubscribe/[token]/,
│   magic-link/, reset-password/, booking/{cancel,reschedule}/[token]/,
│   data-request/, blocked/, oferta/, privacy/, dogovor-porucheniya/,
│   dev/super-admin/, dev/templates/[key]/, sw.js/route.ts
```

## 5. Соглашения по коду (из комментариев исходников)

- **Серверные модули** явно помечаются «Только сервер» / «⚠️ только сервер»: `adminClient()` (service_role) не импортируется в `'use client'`-файлы. Тест `env-example.test.ts` проверяет, что клиентские файлы читают только `NEXT_PUBLIC_*` и `NODE_ENV`.
- **Чистые функции** выносятся отдельно от обращений к БД, чтобы покрывать unit-тестами: `generate.ts` / `generate-store.ts`, `import2gis-parse.ts` / `import2gis-store.ts`, `email-panel.ts`, `slots.ts`, `schemas.ts`, `sections.ts`, `status.ts`, `view.ts`, `rules.ts`.
- **Один запрос на сущность в рамках рендера:** `общие/lib/react-cache.ts` оборачивает `resolveBusiness`, `ownerAccess`, `currentOwner`, `ownerPanelInfo`, `readSession` в React `cache()`.
- **Server actions проверяют права сами**, даже если layout уже проверил: `главная/lib/guard.ts` (`guarded`), `requireOwnerAction()` с проверкой `sameOrigin`.
- **Идемпотентность:** миграции (`if not exists`, `add column if not exists`), cron-задачи (`cron_marks`, `cron_try_lock`), сиды (`on conflict do nothing`).
- **Транзакции в миграциях:** `begin; … commit;` (0001, 0015, 0016).
- **Типы БД:** `общие/lib/database.generated.ts` — сгенерированные типы; `общие/lib/database.types.ts` — типы строк таблиц, источник истины — схема БД.
- **Кириллица в именах каталогов** (`общие`, `главная`, `шаблоны`, `служебное`, `телеграмм-бот`, `связь`) — часть структуры проекта, алиасы это учитывают.
- **Комментарии и UI-строки — на русском языке.**

## 6. `связь/registry.ts`

Реестр шаблонов: читает `шаблоны/*/template.json` через `readdirSync`/`readFileSync`, не импортирует код шаблонов. `TemplateManifest = { name, slug, urlPrefix, description?, entry?, env? }`. `listTemplateManifests()` пропускает битые/отсутствующие манифесты.

## 7. `public/`

- `public/assets/` — `detailing-scoped.css`, `detailing-fonts.css` и шрифты (подключаются через `<link>` в лендинге, панелях и демо).
- `public/media/covers/` — обложки готовых сервисов (`detailing.svg`, `beauty.svg`, `dentist.svg`).
- `public/media/glowdetailing/` — 3 фото демо-тенанта из миграции 0015.
- `public/uploads/` — локальные загрузки (в `.gitignore`); 3769 файлов суммарно по `public/`.

## 8. Артефакты сборки в рабочей копии

В корне на дату составления лежат (не в git): `.next/`, `.next-prod/`, `.next-prod_bak_1794059788/`, `.next_bak_1794053060/`, `.next_bak_1794059672/`, `build_out/`, `dist/`, `coverage/`, `.tmp-vitest/`, `.tmp-dev.log`, `.tmp-shoot.log`, `tsconfig.tsbuildinfo`, `vitest.config.mts.timestamp-*.mjs`, `.env`, `.env.local`, `.vercel/`. Это результаты локальных сборок и локальные ключи, не исходный код.
