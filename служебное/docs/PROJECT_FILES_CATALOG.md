# Полный каталог файлов проекта POLsaas-booking

> Мульти-тенантная SaaS-платформа онлайн-записи на Next.js 14 + Supabase.
> Корень проекта: `D:/Clode/POLsaas-booking/project`.
> Документ сгенерирован автоматически на основе полного обхода файлов; каждый файл описан отдельно.

## О документе

Этот файл описывает **каждый исходный файл** проекта. Для каждого файла указаны: путь, назначение/роль, ключевые экспорты и импорты (для кода), создаваемые SQL-объекты (для миграций), первый смысловой комментарий и заметные детали.

**Охват:** 12 частей, ~577 файловых записей (49 корневых/служебных + 106 в `lib/` a–m + 422 в остальных каталогах).

**Что исключено:** каталоги `node_modules/`, `.next/`, `.git/` и `dist/` (566 артефактов сборки) — это зависимости и результаты компиляции, а не исходный код. Служебный `tsconfig.tsbuildinfo` упомянут в Части 1 как артефакт.

**Структура частей:**

1. Корень проекта, конфигурация, документация, патчи, типы
2. SQL-миграции и служебные файлы Supabase
3. Скрипты автоматизации (`scripts/`)
4. Библиотека `lib/` — часть 1 (a–m)
5. Библиотека `lib/` — часть 2 (n–z, cron-jobs, тест-утилиты)
6. API-роуты (`app/api/`)
7. Супер-админка (`app/panel/`)
8. Публичный сайт и панель владельца (`app/[prefix]/`)
9. Верхнеуровневые маршруты `app/`
10. React-компоненты (`components/`)
11. Статические ресурсы (`public/`, включая 13 шрифтов)
12. Тесты (`tests/`)

---

## Часть 1. Корень проекта, конфигурация, документация, патчи, типы

Проект: Next.js 14 + Supabase мультитенантная SaaS-платформа онлайн-записи (saas-booking, v0.1.0).
Корень: D:/Clode/POLsaas-booking/project
Дата обхода: 2026-10-30.
Исключены из описания: node_modules/, .next/, dist/, .git/ (артефакты сборки и зависимости).
Всего описано файлов: 49 (включая tsconfig.tsbuildinfo как артефакт сборки).

Замечание по tsconfig.tsbuildinfo: файл D:/Clode/POLsaas-booking/project/tsconfig.tsbuildinfo (≈619 КБ) — это
инкрементальный кэш TypeScript, генерируется командой tsc --incremental. Это артефакт сборки, в .gitignore
он не входит явно (в .gitignore указан tsconfig.tsbuildinfo без пути, но фактически файл лежит в корне).
Содержимое не несёт смысловой нагрузки для каталога и не читалось полностью. Влияет на скорость последующих
запусков typecheck; при смене структуры типов может устареть (безопасно удаляется).

### package.json
- Назначение: манифест проекта и перечень зависимостей/скриптов. Имя `saas-booking`, версия `0.1.0`, private: true.
- Основные скрипты:
  - dev/build/start — Next.js цикл разработки.
  - typecheck (`tsc --noEmit`), typecheck:strict (строгая проверка инфраструктурных файлов по tsconfig.strict.json).
  - test:unit / test / test:watch / test:coverage — Vitest.
  - test:e2e — Playwright; test:cron — отдельные cron-тесты; cron:check/preflight — bash-скрипты из scripts/.
  - lint — `next lint` (сейчас НЕ настроен, падает с кодом 1, см. README/TESTING).
  - migrate — `node scripts/apply-migrations.mjs`.
- Зависимости (runtime): next 14.2.15, react/react-dom 18.3.1, @supabase/supabase-js 2.45.4, zod 3.23.8,
  react-hook-form 7.53.0, @hookform/resolvers 3.9.0, tailwindcss 3.4.13 (dev), nodemailer 6.9.15, imapflow 1.0.164,
  mailparser 3.7.1, xlsx 0.18.5 (SheetJS), leaflet 1.9.4, @phosphor-icons/react 2.1.10, archiver 7.0.1,
  browser-image-compression 2.0.2, sanitize-html 2.13.1, pino 9.4.0.
- engines.node: "24.x" (на Vercel собирается на 24.x; README пишет "20+", а CONTRIBUTING — "Vercel 24.x").
- Связи: скрипты ссылаются на scripts/*.mjs, vitest.config.*, playwright.config.*, tsconfig.strict.json.
- Риски: ESLint фактически отсутствует (pnpm lint бесполезен); pnpm 9 не ставит зависимости из-за
  pnpm-workspace.yaml без packages (нужен pnpm 10).

### tsconfig.json
- Назначение: основная конфигурация TypeScript для всего проекта (Next.js App Router).
- Ключевое содержимое: target ES2022, strict: true, noUnusedLocals/Parameters: true, модуль esnext,
  moduleResolution bundler, jsx preserve, плагин "next", baseUrl "." с alias `@/*` → `./*`.
  include: next-env.d.ts, types/**/*.d.ts, **/*.ts, **/*.tsx, .next/types, dist/types. exclude: node_modules/.next/out/coverage.
- Связи: используется Next.js при сборке; alias `@/` используется во всех модулях lib/app/components.
- Заметки: весь код проекта типизируется по этому файлу; strict-флаги повышают планку качества.

### tsconfig.strict.json
- Назначение: расширяет tsconfig.json добавлением УЗКОЙ проверки "зоны 13" (инфраструктурные файлы: env, supabase, domain-map, custom-domain, middleware, instrumentation, health/resolve-domain эндпоинты).
- Содержимое: добавляет noUncheckedIndexedAccess и exactOptionalPropertyTypes, incremental: false.
  include явно перечисляет конкретные файлы (lib/env.ts, lib/supabase.ts, middleware.ts, app/api/health/route.ts и др.).
- Заметки: by-domain НЕ включён умышленно (он тянет страницу бизнеса и OceanBackdrop.tsx). Запуск: `pnpm typecheck:strict`.

### next.config.mjs
- Назначение: настройки Next.js 14.2 (по ТЗ). Единый источник security-заголовков в headers(); middleware ставит только динамические.
- Ключевое содержимое:
  - CSP (script-src 'unsafe-inline' в dev + 'unsafe-eval'; в prod без eval), HSTS max-age 31536000, XFO DENY,
    nosniff, Referrer-Policy, Permissions-Policy (без геолокации и др.), COOP same-origin, X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies none.
  - reactStrictMode, poweredByHeader:false, compress:true, distDir из NEXT_DIST_DIR (по умолчанию .next).
  - images.remotePatterns: *.supabase.co/storage/v1/object/public/**; deviceSizes мобильные; minimumCacheTTL 86400.
  - experimental: serverComponentsExternalPackages (imapflow, nodemailer, archiver, xlsx), optimizePackageImports,
    instrumentationHook:true, staleTimes (dynamic 30, static 180).
- Связи: читает NEXT_DIST_DIR, APP_VERSION (через middleware→license). Заголовки дублируются/дополняются в middleware.ts.
- Риски/детали: dangerouslyAllowSVG:false (логотипы через <img>, не оптимизатор). distDir можно вынести вне проекта
  (важно для сред сборки, где запись в project/.next заблокирована).

### next-env.d.ts
- Назначение: автогенерируемый Next.js файл ссылок на типы next и next/image-types/global.
- Содержимое: две строки /// <reference> и комментарий "не редактировать".
- Заметки: попадает в .gitignore (next-env.d.ts); не меняется вручную.

### .env.example
- Назначение: шаблон всех переменных окружения (источник истины по env); копируется в .env.local.
- Ключевые переменные (группы):
  - Публичные: NEXT_PUBLIC_SITE_URL, NEXT_DIST_DIR, NEXT_PUBLIC_MAIN_HOSTS.
  - Supabase: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_POOLER_URL (обычно пусто), SUPABASE_JWT_SECRET.
  - Шифрование: ENCRYPTION_KEY (64 hex для AES-256-GCM SMTP-паролей), ENCRYPTION_KEY_PREVIOUS (ротация).
  - Cron: CRON_SECRET.
  - Email: SMTP_HOST=smtp.yandex.ru, SMTP_PORT=465 (прочие SMTP/IMAP берутся из БД).
  - Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_BUSINESS_BOT_TOKEN, TELEGRAM_BUSINESS_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BIZ_SECRET (фолбэк).
  - Лицензии: LICENSE_ID, LICENSE_SERVER_URL, LICENSE_HMAC_SECRET.
  - Админка: SUPERADMIN_EMAILS, аналитика/юр. реквизиты: ANALYTICS_SALT, LEGAL_EMAIL, LEGAL_ADDRESS, UNSUBSCRIBE_SECRET, HASH_SALT, TELEGRAM_HASH_SECRET, TELEGRAM_BOT_USERNAME.
  - Vercel API: VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID. APP_VERSION.
  - Тестовые (Playwright/Vitest): E2E_*, TEST_SUPABASE_*, MOCK_SUPABASE_PORT, CI и др.
  - Неиспользуемые заготовки миграции на РФ-инфраструктуру: *_PROVIDER (DB/STORAGE/EMAIL/HOSTING/LEGAL/MODE/PAYMENT), IMAP_HOST/PORT — кодом не читаются (удалены из кода, см. PROGRESS проблема 8).
- Связи: заполняется перед деплоем (DEPLOY.md шаг 4). Часть переменных проверяется lib/env.ts при старте (instrumentation.ts).
- Риски: SUPABASE_POOLER_URL: строго пусто на Vercel (порт 6543 не подходит supabase-js). Много переменных — потенциально забыть обязательные.

### .env.local
- Назначение: ЛОКАЛЬНЫЙ секретный файл с реальными значениями (в git не попадает, см. .gitignore `.env.*`).
- Содержимое: восстановлен агентом 30.10.2026 после `vercel env pull`. Указан рабочий проект Supabase `oryzoexstuzgpbqvpjbr`.
  Заполнены: NEXT_PUBLIC_SITE_URL=https://zapishisya.ru/, Supabase anon/service ключи (вписаны напрямую, в т.ч. сервисный ключ отображается открыто в этом файле — это локальный артефакт, в git не уходит),
  SUPABASE_JWT_SECRET=<VSTAVIT_JWT> (ПУСТОЙ плейсхолдер, требует заполнения), ENCRYPTION_KEY, CRON_SECRET, SUPERADMIN_EMAILS.
- Риски/релиз-блокеры: SUPABASE_JWT_SECRET не заполнен (требуется для проверки JWT в lib/auth-provider.ts). ВАЖНО: реальные секреты (service_role key, ENCRYPTION_KEY, CRON_SECRET) присутствуют в файле — это локальная копия, но по DECISIONS "Открытые риски" ключи из архива разработки рекомендуется перевыпустить перед продом. Проект Supabase указан как `oryzoexstuzgpbqvpjbr` (а не старый servis-Supabase eurtnfxwtcqadrgdveoi).

### .gitignore
- Назначение: исключение артефактов и секретов из git.
- Содержимое: node_modules, .next, dist, out, next-env.d.ts; .env и .env.* (кроме .env.example); *.log, .DS_Store,
  .vercel; scripts/import/; check-log.txt; tsconfig.tsbuildinfo; supabase/.temp/.
- Заметки: .vercel игнорируется (хотя это папка линковки Vercel). check-log.txt и tsconfig.tsbuildinfo — локальные артефакты проверок.

### .npmrc
- Назначение: настройка пакетного менеджера.
- Содержимое: `ignore-scripts=true` — postinstall-скрипты зависимостей НЕ выполняются (безопасность/воспроизводимость).
- Связи: упоминается в CONTRIBUTING — "не меняйте без причины".

### pnpm-workspace.yaml
- Назначение: конфигурация pnpm workspace.
- Содержимое: `allowBuilds: { esbuild: false }`. Поля packages НЕТ (поэтому pnpm 9 падает — нужен pnpm 10).
- Риск: на Vercel при сборке pnpm 9 ошибка "packages field missing or empty" — фикс: Install Command `npx pnpm@10 install --frozen-lockfile`.

### postcss.config.mjs
- Назначение: PostCSS пайплайн для Tailwind + autoprefixer.
- Содержимое: плагины tailwindcss и autoprefixer.
- Связи: используется при сборке CSS (globals.css, studio.css).

### tailwind.config.ts
- Назначение: конфигурация Tailwind (без shadcn).
- Содержимое: content сканирует app/**, components/**, lib/**; corePlugins.preflight:false (отключён, чтобы не ломать globals.css); theme.extend пуст (цвета задаются inline через text-[#...] и CSS-переменные).
- Заметки: preflight отключён и в config, и гарантированно в globals.css.

### vercel.json
- Назначение: конфигурация деплоя Vercel — регион и cron-задачи.
- Содержимое: regions: ["lhr1"]; crons: backup (0 3 * * 0 — раз в неделю) и cleanup-audit-log (0 6 * * * — ежедневно в 06:00 UTC).
- Связи: обе задачи соответствуют ограничению Vercel Hobby (только ежедневные/недельные). Частые cron-задачи вынесены во внешний планировщик (DEPLOY шаг 9).
- Риск: в файле всего 2 cron-задачи, хотя ARCHITECTURE/PROGRESS описывают до 15 задач; остальные 13 (send-emails, check-replies, booking-reminders, unconfirmed-reminder и др.) должны вызываться внешним планировщиком с Bearer CRON_SECRET. Это релиз-требование.

### vitest.config.mts
- Назначение: конфигурация unit-тестов (lib + server actions супер-админки, агент 7).
- Содержимое: alias `@` = корень; esbuild jsx automatic; include lib/**/*.test.ts и app/**/*.test.ts; exclude node_modules, tests/**.
- Связи: Playwright-спеки в tests/ исключены (их гонит playwright).

### vitest.config.ts
- Назначение: конфигурация unit-тестов чистой логики зоны бронирования (lib/*.test.ts).
- Содержимое: alias `@`; environment node; coverage v8 по lib/phone, slots, availability, rate-limit, schemas,
  booking-actions, booking-http с порогом 90/90/90/90; тестовые env SUPABASE (127.0.0.1:54321).
- Риск: порог покрытия 90% — жёсткое требование для CI.

### playwright.config.mts
### playwright.config.ts
- Назначение: два конфига Playwright (оба *.spec.* в tests/).
- playwright.config.mts: testDir tests, testMatch **/*.spec.mts; файл .mts намеренно вне tsconfig (include **/*.ts),
  чтобы next build/typecheck не требовали @playwright/test в package.json.
- playwright.config.ts: testMatch **/*.spec.ts; запуск против локального production-build (pnpm build && pnpm start -p 3100),
  serverEnv подставляет TEST_SUPABASE_* и выключает Telegram/лицензию; workers 1-2; регион Asia/Novosibirsk; глобальный setup.
- Связи: TEST_SUPABASE_* из .env.example; E2E_BASE_URL/reuseExistingServer.

### instrumentation.ts
### middleware.ts
(см. ниже в едином блоке "Исходные файлы в корне" — instrumentation.ts и middleware.ts)

### middleware.test.ts
### vertical-templates-preview.html
(см. ниже)

### instrumentation.ts (исходный файл в корне)
- Назначение: точка входа Next.js при старте сервера (experimental.instrumentationHook). Проверяет обязательные env ДО первого запроса и падает с понятным списком, если их нет (а не на первом запросе).
- Ключевое содержимое: `register()` вызывает `checkEnv()` из lib/env ТОЛЬКО для Node-рантайма (не Edge/middleware). При наличии проблем бросает EnvError.
- Связи: lib/env.ts (checkEnv), lib/supabase.ts (adminClient). Во время `next build` НЕ вызывается — сборка без секретов возможна.
- Заметки: гарантирует, что пропущенные обязательные переменные (6 шт: Supabase x3, ENCRYPTION_KEY, CRON_SECRET, NEXT_PUBLIC_SITE_URL) обнаруживаются сразу при старте, а не в рантайме.

### middleware.ts (исходный файл в корне)
- Назначение: Edge-middleware — лицензия, кастомные домены клиентов, проверка Origin, X-Robots-Tag (ТЗ §3.4, §5.9, §17.4). Только Edge-совместимые операции: host, cookie, path. Никаких запросов к БД и self-fetch.
- Ключевое содержимое:
  - Статические security-заголовки (CSP, HSTS, XFO, nosniff, Referrer, Permissions) — в next.config.mjs; здесь только динамические.
  - Лицензия: статус кэшируется в памяти Edge-инстанса, обновляется в фоне (waitUntil) не чаще раза в сутки; при LICENSE_ID пуст — проверка выключена (основной деплой). Cookie license_status=blocked блокирует, но подделка cookie не разблокирует (server_answered важнее).
  - Origin: для POST/PUT/PATCH/DELETE чужой Origin → 403; нет Origin (Telegram webhook, cron) → пропуск.
  - Кастомный домен: если хост не из MAIN_HOSTS и не системный путь → rewrite в /domain-site/by-domain или в /api/resolve-domain (который ставит signed cookie domain_map). Подмена клиентом x-resolve-* заголовков перезаписывается.
  - noindex для /preview/*, /panel*, коротких ссылок брони, статусов не client.
  - matcher: исключает _next/static, _next/image, favicon.ico, sw.js.
- Связи: lib/site (isMainHost, normalizeHost), lib/domain-map (signed cookie), lib/license-client (pingLicense, LICENSE_COOKIE).
- Риски/детали: логика лицензии и кастомных доменов критична для работы сайта; matcher не ловит /api/resolve-domain напрямую на основном домене (он обрабатывается как системный путь).

### middleware.test.ts (тест в корне)
- Назначение: unit-тесты маршрутизации middleware — кастомные домены, Origin, лицензия, X-Robots-Tag. Без сети и БД (моки lib/license-client, signDomainMap).
- Ключевое содержимое: 20+ проверок: основной домен пропускается без rewrite/fetch; панели и прототипы — noindex; /domain-site напрямую на основном домене → 404; кастомный домен (главная/подпуть) → rewrite в by-domain / resolve-domain; валидная cookie → /{prefix}/{slug}{path}; поддельная cookie чужого домена игнорируется; маркер __dm → 307; чужой Origin на POST → 403, без Origin → 200, GET с чужим Origin → 200; лицензия: пинг в фоне, blocked cookie → /blocked, unknown не снимает блокировку.
- Связи: импортирует ./middleware, ./lib/license-client, ./lib/domain-map. Запускается Vitest (входит в vitest.config.mts include app/** и lib/**; фактически лежит в корне, попадает под **/*.test.ts).
- Заметки: важный тест безопасности граничного слоя.

### vertical-templates-preview.html (вспомогательный файл в корне)
- Назначение: статический HTML-превью 11 ниш из seed-миграции 0003_seed.sql. Отображает карточки ниш (иконка, имя, slug, услуги с ценами/длительностью, цвета, блоки карта/галерея/отзывы). Сгенерирован для наглядности шаблонов.
- Ключевое содержимое: inline JS рендерит 11 ниш: шиномонтаж (tire-service), детейлинг, маникюр, сауна, барбершоп, автосервис, фотограф, репетитор, клининг, стоматология, ветклиника. Hero-тексты с подстановкой {name}.
- Связи: дублирует набор vertical_templates из миграции 0003 (но в миграции — SQL, здесь — визуал).
- Заметки: не используется приложением в рантайме; чисто документация/демонстрация.

### README.md
- Назначение: главное описание проекта для всех (что это, стек, быстрый старт, команды, структура, статус, документация, безопасность, лицензия).
- Ключевое содержимое: мультитенантная платформа онлайн-записи для 11 ниш; один Next.js проект + одна Supabase БД; роли (оператор / владелец / менеджер / клиент); стек (Next 14.2.15, React 18.3.1, TS 5.6.2, Tailwind 3.4.13, Supabase 2.45.4, zod/react-hook-form, nodemailer/imapflow, xlsx, leaflet); быстрый старт (pnpm install, cp .env.example .env.local, миграции 0001–0005, супер-админ); команды; структура каталогов; "Статус проекта" (известные проблемы high-priority); таблица документации.
- Связи: отсылает к ARCHITECTURE/DEPLOY/INSTALL/TESTING/CONTRIBUTING/CHANGELOG/DECISIONS/PROGRESS/KP/DEMO/docs/*.
- Риски: в разделе "Структура" упоминает миграции 0001–0005, хотя фактически их уже 0014 (см. PROGRESS/DEPLOY) — док не синхронизирован с реальным числом миграций.

### ARCHITECTURE.md
- Назначение: подробная карта кода ветки main (v0.1.0) — схема, карта проекта, роли/доступ, маршрутизация, потоки данных, схема БД, компоненты, cron, безопасность, стек, отличия от ТЗ 4.0.
- Ключевое содержимое: диаграмма Vercel + Supabase + GitHub Actions; принципы (одна БД, server доступ через adminClient service_role, без фоновых процессов — всё через /api/cron/*, слоты не хранятся); 5 ролей и матрица доступа; таблица страниц и API (20+ route handlers); схема БД (22 таблицы, связи, RLS, storage buckets photos/logos/backups); перечень lib-модулей; 15 cron-задач (только 2 в vercel.json, остальные внешним планировщиком); секция "Отличия от ТЗ 4.0" (Vercel+Supabase вместо VPS+Postgres+Kysely+Better Auth+Redis+MinIO; 22 таблицы вместо 48; single-tenant отсутствует).
- Связи: основной справочник для разработчика; дублирует часть сведений из DEPLOY/DECISIONS.
- Заметки: ценная для понимания архитектуры; указывает, что без фоновых процессов всё крутится через cron-эндпоинты.

### CHANGELOG.md
- Назначение: история версий (Keep a Changelog 1.1, SemVer). Разделы: Добавлено/Изменено/Исправлено/Удалено/Безопасность/Известные проблемы.
- Ключевое содержимое: [Unreleased] — миграция 0005_indexes, MapLazy, PhotoUploaderLazy, docs/*, smoke-test.sh, изменения next.config (staleTimes, serverComponentsExternalPackages, poweredByHeader:false). [0.1.0] — первая рабочая версия: БД (0001–0004), публичный сайт, кабинет, супер-админка, рассылка, cron, выкуп кода, инфраструктура. BREAKING для деплоя: частые cron убраны из vercel.json (Hobby-лимит). engines.node 24.x. tsx удалён из devDeps.
- Связи: версия из package.json; упоминает DEPLOY/PROGRESS.
- Заметки: фиксирует, что миграции теперь 0001–0005 (Unreleased), но DEPLOY/PROGRESS говорят уже о 0001–0014.

### CONTRIBUTING.md
- Назначение: правила работы с кодом (окружение, ветки, коммиты Conventional Commits, стиль, права доступа, миграции, env, проверки перед push, документация).
- Ключевое содержимое: требует Node 20+, pnpm 10; .npmrc ignore-scripts=true не менять; ветки feat/fix/docs/refactor/chore/db; scopes (booking/site/owner/admin/cron/email/telegram/license/domain/db/import); стиль (TS strict, alias @/, одинарные кавычки, 2 отступа, UTF-8/LF, PascalCase/filename kebab-case, первая строка-комментарий с путём и ТЗ); каждая server action/route/superadmin-проверяет права сама (не полагаться на layout); даты timestamptz UTC, отображение Europe/Moscow; миграции идемпотентны; проверки typecheck+build+smoke-test.
- Связи: anchor для всех PR; ссылается на DEPLOY/TESTING/ARCHITECTURE/DECISIONS/CHANGELOG.
- Риски: форматтер/ESLint не настроены — проверка кода только через typecheck/build.

### DECISIONS.md
- Назначение: принятые решения по умолчанию и отклонения кода от ТЗ 4.0 (с обоснованием и где в коде).
- Ключевое содержимое: разделы — имя/домен (NEXT_PUBLIC_SITE_URL + MAIN_HOSTS), инфраструктура (Vercel lhr1, Supabase, только ежедневные cron из-за Hobby, pg_dump в GitHub Actions, заготовки *_PROVIDER), архитектура (прототипы /preview, кастомные домены через rewrite, service_role, rate limit в Postgres, слоты на лету, bookings_slot_unique, service worker один, lazy карта/фото, staleTimes), данные (статусы брони, feature_flags в settings, тарифы, идемпотентные миграции, AES-256-GCM, очистка аудита), уведомления (один бот, код BIZ-xxxxxx, пул ящиков Yandex, трекинг только на SITE_URL), версии/инструменты (Next 14.2.15, Node 24.x, pnpm 10, без ORM/shadcn, react-hook-form+zod, автотестов нет, tsx через npx), отклонения от ТЗ, ОТКРЫТЫЕ РИСКИ (ФЗ-152 ст.18 ч.5 — ПД вне РФ; холодная рассылка ФЗ "О рекламе" ст.18; секреты из архива разработки нужно перевыпустить), отменённые решения (Vercel Pro→Hobby, Node 20→24.x).
- Связи: ключевой документ для понимания "почему так"; упоминает PROGRESS/DEPLOY.
- Риски: ФЗ-152 (ПД вне РФ) — осознанный риск владельца; секреты из архива нужно ротировать.

### DEMO.md
- Назначение: сценарий демонстрации платформы на 15 минут для звонка/встречи с владельцем бизнеса (цель — согласие на запуск и оплату 5000 ₽).
- Ключевое содержимое: подготовка (прототип клиента, демо-бизнес), тайминг (0–15 мин), пошаговый сценарий (боль → прототип → живая запись → кабинет → цены → закрытие), ответы на возражения, "чего не показывать" (супер-админку, ссылки отмены/переноса — сейчас не отправляются, свой домен вживую, запись в прототипе), после встречи, "если что-то пошло не так".
- Связи: отсылает к KP/PROGRESS/telegram-setup/troubleshooting.
- Заметки: в "чего не показывать" прямо указано, что ссылка на отмену/перенос клиенту НЕ отправляется (известная проблема, позже закрыта по PROGRESS проблеме 24).

### DEPLOY.md
- Назначение: пошаговый чек-лист первого деплоя на Vercel + Supabase (14 шагов + повторный деплой). Самый важный операционный документ.
- Ключевое содержимое: шаг 0 (что нужно заранее), 1 (Supabase проект, регион eu-west-2), 2 (миграции 0001–0014 в SQL Editor — ПЕРЕЧИСЛЕНЫ ВСЕ 14, включая partitions/pg_cron/analytics/rate_limit/partition_bookings), 3 (Auth + первый супер-админ через SUPERADMIN_EMAILS), 4 (env-таблица, генерация секретов), 5 (Vercel проект, Node 22.x в UI, Install Command npx pnpm@10), 6 (домен + MAIN_HOSTS в lib/site.ts), 7 (Yandex 360 ящики), 8 (Telegram один бот + webhook), 9 (ЧАСТЫЕ cron через внешний планировщик: send-emails/check-replies/booking-reminders/unconfirmed-reminder + warmup для free Supabase + вариант GitHub Actions cron-hourly), 10 (бэкап: pg_dump в GitHub Actions + JSON-копия в /panel/backup), 11 (импорт 2GIS), 12 (финальная проверка), 13 (что делать если упало), 14 (повторный деплой).
- Связи: главный источник для запуска; упоминает все остальные docs и переменные.
- Риски/релиз-блокеры: шаг 2 требует применить миграции 0001–0014 (включая 0014_partition_bookings, который по PROGRESS "создан агентом; применить на стенде перед использованием"). Частые cron ОБЯЗАТЕЛЬНО выносятся во внешний планировщик (лимит Vercel Hobby). Версии Node в разных документах расходятся (22.x в DEPLOY UI, 24.x в engines).

### INSTALL.md
- Назначение: инструкция установки копии для одного бизнеса (клиент, выкупивший код). Результат — собственная копия на аккаунтах клиента.
- Ключевое содержимое: что получает клиент (transfer ZIP с README/INSTALL/MIGRATIONS + LICENSE_ID, исходный ZIP saas-booking-src.zip, business-<slug>.json); сроки (0/31/38 дней); подготовка передачи (оператор); установка клиентом (код, Supabase, env с LICENSE_ID, Vercel, домен); перенос данных бизнеса (SQL с temp table); настройка (владелец через Supabase Users + admin_users, почта, cron, Telegram); проверка; лицензия (ping раз в сутки, active/unverified/unknown/blocked); обновления.
- Связи: связан с DEPLOY/DECISIONS (single-tenant отсутствует как сборка); важно, что separate single-tenant сборки (SINGLE_TENANT) нет — копия это тот же проект с одним бизнесом.
- Заметки: важно для сценария выкупа кода; упоминает MIGRATIONS.md (отдельный файл памятки в ZIP, не в репозитории).

### KP.md
- Назначение: коммерческое предложение для продаж (цены, условия, примеры, возражения). Документ для бизнеса.
- Ключевое содержимое: что получает клиент; для кого (11 ниш с примерами адресов /t/ /d/ /m/ /sa/ /b/ /av/ /p/ /r/ /c/ /st/ /v/); цены (Запуск 5000 ₽, Базовый 1000 ₽/мес, Свой домен 2500 ₽/мес, Выкуп кода 5000 ₽); что входит/не входит; сроки запуска; оплата/продление; 5 примеров (шиномонтаж, барбершоп, маникюр, сауна, репетитор); ответы на возражения; как начать.
- Связи: дублирует цены из README/FAQ/PROGRESS (тарифы basic 1000 / pro 2500).

### PROGRESS.md
### TESTING.md
(см. ниже)

### PROGRESS.md
- Назначение: актуальное состояние проекта по коду (что готово, частично, не сделано, известные проблемы, что нужно для запуска).
- Ключевое содержимое (обновлено 2026-10-30, v0.1.0, ветка master):
  - Сводка: БД (миграции 0001–0014, идемпотентно, проверено на PostgreSQL 17); публичный сайт и запись — готово; кабинет — готово; супер-админка — готово (server actions сами проверяют isSuperAdmin через guarded); рассылка/входящие — готово (частые cron внешним планировщиком); Telegram — готово (один бот, код BIZ-… TTL 15 мин); лицензии/передача — готово (передача .txt без ZIP/исходников, MIGRATIONS 0001–0014); документация — готово; автотесты — 1296 passed/0 failed (85 файлов), tsc чисто, build зелёный, smoke-test.
  - Готово: перечислены БД (0001–0014), публичная часть, кабинет, супер-админка (15 cron-эндпоинтов, 2 в vercel.json, 13 внешним планировщиком), интеграции.
  - Частично: cron (все задачи написаны, но частые не в vercel.json).
  - Не сделано: single-tenant сборка (только плейсхолдер), пауза 45с+3 повтора, per-site service worker, миграция на VPS/РФ-хостинг, сброс пароля владельцем, ESLint, юр. вопросы (ФЗ-152/холодная рассылка — осознанный риск).
  - ЕДИНСТВЕННЫЙ блокер живого сайта — env в Vercel "servis": там лежат VITE_*/VAPID_* от старого Vite-PWA. checkEnv требует ровно 6 переменных (3 Supabase проекта oryzoexstuzgpbqvpjbr + ENCRYPTION_KEY + CRON_SECRET + NEXT_PUBLIC_SITE_URL). ENCRYPTION_KEY добавлен агентом 30.10.2026; остаётся вставить 3 ключа Supabase и Redeploy.
  - Известные проблемы: закрыты 2026-10-24 (№30, №6, №24, №26, №27, №28, №23, №22, №29, №12, №4, №8, №7) — двухуровневая защита cleanup, guarded() для superadmin, ссылки отмены/переноса клиенту, transactional-флаг для уведомлений, алерты ботом оператора, escape HTML в Telegram, скрытие неоплаченного сайта, выбор тарифа в UI, лимиты из settings, ZIP/МИГРАЦИИ до 0014, MAIN_HOSTS через NEXT_PUBLIC_MAIN_HOSTS, APP_VERSION+удаление 8 мёртвых переменных, TTL кода BIZ. Остаётся №5 — частые cron не в vercel.json (из-за Hobby).
  - Что нужно для запуска: перевыпустить ключи; применить миграции 0001–0014 (включая 0014_partition_bookings); заполнить env; внешний планировщик для 4 частых cron; секрет SUPABASE_DB_URL для бэкапа; SPF/DKIM/DMARC + боты; smoke-test + сквозной сценарий; юр. заключение по холодной рассылке.
- Связи: важнейший документ текущего статуса; отсылает к notes.md агента документации.
- Риски/релиз-блокеры: блокер живого сайта — незаполненные 3 Supabase-ключа в Vercel "servis" (нужен Redeploy после вставки). 0014_partition_bookings — ещё не применён на стенде.

### TESTING.md
- Назначение: описание уровней проверки качества (типы/сборка/smoke-test/ручные сценарии), так как автотестов по ТЗ нет (но фактически Vitest 1296 пройдено).
- Ключевое содержимое: 4 уровня (pnpm typecheck ~30с, pnpm build 1–3 мин, scripts/smoke-test.sh ~10с, ручные сценарии 20–40 мин); быстрый запуск; типы и сборка (фиктивные env для локальной сборки без Supabase; сборке нужно ~2 ГБ RAM); smoke-test (10 проверок: /api/health WARN, /, /panel/login, /sitemap.xml, /robots.txt, security headers, cron без секрета 401, preview без токена 404, публичный сайт, cron с секретом; коды выхода 0/1/2); проверка API через curl (slots, создание брони, 409 slot_taken, 429 rate_limited, коды ошибок 400/404/409/too_late); проверка БД (SQL: RLS, bookings_slot_unique, vertical_templates, воронка, ящики, ошибки, cleanup-prototypes кандидаты); сквозной сценарий (20 шагов импорт→прототип→письмо→оплата→доступ→бронь→отмена→передача кода); ручные сценарии по разделам (бронирование, кабинет, супер-админка, кастомный домен); что покрыто и не покрыто; как добавить проверку.
- Связи: упоминает scripts/smoke-test.sh, scripts/check.ps1, vitest.
- Заметки: важно — документ пишет "автотестов нет", но PROGRESS говорит "1296 passed" — расхождение: вероятно документ устарел относительно добавленных Vitest-тестов.

### docs/design-spec.md
- Назначение: ТЗ на редизайн интерфейса saas-booking (черновик на утверждение). Статус: черновик 2026-10.
- Ключевое содержимое: цель (продукт для малого бизнеса, спокойный стиль); что входит (сайт клиента, кабинет, супер-админка, служебные); аудитория; принципы (спокойствие, один главный action, таблица только где нужно, видимые состояния, понятный текст); визуальная система (шрифт Inter, нейтральные цвета #111/#6b6b6b/#e5e5e5/#fafafa, акцент из brand_color, статусы зелёный/красный/жёлтый/серый, отступы 4–32, радиусы 8/12, без теней); компоненты (папка components/ui ещё не создана — стили в globals.css); экраны (вход, главная кабинета, брони, услуги/фото/тексты/настройки, воронка, сайт клиента); адаптивность (375/768/1280); доступность (WCAG AA, aria, фокус); что не делаем (анимации >200мс, тёмная тема, новые шрифты, изменение логики); результат и приёмка.
- Связи: относится к app/globals.css, components/ui (планируется), public/assets/studio.css (эталон rabota).

### docs/email-setup.md
- Назначение: инструкция для оператора — подключение домена к Yandex 360, SPF/DKIM/DMARC, добавление ящиков в /panel/email-accounts.
- Ключевое содержимое: как saas-booking отправляет почту (nodemailer SMTP, выбор ящика pickAccount, AES-256-GCM паролей через lib/crypto, IMAP через imapflow, сброс лимитов cron reset-email-limits); шаги 1–13 (домен Yandex 360, MX, SPF (только одна запись v=spf1 include:_spf.yandex.net ~all), DKIM (mail._domainkey TXT, 2048 бит), DMARC (p=quarantine целевое, рекомендуется ввод p=none→quarantine→reject), ящики и пароли приложений (SMTP 465 / IMAP 993), добавление в /panel/email-accounts (нужен ENCRYPTION_KEY), проверка через MXToolbox/mail-tester, проверка из консоли dig/DoH); прогрев и лимиты (10→20→35→50 писем/день по неделям); почта на домене клиента; частые ошибки (Invalid login 535, softfail SPF, dkim=none/fail, dmarc fail, блокировка Яндексом).
- Связи: упоминает lib/notify.ts, lib/crypto.ts, app/api/cron/check-replies/route.ts, DEPLOY шаг 9.
- Заметки: важно — List-Unsubscribe заголовков в письмах рассылки НЕТ (ТЗ §9.5 не реализован) — риск для доставляемости; прогрев критичен.

### docs/faq.md
- Назначение: частые вопросы (владелец бизнеса / оператор / разработчик), сверенные с кодом v0.1.0.
- Ключевое содержимое: для владельца (где сайт, как записывается, расчёт слотов в UTC+3, двойная бронь невозможна, правила записи, перерывы/выходные, отмена/перенос — ссылка клиенту НЕ отправляется (текущая версия), напоминания email за 24/2ч, индексация, PWA); кабинет (вход, сброс пароля через Supabase, менеджер vs владелец, фото до 5МБ, цвет/логотип/тексты); уведомления (Telegram /start BIZ-…, что приходит, несколько чатов, нет почты — лимит/Telegram приоритетен, спецсимволы < > & ломают parse_mode HTML); оплата/подписка (цены, перевод/СБП, просрочка 7/30 дней, нет пробного периода, возврат по оферте); данные и выкуп (CSV, удаление аккаунта, хранение вне РФ по ФЗ-152, выкуп кода); оператору (откуда бизнесы, почему письма не уходят без внешнего планировщика, лимиты рассылки, трекинг пиксель/клик, ответы IMAP, follow-up/archive, клиенты/оплата/домен/передача кода, почему в меню супер-админки 5 пунктов); инфраструктура (Vercel Hobby хватает но частые cron внешним, второй супер-админ, логи, бэкап, смена домена).
- Связи: отсылает к DEPLOY/PROGRESS/telegram-setup/troubleshooting/INSTALL.

### docs/telegram-setup.md
- Назначение: инструкция для оператора — создать бота, токен, chat id, env, webhook, проверить уведомления.
- Ключевое содержимое: зачем один бот (единый webhook /api/telegram/webhook, TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET, команды /stats /ping /health только из TELEGRAM_CHAT_ID, /start BIZ-… привязывает владельца); шаг 1 @BotFather (/newbot, /setcommands); шаг 2 токен и chat id оператора (getUpdates до регистрации webhook); шаг 3 секрет webhook (openssl rand -hex 32, допустимы A-Za-z0-9_- до 256); шаг 4 env (TELEGRAM_BOT_TOKEN/CHAT_ID/WEBHOOK_SECRET + опц. BUSINESS_BOT_TOKEN/USERNAME); шаг 5 регистрация webhook (setWebhook с allowed_updates=["message"], drop_pending_updates=true); шаг 6 проверка (getWebhookInfo, 403 без секрета, /stats, sendMessage); подключение владельца (/start BIZ-a1b2c3, TTL 15 мин НЕ проверяется в коде); что приходит владельцу (новая бронь/отмена/перенос/напоминания) и оператору (каждая бронь, оплата, SMTP error, удаление, домены, лицензия); копия клиента (свой бот); смена токена/отключение; частые ошибки (Wrong response 403, 404, SSL, conflict getUpdates, /stats молчит, спецсимволы HTML 400).
- Связи: упоминает lib/notify.ts, lib/telegram-admin.ts, app/api/telegram/webhook/route.ts, DEPLOY шаг 8.

### docs/troubleshooting.md
- Назначение: пошаговая диагностика сбоев для оператора (симптомы → проверка → решение).
- Ключевое содержимое: оглавление 14 разделов; первые 5 минут (smoke-test, сопоставление результата, статусы сервисов); где смотреть логи (/panel/logs, Vercel Logs, Supabase Logs, Telegram getWebhookInfo, SQL последних ошибок); Supabase упал (симптомы: 404 на сайтах при data:null, project paused 540, Invalid API key 401, connection slots, DB size exceeded); Vercel упал (502/504, DEPLOYMENT_NOT_FOUND, *.vercel.app работает, 504 FUNCTION_INVOCATION_TIMEOUT на cron/импорте, 500 supabaseUrl is required, 402); SMTP не работает (лимиты, Invalid login 535, SPAM 554, ENCRYPTION_KEY 64 hex); IMAP ответы не приходят (check-replies, непрочитанные за 7 дней, MX); Telegram не работает (webhook info, sendMessage 403/400/429, chat_id); Cron не работает (Bearer CRON_SECRET, Vercel Cron только если CRON_SECRET задан в Production, внешний планировщик для частых, 504 на check-replies, no_capacity); бронирование (нет слотов, сдвиг 3ч UTC→МСК, slot_taken, 429 rate_limited, 404 бизнеса, пропажа из-за process-deletions/cleanup-prototypes); кастомный домен (ssl_status, error, чужой сайт, www); вход (SUPERADMIN_EMAILS, admin_users, cookie http); лицензия и /blocked; резервная копия (SUPABASE_DB_URL Session pooler порт 5432, pg_dump version mismatch, слово ВОССТАНОВИТЬ); сообщить о сбое клиентам (шаблон письма).
- Связи: центральный операционный документ инцидентов; отсылает к DEPLOY/PROGRESS/email-setup/telegram-setup/faq.

### .github/workflows/backup.yml
- Назначение: GitHub Actions — еженедельный pg_dump базы Supabase в artifact (60 дней). Компенсирует отсутствие pg_dump на Vercel.
- Ключевое содержимое: name weekly-backup; on schedule cron '0 0 * * 0' (воскресенье 00:00 UTC = 03:00 МСК) + workflow_dispatch; job dump на ubuntu-latest; шаг Install PostgreSQL client (sudo apt-get install postgresql-client); шаг Dump (pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --format=custom --file=backup.dump); загрузка artifact db-backup-<run_id> retention-days 60.
- Связи: требует секрета репозитория SUPABASE_DB_URL (строка Session pooler, порт 5432). Перекликается с /panel/backup (JSON-копия 7 таблиц в bucket backups).
- Риски: секрет SUPABASE_DB_URL должен быть добавлен в GitHub (см. DEPLOY шаг 10, troubleshooting резервная копия). В workflow ставится postgresql-client из Ubuntu — при mismatch версии Supabase нужна правка на клиент нужной версии.

### patches/09-list-unsubscribe.agent8.patch.txt
- Назначение: патч-задача агента 8 — добавление List-Unsubscribe (RFC 2369/8058) и проверки отписки в холодную рассылку.
- Что патчит: app/api/cron/send-emails/route.ts (проверка isUnsubscribed перед отправкой, пометка skipped); lib/notify.ts (sendMail принимает headers, прокидывает в nodemailer); lib/outreach.ts (isUnsubscribed в очереди и в buildEmail, buildListUnsubscribeHeaders/buildUnsubscribeUrl, футер с ссылкой отписки, персональная ссылка).
- Связи: опирается на lib/legal (isUnsubscribed, buildListUnsubscribeHeaders, buildUnsubscribeUrl) и таблицу unsubscribes (см. r1-0006_legal SQL).
- Заметки: решает юридическую проблему 38-ФЗ ст.18 (отписка из unsubscribes).

### patches/10-booking-consent.agent3.patch.txt
- Назначение: патч-задача агента 3 — согласие на обработку ПД в форме бронирования (версия политики, privacyVersion).
- Что патчит: app/[prefix]/[slug]/BookingForm.tsx (useId, PRIVACY_VERSION из lib/legal-versions, SITE_URL, обязательный checkbox, aria-describedby, текст согласия + ссылки privacy/data-request, privacy_outdated); app/api/bookings/route.ts (PRIVACY_VERSION и getClientIp из lib/legal, ремонт regex privacyVersion, 409 privacy_outdated при старой версии, удалён локальный clientIp).
- Связи: lib/legal, lib/legal-versions (PRIVACY_VERSION), lib/site (SITE_URL).

### patches/11-landing-footer.agent15.patch.txt
- Назначение: патч-задача агента 15 — юридический футер на лендинге (реквизиты исполнителя + ссылки на документы).
- Что патчит: app/page.tsx (переделан в async, revalidate 86400, SiteFooter с getRequisites(), LEGAL_DOCS, CookieSettingsButton, operatorName, Requisites из lib/legal).
- Связи: lib/legal (LEGAL_DOCS, getRequisites, operatorName, тип Requisites), components/CookieSettingsButton.

### patches/r1-0006_legal.agent1.sql.txt
- Назначение: SQL-миграция (предложение агента 1, зона схемы БД) — юридический слой (отписки, запросы ПД, согласия cookie).
- Что патчит/создаёт: таблицы unsubscribes (email unique, token uuid, reason), data_requests (типы access/correct/delete/withdraw/unsubscribe, business_id FK, статусы), cookie_consents (ip_hash, ua_hash, accepted, policy_version); включение RLS на всех трёх (доступ только через service_role/adminClient).
- Связи: используется патчами 09/10/11 через lib/legal; без неё юр. слой пишет "в пустоту" (ошибки 500/молчаливый провал).

### patches/r1-env-example.agent13.patch.txt
- Назначение: патч-задача агента 13 — добавление юридических переменных окружения в .env.example.
- Что патчит: .env.example (добавлены UNSUBSCRIBE_SECRET, HASH_SALT, LEGAL_EMAIL, LEGAL_ADDRESS с комментариями).
- Связи: переменные из r1-0006_legal / lib/legal.

### patches/r1-robots-sitemap.agentSEO.patch.txt
- Назначение: патч-задача SEO-агента — закрыть /unsubscribe/ в robots и добавить юрдокументы в sitemap.
- Что патчит: app/robots.ts (disallow добавляет /unsubscribe/); app/sitemap.ts (LETGAL_DOCS из lib/legal → url с lastModified = дата редакции версии, priority 0.3).
- Связи: lib/legal (LEGAL_DOCS), NEXT_PUBLIC_SITE_URL как BASE.

### patches/r1-settings-address-dpa.agent7.patch.txt
- Назначение: патч-задача агента 7 — адрес для корреспонденции и доп. условия договора поручения (DPA) в настройках платформы.
- Что патчит: app/panel/(protected)/settings/actions.ts (добавлены address и dpa в saveRequisites — для ФЗ-152 ст.14 ч.7); app/panel/(protected)/settings/page.tsx (поле "Адрес для корреспонденции", textarea "Доп. условия договора поручения", примечание что карта/банк не публикуются).
- Связи: settings.platform_requisites, lib/legal (getRequisites).

### types/imapflow.d.ts
- Назначение: минимальные декларации типов для пакета imapflow 1.0.x (он не объявляет "types" в package.json, поэтому TypeScript не видит его типы). Описаны только методы, используемые в lib/inbox-sync.ts (cron check-replies). Без any.
- Ключевое содержимое: модуль 'imapflow' — интерфейсы ImapFlowOptions (host/port/secure/auth/timeout/disableAutoIdle), MailboxObject (uidValidity as bigint), MailboxLockObject, SearchObject, FetchQueryObject, FetchMessageObject (source as Buffer), класс ImapFlow (connect/logout/getMailboxLock/search/fetch/fetchOne/messageFlagsAdd).
- Связи: используется lib/inbox-sync.ts; дополняет отсутствующие типы imapflow для строгой проверки TS.
- Заметки: типизация только используемого подмножества API; при расширении inbox-sync нужно дополнять этот файл.

### .vercel/README.txt
- Назначение: автогенерируемая Vercel справка о папке .vercel (создаётся при линковке директории к проекту Vercel; содержит project.json с projectId и orgId; не коммитится).
- Содержимое: пояснение, что папка создана линковкой, project.json хранит projectId/orgId, не нужно делиться папкой (добавляется в .gitignore автоматически).
- Заметки: в данном проекте .vercel есть в рабочей копке (и не игнорируется явно в .gitignore — там просто ".vercel", что охватывает папку).

### .vercel/project.json
- Назначение: идентификаторы связки Vercel-проекта.
- Содержимое: {"projectId":"prj_AI6P0rxNOLy3pQ1jm0IZjdD01ffa", "orgId":"team_2j43PpcevB3n7qtEl0zt9kTG", "projectName":"servis"}.
- Связи: подтверждает, что проект в Vercel называется "servis" (а не saas-booking), команда team_2j43....
- Заметки: имя проекта Vercel "servis" совпадает с упоминанием "блокер живого сайта — env в Vercel servis" из PROGRESS.md.

---

## Часть 2. SQL-миграции и служебные файлы Supabase (14 файлов)

### `supabase/migrations/0001_init.sql`  (360 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** EXTENSION pgcrypto, TABLE vertical_templates, TABLE businesses, INDEX businesses_city_idx, INDEX businesses_vertical_idx, TABLE services, TABLE photos, TABLE bookings, TABLE admin_users, INDEX admin_users_auth_idx, TABLE outreach_log, TABLE emails_outgoing, TABLE emails_incoming, TABLE email_accounts, TABLE templates, TABLE settings, TABLE licenses, TABLE license_pings, TABLE feature_flags, TABLE audit_log, TABLE business_telegram_codes, TABLE business_requisites, TABLE promo_codes, TABLE pricing_plans, TABLE rate_limits, FUNCTION is_business_member, POLICY anon_read_vertical_templates, POLICY anon_read_client_businesses, POLICY anon_read_services, POLICY anon_read_photos, POLICY member_read_business, POLICY member_update_business, POLICY member_services, POLICY member_photos, POLICY member_bookings_read, POLICY member_admin_users_read
**RLS:** включается в 21 таблицах
**Комментарий:** 0001_init.sql — схема по ТЗ 2.0, раздел 4. Решения по умолчанию: прототипы /preview/{slug}; rate limit в Postgres (rate_limits). RLS включён на всех таблицах. service_role обходит RLS (серверная логика).

### `supabase/migrations/0002_lifecycle.sql`  (22 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** INDEX audit_log_created_idx
**Комментарий:** 0002_lifecycle.sql — поля жизненного цикла, нужные cron-задачам (ТЗ §19, §25, §26, §32). Транзакция: файл применяется целиком или не применяется вовсе. Дата отказа: нужна для архивации через 30 дней.

### `supabase/migrations/0003_seed.sql`  (83 стр.)
**Роль:** SQL-миграция
**Комментарий:** 0003_seed.sql - 11 ниш из ТЗ §14 и bucket для фото и логотипов (§45). Идемпотентно: повторный запуск ничего не дублирует. Длительности (мин) не заданы в ТЗ: выбраны разумные значения, владелец может поменять в кабинете.

### `supabase/migrations/0004_features.sql`  (29 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** TABLE legacy_redirects
**RLS:** включается в 1 таблицах
**Комментарий:** 0004_features.sql — поля и таблицы для оставшихся функций ТЗ. Идемпотентно. Транзакция: файл применяется целиком или не применяется вовсе. SSL кастомного домена (§51): pending | active | error

### `supabase/migrations/0005_indexes.sql`  (118 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** INDEX idx_admin_users_business_auth, INDEX idx_admin_users_auth_business, INDEX idx_services_business_active_sort, INDEX idx_photos_business_sort, INDEX idx_bookings_business_scheduled, INDEX idx_bookings_business_status, INDEX idx_bookings_scheduled_status, INDEX idx_bookings_service, INDEX idx_businesses_status_city, INDEX idx_businesses_created, EXTENSION pg_trgm, INDEX idx_businesses_name, INDEX idx_businesses_name_trgm, INDEX idx_businesses_slug_history, INDEX idx_businesses_phones, INDEX idx_businesses_emails, INDEX idx_businesses_websites, INDEX idx_businesses_source_2gis, INDEX idx_businesses_subscription_until, INDEX idx_businesses_deletion, INDEX idx_businesses_refused, INDEX idx_businesses_support_until, INDEX idx_outreach_log_business_sent, INDEX idx_outreach_log_queued, INDEX idx_outreach_log_email_account, INDEX idx_emails_outgoing_business_sent, INDEX idx_emails_outgoing_outreach, INDEX idx_emails_outgoing_sent, INDEX idx_emails_incoming_business, INDEX idx_emails_incoming_received, INDEX idx_emails_incoming_unread, INDEX idx_emails_incoming_thread, INDEX idx_licenses_issued, INDEX idx_licenses_business, INDEX idx_templates_created, INDEX idx_templates_channel, INDEX idx_telegram_codes_business, INDEX idx_telegram_codes_business_all, INDEX idx_rate_limits_window
**Комментарий:** 0005_indexes.sql — индексы под реальные запросы приложения (ТЗ 4.0 §4.51). Идемпотентно (if not exists). Источник: grep по .eq/.in/.lt/.order/.contains/.like в app/** и lib/** (карта — agent-1-db/notes.md). Правило составных индексов: сначала равенство, потом диапазон/сортировка.

### `supabase/migrations/0006_partitions.sql`  (431 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** FUNCTION public.partition_retention_months, FUNCTION public.secure_partition, POLICY p_partition_admin, FUNCTION public.ensure_month_partition, TABLE public., FUNCTION public.create_monthly_partitions, FUNCTION public.drop_old_partitions, FUNCTION public.is_partitioned, FUNCTION public.ensure_partitions_for_range, TABLE public.audit_log, TABLE public.audit_log_default, INDEX idx_audit_log_created, INDEX idx_audit_log_action, INDEX idx_audit_log_business, INDEX idx_audit_log_entity, INDEX idx_audit_log_user, TABLE public.license_pings, TABLE public.license_pings_default, INDEX idx_license_pings_pinged, INDEX idx_license_pings_license, TABLE public.app_logs, TABLE public.app_logs_default, INDEX idx_app_logs_level, TABLE public.analytics_events, TABLE public.analytics_events_default, INDEX idx_analytics_business, INDEX idx_analytics_event
**RLS:** включается в 5 таблицах
**Комментарий:** 0006_partitions.sql — партиционирование журналов по месяцам (ТЗ 4.0 §4.28, §4.36, §4.37, §4.40, §4.50).  Зачем: audit_log, license_pings, app_logs, analytics_events растут без ограничений. Месячные RANGE-партиции

### `supabase/migrations/0007_rls_audit.sql`  (870 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** EXTENSION btree_gist, FUNCTION public.set_updated_at, FUNCTION public.ensure_check, FUNCTION public.ensure_fk, FUNCTION public.current_auth_uid, FUNCTION public.is_api_role, TABLE super_admins, FUNCTION public.is_super_admin, FUNCTION public.current_business, FUNCTION public.is_anon, FUNCTION public.is_business_member, FUNCTION public.accessible_business_ids, FUNCTION public.owned_business_ids, FUNCTION public.public_business_ids, FUNCTION public.booking_range, TABLE business_holidays, TABLE admin_invites, TABLE templates_versions, TABLE email_queue, TABLE email_bounces, TABLE email_attachments, TABLE unsubscribes, TABLE imap_state, TABLE payments, TABLE receipts, TABLE code_archives, TABLE telegram_messages, TABLE notifications, TABLE webhook_events, TABLE jobs, TABLE job_locks, TABLE leads, TABLE data_requests, TABLE support_tickets, TABLE cookie_consents, TABLE slug_locks, FUNCTION public.bookings_fill_snapshot, TRIGGER trg_bookings_fill, INDEX idx_holidays_business, INDEX idx_admin_invites_business, INDEX idx_admin_invites_created_by, INDEX idx_admin_users_invited_by, INDEX idx_templates_vertical, INDEX idx_email_queue_status, INDEX idx_email_queue_business, INDEX idx_email_queue_booking, INDEX idx_email_queue_template, INDEX idx_email_queue_account, INDEX idx_emails_outgoing_message, INDEX idx_emails_outgoing_booking …
**RLS:** включается в 1 таблицах
**Комментарий:** 0007_rls_audit.sql — догоняющие колонки, недостающие таблицы ТЗ 4.0 §4, триггеры updated_at, exclusion constraint броней, хелперы RLS (§4.49), политики на всех таблицах и минимальные права. 

### `supabase/migrations/0008_pg_cron.sql`  (347 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** EXTENSION pg_cron, EXTENSION pg_net, FUNCTION public.cron_setting, FUNCTION public.cron_log_error, FUNCTION public.cron_log_result, TABLE public.cron_locks, FUNCTION public.cron_try_lock, FUNCTION public.cron_unlock, TABLE public.cron_marks, INDEX cron_marks_created_idx, FUNCTION public.cron_claim, FUNCTION public.cron_release, FUNCTION public.cron_claim_unconfirmed, FUNCTION public.cron_claim_follow_up, INDEX bookings_status_scheduled_idx, INDEX bookings_status_created_idx, INDEX businesses_status_refused_idx, INDEX businesses_status_subscription_idx, INDEX businesses_status_deletion_idx, INDEX businesses_custom_domain_idx, INDEX outreach_log_status_sent_idx, INDEX emails_outgoing_business_sent_idx, INDEX businesses_transfer_support_idx, TABLE public.cron_registry, FUNCTION public.cron_http_call, FUNCTION public.cron_keep_alive, FUNCTION public.cron_apply_registry, FUNCTION public.cron_assert_registry
**pg_cron:** 1 заданий
**RLS:** включается в 3 таблицах
**Комментарий:** 0006_pg_cron.sql — расписания cron в Supabase: pg_cron + pg_net (агент 2, зона cron). Причина: Vercel Hobby разрешает 2 cron раз в сутки, а ТЗ §8.4 требует задачи раз в минуту/5 минут/час. Реестр задач совпадает с lib/schedules.ts (проверяется lib/schedules.test.ts). Миграция идемпотентна.

### `supabase/migrations/0009_retention.sql`  (165 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** TABLE public.cron_retention_policy, INDEX if, FUNCTION public.cron_drop_old_partitions, FUNCTION public.cron_retention
**RLS:** включается в 1 таблицах
**Комментарий:** 0007_retention.sql — сроки хранения журналов (ТЗ §4.50, §16.9) и pg_cron-задачи очистки (агент 2, зона cron). Зависит от 0006_pg_cron.sql (cron_registry, cron_apply_registry, cron_log_*). Миграция идемпотентна. 

### `supabase/migrations/0010_partitions.sql`  (102 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** FUNCTION public.create_monthly_partitions_for, TABLE public., FUNCTION public.create_monthly_partitions
**RLS:** включается в 2 таблицах
**Комментарий:** 0008_partitions.sql — ежемесячное создание партиций (ТЗ §4.28, §4.36, §4.37, §4.40, §4.50) (агент 2, зона cron). Зависит от 0006_pg_cron.sql (cron_registry, cron_apply_registry, cron_log_*) и 0007_retention.sql (политика хранения). Миграция идемпотентна.

### `supabase/migrations/0011_analytics.sql`  (451 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** TABLE super_admins, FUNCTION is_super_admin, TABLE if, INDEX idx_analytics_business, INDEX idx_analytics_event, INDEX idx_analytics_session, TABLE analytics_events_default, FUNCTION analytics_secure_relation, FUNCTION analytics_create_partition, FUNCTION analytics_ensure_partitions, FUNCTION analytics_drop_old_partitions, POLICY p_analytics_events_ins, POLICY p_analytics_events_sel, MATERIALIZED VIEW analytics_daily, INDEX analytics_daily_business_day, TABLE analytics_refresh_log, FUNCTION analytics_refresh, FUNCTION analytics_refresh_if_stale, FUNCTION analytics_rate_hit, FUNCTION analytics_purge_rate_limits, FUNCTION analytics_business_summary, FUNCTION analytics_outreach_summary, FUNCTION analytics_traffic_summary, FUNCTION analytics_series
**pg_cron:** 4 заданий
**RLS:** включается в 4 таблицах
**Комментарий:** 0009_analytics.sql — собственная аналитика (ТЗ 4.0 §4.40, §4.49, §4.50, §12.3, §13.8). Идемпотентно.  Приватность: IP и User-Agent в таблицу не попадают — только sha256(значение + ANALYTICS_SALT), hex 64 символа.

### `supabase/migrations/0012_rate_limit_hit.sql`  (40 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** FUNCTION public.rate_limit_hit
**Комментарий:** 0012_rate_limit_hit.sql — атомарный rate limit для lib/rate-limit.ts (агент 3 → зона 1). Одна функция = один round-trip. INSERT … ON CONFLICT блокирует строку bucket на время апдейта, конкурентные попадания выстраиваются в очередь, поэтому превысить лимит нельзя.

### `supabase/migrations/0013_data_requests_types.sql`  (13 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** INDEX idx_data_requests_open
**Комментарий:** 0013_data_requests_types.sql — расширение типов запросов субъекта ПД (зона 5, патч r1-0006_legal). Код (lib/data-request.ts) принимает пять типов: access, correct, delete, withdraw, unsubscribe. В 0007 ограничение разрешало только три, поэтому отзыв согласия и отписка через форму падали на CHECK.

### `supabase/migrations/0014_partition_bookings.sql`  (270 стр.)
**Роль:** SQL-миграция
**Создаёт объекты:** TABLE public.bookings_new, TABLE public.bookings_default, TABLE public., INDEX idx_bookings_business_scheduled, INDEX idx_bookings_business_status, INDEX idx_bookings_scheduled_status, INDEX idx_bookings_service, INDEX idx_bookings_rescheduled_from, INDEX idx_bookings_rescheduled_to, INDEX bookings_status_scheduled_idx, INDEX bookings_status_created_idx, POLICY member_bookings_read, POLICY p_bookings_anon_ins, TRIGGER trg_bookings_fill
**RLS:** включается в 1 таблицах
**Комментарий:** 0014_partition_bookings.sql — партиционирование bookings по диапазону дат (ТЗ: 10000 тенантов, рост таблицы бронирований).  Зачем: как audit_log/license_pings (0006), таблица bookings при 10000 сервисов-детейленгов невыносимо разрастается.

---

## Часть 3. Скрипты автоматизации — `scripts/` (16 файлов)

### `scripts/apply-migrations-api.cjs`  (81 стр.)
**Роль:** Скрипт автоматизации
**Импорты (2):** node:fs, node:path
**Комментарий:** scripts/apply-migrations-api.cjs — накат миграций 0001–0014 через Supabase Management API (HTTPS).

### `scripts/apply-migrations.cjs`  (80 стр.)
**Роль:** Скрипт автоматизации
**Импорты (3):** node:fs, node:path, pg
**Комментарий:** scripts/apply-migrations.cjs — накатывает миграции 0001–0014 на Supabase/Postgres одной командой.

### `scripts/check.ps1`  (130 стр.)
**Роль:** Скрипт автоматизации

### `scripts/cli.ts`  (94 стр.)
**Роль:** Скрипт автоматизации
**Экспорты:** loadEnvFile, serviceClient, CliError, CliArgs, parseArgs, readInputFile, out, err, runCli
**Импорты (3):** node:fs, @supabase/supabase-js, zod
**Комментарий:** scripts/cli.ts — общее для CLI-скриптов импорта: .env.local, проверка переменных (Zod), аргументы, вывод.

### `scripts/cron-check.sh`  (134 стр.)
**Роль:** Скрипт автоматизации

### `scripts/db-check.sh`  (11 стр.)
**Роль:** Скрипт автоматизации

### `scripts/db-check.sql`  (186 стр.)
**Роль:** Скрипт автоматизации
**Комментарий:** scripts/db-check.sql Проверка схемы после миграций 0001–0007 (ТЗ §4, §4.49, §4.50, §10.2). Только чтение: ничего не меняет, кроме временной таблицы сессии.

### `scripts/db-supabase-shim.sql`  (53 стр.)
**Роль:** Скрипт автоматизации
**Создаёт объекты:** SCHEMA auth, SCHEMA storage, FUNCTION auth.uid, TABLE storage.buckets
**Комментарий:** scripts/db-supabase-shim.sql — минимальная имитация окружения Supabase для локальной проверки миграций на чистом PostgreSQL 16/17. НЕ применять к Supabase (там всё это уже есть). Создаёт: роли anon/authenticated/service_role, схему auth с auth.uid(), схему storage с таблицей buckets.

### `scripts/gen-db-types.ps1`  (43 стр.)
**Роль:** Скрипт автоматизации

### `scripts/import-excel.ts`  (66 стр.)
**Роль:** Скрипт автоматизации
**Импорты (3):** ../lib/import2gis, ../lib/import2gis-store, ./cli
**Комментарий:** scripts/import-excel.ts — импорт выгрузки 2GIS из командной строки (ТЗ §11.1, §13.2 шаг 1). Логика — lib/import2gis.ts.

### `scripts/migrate-legacy.ts`  (58 стр.)
**Роль:** Скрипт автоматизации
**Импорты (3):** ../lib/legacy-apply, ../lib/legacy-csv, ./cli
**Комментарий:** scripts/migrate-legacy.ts — миграция legacy-клиентов из CSV. Разбор — lib/legacy-csv.ts, запись — lib/legacy-apply.ts.

### `scripts/migrate.sh`  (64 стр.)
**Роль:** Скрипт автоматизации

### `scripts/preflight.sh`  (139 стр.)
**Роль:** Скрипт автоматизации

### `scripts/probe-db.cjs`  (52 стр.)
**Роль:** Скрипт автоматизации
**Импорты (1):** pg
**Комментарий:** scripts/probe-db.cjs — диагностика локального Postgres на 127.0.0.1:5432.

### `scripts/seed-demo.cjs`  (139 стр.)
**Роль:** Скрипт автоматизации
**Импорты (3):** node:fs, node:path, @supabase/supabase-js
**Комментарий:** scripts/seed-demo.cjs — засев демо-бизнеса (статус 'client', подписка активна)

### `scripts/smoke-test.sh`  (187 стр.)
**Роль:** Скрипт автоматизации

---

## Часть 4. Библиотека `lib/` — часть 1 (a–m)

Каталог охватывает все файлы `lib/`, чей путь после `lib/` начинается с букв **a, b, c, d, e, f, g, h, i, j, k, l, m** исходного проекта (мульти-тенантная SaaS-платформа записи на Next.js 14 + Supabase). Исключены: `cron-jobs/`, `__fixtures__/`, `__test__/`, `test-utils/`, а также `node_modules/`, `.next/`, `dist/`, `.git/`. Всего в диапазоне a–m прочитано **106 файлов**: 71 исходный модуль и 35 тестов (`.test.ts`/`.test.mts`).

Для каждого файла указаны: назначение, ключевые экспорты, зависимости, роль в архитектуре и релиз-блокеры/замечания.

---

### lib/admin-notify.ts
**Назначение:** Отправка служебных уведомлений владельцу платформы в Telegram (ошибки, сбои фоновых задач).
**Ключевые экспорты:** `notifyAdmin(text)`, `notifyAdminHtml(html)`.
**Зависимости:** `lib/telegram` (адаптер Telegram Bot API).
**Роль в архитектуре:** Утилита оповещения; используется из cron-обёрток, backup, license-сервера при критических сбоях.
**Релиз-блокеры:** Нет. Требует настроенного `TELEGRAM_BOT_TOKEN`/`CHAT_ID`; при отсутствии — тихо пропускает (fail open).

### lib/admin-session.ts
**Назначение:** Сессия супер-администратора платформы (кабинет `/panel`).
**Ключевые экспорты:** `superAdminEmails()`, `isSuperAdminEmail()`, `signInSuperAdmin()`, `superAdminAccess` (кэшированная), `isSuperAdmin`, `requireSuperAdminAction()`, `signOutSuperAdmin`.
**Зависимости:** `react-cache`, `auth-core`, `auth-request`, `auth-rate`, `auth-audit`, `auth-provider`, `auth-session`, `auth-cookies`.
**Роль в архитектуре:** Серверная сессия уровня платформы; CSRF/Origin-проверка, rate-limit, PII-маскирование в аудите.
**Релиз-блокеры:** `SUPERADMIN_EMAILS` должен быть задан; open-redirect и утечка email/IP в аудите покрыты тестами.

### lib/analytics-summary.ts
**Назначение:** Агрегированные дашборд-метрики платформы через `unstable_cache` (ТЗ §12.3/§13.8).
**Ключевые экспорты:** `SUMMARY_CACHE_SECONDS`, `loadSummary`, `parseSummaryParams`, `computeTotals`, `percent`, тип `SeriesPoint`.
**Зависимости:** `lib/supabase` (RPC `analytics_*`), `next/cache`.
**Роль в архитектуре:** Серверный загрузчик отчётов для страниц админа/владельца.
**Релиз-блокеры:** RPC-имена должны существовать в БД; ошибка агрегата пробрасывается без деталей запроса.

### lib/analytics.ts
**Назначение:** Приватная аналитика событий: хэширование IP/UA (SHA-256 + суточная соль по МСК), без PII в БД (ТЗ §12.3).
**Ключевые экспорты:** `ANALYTICS_EVENTS`, `sha256Hex`, `dailySalt`, `buildEventRow`, `trackPageview`, `insertEvents`, `hashIp`, `hashUa`, `getSessionId`, `sessionCookie`, `isBot`, `isDoNotTrack`, `isPrefetch`, `clientIp`, `normalizePath`, `normalizeReferrer`.
**Зависимости:** `lib/supabase`, `lib/env` (`ANALYTICS_SALT`).
**Роль в архитектуре:** Аналитический клиент (edge-совместимый через Web Crypto).
**Релиз-блокеры:** Без соли события не пишутся (приватность важнее полноты); DNT/Sec-GPC уважаются.

### lib/audit.ts
**Назначение:** Запись событий в `audit_log` с маскированием ПД (ФЗ-152).
**Ключевые экспорты:** `audit()`, `auditMany()`, `maskPii()`, `maskString()`, `buildAuditRow()`, константа `HIDDEN`.
**Зависимости:** `lib/supabase`.
**Роль в архитектуре:** Единая точка аудита; рекурсивное маскирование секретов/email/телефонов, ограничение глубины/длины.
**Релиз-блокеры:** Ошибка БД не пробрасывается (возвращает `false`); UUID-сущности кладутся в `entity_id`, не-UUID — в `payload.ref`.

### lib/auth-audit.ts
**Назначение:** PII-свободная запись auth-событий (входы, magic/reset, CSRF, rate-limit).
**Ключевые экспорты:** `authEvent(action, details)`.
**Зависимости:** `lib/audit`.
**Роль в архитектуре:** Тонкая обёртка аудита для auth-подсистемы.
**Релиз-блокеры:** Нет.

### lib/auth-cookies.ts
**Назначение:** Работа с сессионными cookie (host-only, httpOnly, secure, SameSite=Lax).
**Ключевые экспорты:** `cookieNames()`, `readSessionCookies()`, `writeSessionCookies()`, `clearSessionCookies()`.
**Зависимости:** `next/headers` (cookies).
**Роль в архитектуре:** Низкоуровневый доступ к cookie сессий (sa_session/sa_refresh, biz_session/biz_refresh).
**Релиз-блокеры:** Нет.

### lib/auth-core.ts
**Назначение:** Чистые крипто/валидационные функции аутентификации (ядро, без IO).
**Ключевые экспорты:** `SESSION_TTL_SECONDS`, `MAGIC_LINK_TTL_SECONDS`, `RESET_TTL_SECONDS`, `INVITE_TTL_SECONDS`, `normalizeEmail()`, `checkPassword()`, `generateToken()`, `tokenDigest()`, `safeEqual()`, `fingerprint()`, `pluralRu()`, `ttlText()`, `sanitizeNext()`, `sanitizePanelNext()`, `isSameOrigin()`, `jwtExpiry()`, `verifyJwtHs256()`, `jwtAlg()`, `accessTokenFresh()`, `panelRootOf()`, `tokenState()`, `parseEmailList()`, `isUuidV4()`, `parseClientIp`, `expireAt`.
**Зависимости:** `node:crypto` (или Web Crypto в Edge).
**Роль в архитектуре:** Фундамент всех auth-проверок; локальная проверка JWT (HS256), защита от open-redirect, timing-safe сравнение.
**Релиз-блокеры:** Отвергает alg=none и роли anon/service_role; строгая нормализация email; детерминированные TTL по ТЗ.

### lib/auth-flow.ts
**Назначение:** Логика потоков входа (owner/superadmin), возврат после успеха.
**Ключевые экспорты:** `ADMIN_HOME`, `slugFromPanelPath()`, `normalizeReturnTo()`, `loginPathFor()`, `isEligible()`, `startRealmSession()`.
**Зависимости:** `auth-core`, `auth-session`.
**Роль в архитектуре:** Связка между realm (owner/admin) и целевыми путями.
**Релиз-блокеры:** open-redirect нейтрализуется в `normalizeReturnTo`.

### lib/auth-forms.ts
**Назначение:** Помощники для страниц аутентификации (тексты ошибок, разбор форм, realm из next).
**Ключевые экспорты:** `AUTH_ERROR_TEXT`, `AUTH_NOTICE_TEXT`, `AUTH_REFERRER_POLICY`, `errorText()`, `noticeText()`, `formString()`, `realmFromNext()`, `withQuery()`, `param()`.
**Зависимости:** `auth-core`.
**Роль в архитектуре:** UI-хелперы и парсинг query/форм.
**Релиз-блокеры:** `withQuery` экранирует; показываются только известные коды ошибок.

### lib/auth-invites.ts
**Назначение:** Приглашения участников в кабинет бизнеса (одноразовые токены).
**Ключевые экспорты:** `createInvite()`, `peekInvite()`, `acceptInvite()`, `listPendingInvites()`, `revokeInvite()`.
**Зависимости:** `auth-core`, `auth-tokens`, `auth-provider`, `supabase`.
**Роль в архитектуре:** Серверные экшены приглашений; в БД хранится только дайджест токена.
**Релиз-блокеры:** Повторное приглашение гасит предыдущее; rate-limit 5/час/IP; пароль не попадает в аудит.

### lib/auth-magic.ts
**Назначение:** Вход по magic-link (ТЗ §5.4).
**Ключевые экспорты:** `requestMagicLink()`, `peekMagicLink()`, `consumeMagicLink()`, `slugFromPanelPath()`.
**Зависимости:** `auth-core`, `auth-tokens`, `auth-provider`, `auth-flow`, `auth-rate`, `supabase`.
**Роль в архитектуре:** Серверные экшены magic-link; одноразовость, TTL 15 мин, CSRF/rate-limit.
**Релиз-блокеры:** Неизвестный/неактивный бизнес — тот же ответ «sent», письма нет (нельзя узнать, кто зарегистрирован); перебор токенов — rate_limited.

### lib/auth-mail.ts
**Назначение:** Шаблоны писем аутентификации (invite/magic/reset).
**Ключевые экспорты:** `inviteMail()`, `magicLinkMail()`, `resetMail()`, `deliver()`.
**Зависимости:** `lib/email-*` (доставка), `lib/legal` (unsubscribe).
**Роль в архитектуре:** Генерация транзакционных писем auth.
**Релиз-блокеры:** Тексты берут сроки из TTL; пароль никогда не включается в письмо.

### lib/auth-provider.ts
**Назначение:** Единая обёртка над Supabase Auth (точка замены на Better Auth).
**Ключевые экспорты:** `passwordSignIn()`, `refreshTokens()`, `verifyAccessToken()`, `sessionWithoutPassword()`, `createUserWithPassword()`, `revokeSession()`, `setUserPassword`, `revokeAllSessions`.
**Зависимости:** `lib/supabase`.
**Роль в архитектуре:** Инкапсулирует провайдер аутентификации.
**Релиз-блокеры:** Сбой провайдера при consume возвращает токен в оборот (retry-safe).

### lib/auth-rate.ts
**Назначение:** Rate-limit для auth по отпечатку (email+IP).
**Ключевые экспорты:** `allowRate()`, `allowAll()`.
**Зависимости:** `lib/rate-limit`, `auth-core` (fingerprint).
**Роль в архитектуре:** Бакеты лимитов (login_ip, magic_email и т.п.).
**Релиз-блокеры:** Нет.

### lib/auth-request.ts
**Назначение:** Контекст входящего запроса (IP, host, sameOrigin, mainHost).
**Ключевые экспорты:** `requestContext()`, `ownerBasePath()`.
**Зависимости:** `next/headers`, `auth-core`.
**Роль в архитектуре:** Источник метаданных запроса для проверок.
**Релиз-блокеры:** Нет.

### lib/auth-reset.ts
**Назначение:** Сброс пароля (ТЗ §5.5).
**Ключевые экспорты:** `requestPasswordReset()`, `peekPasswordReset()`, `completePasswordReset()`.
**Зависимости:** `auth-core`, `auth-tokens`, `auth-provider`, `auth-flow`, `supabase`.
**Роль в архитектуре:** Серверные экшены сброса; TTL 1 час, смена пароля + отзыв сессий.
**Релиз-блокеры:** Пароль/email/токен не попадают в audit; перебор токенов 20/15 мин/IP.

### lib/auth-roles.ts
**Назначение:** Разграничение разделов кабинета по ролям (owner/manager).
**Ключевые экспорты:** `ROLE_GENITIVE`, `OWNER_ONLY_SECTIONS`, `sectionAllowed()`, `sectionOf()`.
**Зависимости:** Нет (чистая логика).
**Роль в архитектуре:** Авторизация в кабинете владельца.
**Релиз-блокеры:** Manager не видит настройки/подписку/команду.

### lib/auth-session.ts
**Назначение:** Жизненный цикл сессии (чтение/обновление/завершение).
**Ключевые экспорты:** `readSession` (кэш), `refreshSession()`, `startSession()`, `endSession()`, `refreshUrl()`.
**Зависимости:** `auth-provider`, `auth-cookies`, `react-cache`.
**Роль в архитектуре:** Управление сессией пользователя.
**Релиз-блокеры:** Нет.

### lib/auth-tokens.ts
**Назначение:** Одноразовые токены (magic/reset/invite) с дайджестами.
**Ключевые экспорты:** `issueToken()`, `peekToken()`, `claimToken()`, `releaseToken()`.
**Зависимости:** `auth-core`, `supabase`.
**Роль в архитектуре:** Хранилище токенов (только digest в БД).
**Релиз-блокеры:** Одноразовость; истёкший/использованный токен отклоняется.

### lib/availability.ts
**Назначение:** Занятость и свободные слоты записи.
**Ключевые экспорты:** `busyForDay()`, `holidaysBetween()`, `slotsForDay()`, `freeSlotsFor()`, `businessTimeZone()`, `bookingDurationMinutes`.
**Зависимости:** `lib/slots`, `lib/supabase`.
**Роль в архитектуре:** Расчёт доступности для клиентского виджета записи.
**Релиз-блокеры:** Ошибка БД пробрасывается (не «всё свободно»); невалидная дата — пусто без запроса; учёт буферов услуг и часового пояса.

### lib/backup-deps.ts
**Назначение:** Производственные зависимости для backup/restore (DB, lock, notify, audit).
**Ключевые экспорты:** `backupJobDeps()`, `restoreRequestDeps()`.
**Зависимости:** `lib/backup` (BackupDb), `lib/supabase`, `lib/admin-notify`.
**Роль в архитектуре:** Связка реальных сервисов для cron/route handler.
**Релиз-блокеры:** Нет.

### lib/backup-shared.ts
**Назначение:** Общие константы/типы резервного копирования.
**Ключевые экспорты:** `BACKUP_TABLES`, `PARENTS`, типы `BackupDump`, `perTable()`, `backupFileDate()`.
**Зависимости:** Нет.
**Роль в архитектуре:** Порядок родитель→ребёнок при restore.
**Релиз-блокеры:** Нет.

### lib/backup.ts
**Назначение:** JSON-бэкап в Storage + восстановление (ТЗ: полнота, идемпотентность, retention, integrity).
**Ключевые экспорты:** `BACKUP_FORMAT`, `PAGE_SIZE`, `RESTORE_BATCH`, `SIGNED_URL_TTL_S`, `collectBackup()`, `runBackup()`, `pruneBackups()`, `parseDump()`, `restoreDump()`, `restoreFromFile()`, `performBackup()`, `handleRestoreRequest()`, `supabaseBackupDb()`, `scrubDbError()`, `tablesChecksum()`, `isBackupFileName`, `backupFileName`, `listBackups`, `isRestoreConfirmed`, `formatReport`.
**Зависимости:** `lib/supabase` (Storage), `backup-shared`, `crypto` (checksum), `log`, `admin-notify`.
**Роль в архитектуре:** Подсистема бэкапа; используется cron-роутом и route `/api/backup/restore`.
**Релиз-блокеры:** SHA-256 контроль целостности; отвергает будущую версию/дубли id/обрезанные файлы; PII-маскирование в ошибках БД (`scrubDbError`); блокировка на время restore (409 при параллели).

### lib/booking-action-state-types.ts
**Назначение:** Клиентобезопасные типы состояния экшенов записи.
**Ключевые экспорты:** тип `ActionState`, `IDLE_STATE`.
**Зависимости:** Нет.
**Роль в архитектуре:** Типы для useOptimistic/форм на клиенте.
**Релиз-блокеры:** Нет.

### lib/booking-action-state.ts
**Назначение:** Ядра серверных экшенов отмены/переноса.
**Ключевые экспорты:** `runCancel()`, `runReschedule()`.
**Зависимости:** `booking-actions`, `booking-http`.
**Роль в архитектуре:** Серверные действия (Server Actions).
**Релиз-блокеры:** Нет.

### lib/booking-actions.ts
**Назначение:** Отмена и перенос записи по токену (ТЗ: окна, лимиты, CAS-обновление).
**Ключевые экспорты:** `bookingByToken()`, `cancelBooking()`, `rescheduleBooking()`, `isActive()`, `withinCancelWindow()`.
**Зависимости:** `supabase`, `availability`, `booking-notify`, `audit`, `log`.
**Роль в архитектуре:** Бизнес-логика записи; конкурентная защита через conditional update (23P01 → slot_taken).
**Релиз-блокеры:** Окно отмены/переноса по абсолютному времени (независимо от пояса); счётчик переносов (старая схема без колонки → счёт по audit_log); телефон возвращается только при too_late/reschedule_limit.

### lib/booking-client.ts
**Назначение:** Браузерные обёртки fetch для записи.
**Ключевые экспорты:** `createBookingClient()`, `browserBookingClient()`.
**Зависимости:** `lib/site` (SITE_URL).
**Роль в архитектуре:** Клиентский API записи.
**Релиз-блокеры:** Нет.

### lib/booking-dates.ts
**Назначение:** Даты/опции расписания (клиент+сервер).
**Ключевые экспорты:** `dateBounds()`, `dateOptions()`, `firstOpenDate()`, `resolveSchedule()`.
**Зависимости:** `availability`, `hours`.
**Роль в архитектуре:** Помощники по датам виджета.
**Релиз-блокеры:** Нет.

### lib/booking-http.ts
**Назначение:** Помощники route handler записи.
**Ключевые экспорты:** `REASON_STATUS`, `fail()`, `ok()`, `isSameOrigin()`, `limitOrFail()`, `readJson()`, `validationFailure()`.
**Зависимости:** `rate-limit`, `zod`.
**Роль в архитектуре:** HTTP-ответы и CSRF/rate-limit для API записи.
**Релиз-блокеры:** 12 кодов решений; `no-store`; отклоняет большое/мусорное тело; проверка Origin (CSRF).

### lib/booking-notify.ts
**Назначение:** Уведомления о записи (бизнесу и клиенту).
**Ключевые экспорты:** `notifyCreated()`, `notifyChanged()`, `notifyClientBooking()`, `escapeHtml()`, `createdText()`.
**Зависимости:** `lib/notify`, `lib/email-*`, `supabase`.
**Роль в архитектуре:** Уведомления о событиях записи.
**Релиз-блокеры:** Нет.

### lib/booking-view.ts
**Назначение:** Данные страницы записи для Server Component.
**Ключевые экспорты:** `loadBookingView()`, `bookingSitePath()`, `viewStateOf()`.
**Зависимости:** `business`, `availability`, `supabase`.
**Роль в архитектуре:** Загрузка представления записи.
**Релиз-блокеры:** Нет.

### lib/business.ts
**Назначение:** Разрешение бизнеса по prefix/slug (мульти-тенантность).
**Ключевые экспорты:** `resolveBusiness()` (кэш), `activeServices()`.
**Зависимости:** `supabase`, `react-cache`.
**Роль в архитектуре:** Центральное разрешение контекста бизнеса.
**Релиз-блокеры:** Нет.

### lib/contrast.ts
**Назначение:** Выбор читаемого цвета текста на акцентном фоне (WCAG).
**Ключевые экспорты:** `onAccentColor()`.
**Зависимости:** Нет.
**Роль в архитектуре:** Утилита UI/брендинга.
**Релиз-блокеры:** Невалидный цвет → белый текст (безопасный запас).

### lib/cron-context.ts
**Назначение:** Контекст выполнения cron-задачи.
**Ключевые экспорты:** `makeCronContext()`, `CRON_BUDGET_MS`.
**Зависимости:** `supabase`, `log`.
**Роль в архитектуре:** Передаётся в `runCronJob`.
**Релиз-блокеры:** Нет.

### lib/cron.ts
**Назначение:** Авторизация и обёртка cron-задач (Bearer + блокировка).
**Ключевые экспорты:** `isCronAuthorized()`, `requireCron()`, `runCronJob()`, `safeEqual()`, `redactPii()`, `jsonResponse()`.
**Зависимости:** `cron-context`, `log`, `audit`.
**Роль в архитектуре:** Общий каркас всех cron route handlers.
**Релиз-блокеры:** Пустой `CRON_SECRET` → отказ; блокировка TTL ≤120с; email вырезается из текста ошибок (`redactPii`); 401 без вызова хендлера; 500 не раскрывает сырую ошибку.

### lib/crypto.ts
**Назначение:** Шифрование секретов AES-256-GCM (Web Crypto / node).
**Ключевые экспорты:** `encryptSecret()`, `decryptSecret()`, `encryptWithKey()`, `decryptWithKey()`, `parseKey()`, `needsReencrypt()`, `reencryptSecret()`, `isEncryptionConfigured()`, `CryptoConfigError`, `DecryptError`.
**Зависимости:** `lib/env` (`ENCRYPTION_KEY`, `ENCRYPTION_KEY_PREVIOUS`).
**Роль в архитектуре:** Защита SMTP/IMAP-паролей и других секретов в БД.
**Релиз-блокеры:** Ключ — 64 hex; ротация через предыдущий ключ; ошибка конфигурации не содержит ключ; поддержка legacy-формата `iv.tag.data`.

### lib/custom-domain.ts
**Назначение:** Разрешение бизнеса по пользовательскому домену.
**Ключевые экспорты:** `findBusinessByDomain()`.
**Зависимости:** `supabase`, `domain-map`.
**Роль в архитектуре:** Маршрутизация кастомных доменов.
**Релиз-блокеры:** Нет.

### lib/data-request.ts
**Назначение:** Запросы субъекта ПД по ФЗ-152 (доступ/исправление/удаление).
**Ключевые экспорты:** `DataRequestSchema`, `parseDataRequestForm()`, `dataRequestSuccessText()`, `DATA_REQUEST_TEXT_MAX`.
**Зависимости:** `zod`.
**Роль в архитектуре:** Парсинг формы субъектного запроса.
**Релиз-блокеры:** Honeypot-поле; управляющие символы вырезаются; срок ответа 10 рабочих дней; неизвестный тип/плохой email → ошибки по полям.

### lib/database.types.ts
**Назначение:** Уточнённые TypeScript-типы БД.
**Ключевые экспорты:** типы `Business`, `Booking`, `Service`, `AdminUser`, `WorkingHours`, union статусов.
**Зависимости:** `@supabase/supabase-js`.
**Роль в архитектуре:** Общие типы данных проекта.
**Релиз-блокеры:** Нет.

### lib/domain-map.ts
**Назначение:** HMAC-подписанная cookie «домен → prefix/slug» (Edge-safe).
**Ключевые экспорты:** `DOMAIN_MAP_COOKIE`, `signDomainMap()`, `verifyDomainMap()`, `isValidPrefix()`, `isValidSlug()`, тип `DomainMap`.
**Зависимости:** `lib/env` или переданный секрет (Web Crypto).
**Роль в архитектуре:** Быстрая маршрутизация кастомных доменов на Edge.
**Релиз-блокеры:** Подпись привязана к хосту; истёкшая/подменённая/мусорная → null; невалидный prefix/slug отвергается.

### lib/email-accounts.ts
**Назначение:** Ротация ящиков Yandex 360, дневной лимит, SMTP/IMAP-опции.
**Ключевые экспорты:** `chooseAccount()`, `pickAccount()`, `markSent()`, `smtpOptions()`, `imapOptions()`, `toPublicAccount()`, `supabaseAccountStore()`, `todayMsk()`, `effectiveSentToday()`, `remainingCapacity()`, `markFailed()`, `markHealthy()`, `normalizeSecure()`, `fromHeader()`, `shortError()`, `invalidateAccountCache()`.
**Зависимости:** `crypto`, `rate-limit`/store, `supabase`.
**Роль в архитектуре:** Выбор ящика для рассылки/транзакционных писем.
**Релиз-блокеры:** Кэш списка ящиков; сброс счётчика при смене дня (МСК); гонка счётчика через conditional increment; `toPublicAccount` не отдаёт шифротекст; транзакционная отправка берёт ящик вне лимита.

### lib/email-inbound.ts
**Назначение:** Разбор входящих писем (bounce/DSN, автоответы, спам, sanitize, вложения).
**Ключевые экспорты:** `parseBounce()`, `classifyInbound()`, `classifyBounce()`, `isAutoReply()`, `isSpam()`, `sanitizeIncomingHtml()`, `safeFilename()`, `messageFolder()`, `parentIds()`, `threadIdOf()`, `domainOf()`, `isFreeMailDomain()`.
**Зависимости:** `mailparser` (в тестах).
**Роль в архитектуре:** Классификация и очистка входящей почты.
**Релиз-блокеры:** `sanitizeIncomingHtml` удаляет script/onclick/javascript/style/iframe; внешние картинки трекеров удаляются; ссылки получают `rel=noopener`; safeFilename убирает `../`.

### lib/email-panel.ts
**Назначение:** Помощники панели почты (формы ящиков/шаблонов, нити, ответ).
**Ключевые экспорты:** `parseAccountForm()`, `parseTemplateForm()`, `parseInboxFilter()`, `groupThreads()`, `filterThreads()`, `replySubject()`, `replyReferences()`, `sampleClientVars()`, `contentChanged()`, `unknownPlaceholders()`, тип `InboxMessage`.
**Зависимости:** `zod`, `email-render` (`TEMPLATE_VARIABLES`), `supabase`, `log`.
**Роль в архитектуре:** UI/парсинг кабинета рассылок.
**Релиз-блокеры:** Пароль обязателен для нового ящика; header-injection очищается; группировка по thread_id (не по адресу); тип шаблона должен соответствовать каналу.

### lib/email-queue.ts
**Назначение:** Очередь писем (конечный автомат retry/bounce/unsubscribe).
**Ключевые экспорты:** `MAX_PER_RUN`, `runQueue()`, `processItem()` (внутр.), `nextAttempt()`, `messageIdFor()`, `mailFromItem()`, `retryDelayMs()`, `supabaseQueueStore()`.
**Зависимости:** `supabase`, `rate-limit`, `log`, `site`, `notify`.
**Роль в архитектуре:** Движок отправки очереди писем.
**Релиз-блокеры:** Лимит 50/вызов; бюджет времени; retry 1ч/4ч → failed + алерт (без email); hard bounce → failed + запись; отписавшийся/подавленный не отправляется; каждый ящик ≤1 раз за вызов; идемпотентность message_id; fail open при сбое записи.

### lib/email-render.ts
**Назначение:** Рендер шаблонов писем (переменные, inline CSS, экранирование).
**Ключевые экспорты:** `renderEmail()`, `substitute()`, `renderSubject()`, `renderText()`, `textToHtml()`, `htmlToText()`, `inlineCss()`, `rewriteLinks()`, `escapeHtml()`, `extractVariables()`, `EmailTooLargeError`, `MAX_EMAIL_BYTES`, `TEMPLATE_VARIABLES`.
**Зависимости:** Нет (чистая функция).
**Роль в архитектуре:** Генерация HTML/текста писем.
**Релиз-блокеры:** 19 переменных ТЗ §9.9; значения экранируются (нет инъекции плейсхолдеров); размер >500 КБ → ошибка; заголовки писем без CRLF (header injection).

### lib/email-template-types.ts
**Назначение:** Типы/константы каналов и типов шаблонов писем.
**Ключевые экспорты:** `TEMPLATE_CHANNELS`, `OUTREACH_TYPES`, `CLIENT_TYPES`.
**Зависимости:** Нет.
**Роль в архитектуре:** Справочные типы для email-подсистемы.
**Релиз-блокеры:** Нет.

### lib/email-tracking.ts
**Назначение:** Открытия/клики (трекинг) и отписка по токену.
**Ключевые экспорты:** `recordEvent()`, `recordEventSafe()`, `unsubscribeByToken()`, `allowTrack()`, `clientIp()`, `tokenKind()`, `isTokenKnown()`, `TRACK_LIMIT`, `TRACK_WINDOW_SECONDS`.
**Зависимости:** `supabase`, `rate-limit`, `log`.
**Роль в архитектуре:** Пиксель/клик-трекинг и one-click unsubscribe (RFC 8058).
**Релиз-блокеры:** Идемпотентность (первое событие); fail open при сбое лимита; статус бизнеса не откатывается назад; legacy-токены поддерживаются; отписка регистронезависима и не дублируется.

### lib/env.ts
**Назначение:** Проверка обязательных переменных окружения.
**Ключевые экспорты:** `REQUIRED_ENV`, `checkEnv()`, `requireEnv()`, `EnvError`.
**Зависимости:** `lib/env`-секреты.
**Роль в архитектуре:** Валидация конфигурации при запуске.
**Релиз-блокеры:** `ENCRYPTION_KEY` — 64 hex; `CRON_SECRET` достаточной длины; SITE_URL без пути; Supabase http допустим только для 127.0.0.1/localhost; значения не попадают в текст ошибки (секреты не утекают).

### lib/flash.ts
**Назначение:** Одноразовые уведомления (flash) без секретов.
**Ключевые экспорты:** `writeFlash()`, `readFlash()`, `parseFlash()`, `FLASH_COOKIE`.
**Зависимости:** `next/headers`.
**Роль в архитектуре:** Короткие сообщения после редиректа.
**Релиз-блокеры:** Пароль/секрет из cookie старого формата отбрасываются; только известные не-секретные виды сообщений.

### lib/generate-og.ts
**Назначение:** Извлечение OG-изображения сайта (SSRF-safe).
**Ключевые экспорты:** `extractOgImage()`, `fetchOgImage()`.
**Зависимости:** `lib/ssrf` (безопасный fetch), `generate-store`.
**Роль в архитектуре:** Получение логотипа/фото из сайта бизнеса.
**Релиз-блокеры:** Приватные/локальные адреса отбрасываются; бюджет 5с; SSRF-блок без повтора; относительные URL резолвятся от страницы.

### lib/generate-store.ts
**Назначение:** Интерфейс хранилища генератора + Supabase-адаптер.
**Ключевые экспорты:** интерфейс `GenerateStore`, `supabaseGenerateStore()`.
**Зависимости:** `supabase`.
**Роль в архитектуре:** Абстракция БД для генератора прототипов.
**Релиз-блокеры:** `slugTaken` проверяет slug + slug_history; отсутствие колонок generation_* обрабатывается (fallback без них); ошибка БД пробрасывается с контекстом.

### lib/generate.ts
**Назначение:** Генератор прототипов бизнеса (slug, услуги, SVG-логотип, favicon, preview).
**Ключевые экспорты:** `generatePrototype()`, `generateMany()`, `initialsLogo()`, `safeColor()`, `previewUrl()`, `initials()`, `templateServices()`.
**Зависимости:** `generate-store`, `generate-og`, `ssrf`, `crypto` (uuid), `retry`.
**Роль в архитектуре:** Создание демо-сайта бизнеса.
**Релиз-блокеры:** Идемпотентность (услуги/фото не дублируются); ≤5 параллельно в `generateMany`; временная ошибка БД → retry (3 попытки → needs_retry); SVG экранирует текст; свой логотип владельца не перезаписывается.

### lib/hours.ts
**Назначение:** Парсинг/форматирование рабочего времени.
**Ключевые экспорты:** `validateIntervals()`, `parseIntervals()`, `formatIntervals()`, `parseWorkingHours()`, `hasWorkingDays()`, `DAY_KEYS`, `DAY_LABELS`, `MAX_INPUT_LENGTH`, `MAX_INTERVALS_PER_DAY`.
**Зависимости:** Нет (чистая логика).
**Роль в архитектуре:** Валидация графика работы.
**Релиз-блокеры:** Строгий формат ЧЧ:ММ-ЧЧ:ММ; пересечения/неверный порядок → ошибка; пустые значения = выходной; round-trip format/parse стабилен.

### lib/import2gis-apply.ts
**Назначение:** Применение кандидатов импорта 2GIS (пачки, slug-конфликты).
**Ключевые экспорты:** `applyCandidates()`, `BATCH_SIZE` (=100).
**Зависимости:** `import2gis-store`, `import2gis-parse`, `supabase`.
**Роль в архитектуре:** Запись импортированных бизнесов в БД.
**Релиз-блокеры:** Переподбор slug при параллельном конфликте; ON CONFLICT по source_2gis_url/slug; идемпотентность (обновление без дублей).

### lib/import2gis-http.ts
**Назначение:** Route handler импорта 2GIS (загрузка xlsx).
**Ключевые экспорты:** `handleImport()`, тип `ImportDeps`.
**Зависимости:** `import2gis`, `import2gis-parse`, `import2gis-store`, `auth` (isSuperAdmin), `log`, `audit`.
**Роль в архитектуре:** Endpoint `/api/import/2gis`.
**Релиз-блокеры:** Только супер-админ; фильтр по умолчанию «шин»; лимиты: 10 МБ → 413, не xlsx → 415, нет колонок → 422; dry-run без записи/аудита; ошибка БД → 500 с логом.

### lib/import2gis-parse.ts
**Назначение:** Парсинг строк xlsx 2GIS (Zod, нормализация).
**Ключевые экспорты:** `parseWorkbook()`, `parseRow()`, `dedupeCandidates()`, `verticalFor()`, `normalize2gisUrl()`, `normalizeAddress()`, `normalizeEmail()`, `normalizeWebsite()`, `normalizeSocial()`, `CandidateSchema`, `safePatch()`, `toNewBusiness()`, `detectColumns()`.
**Зависимости:** `xlsx`, `zod`, `phone` (нормализация телефонов).
**Роль в архитектуре:** Преобразование данных 2GIS в кандидатов.
**Релиз-блокеры:** Только домены 2gis; приватные/мусорные URL отбрасываются; рейтинг 0..5; дедуп по 2GIS URL/телефону+адресу; невалидные строки пропускаются с номером.

### lib/import2gis-store.ts
**Назначение:** Интерфейс хранилища импорта + офлайн-стаб.
**Ключевые экспорты:** интерфейс `ImportStore`, `supabaseImportStore()`, `OFFLINE_STORE`, `chunkForFilter()`, `MAX_FILTER_CHARS`, типы `ExistingBusiness`, `NewBusiness`, `SafePatch`, `StoreError`.
**Зависимости:** `supabase`.
**Роль в архитектуре:** Абстракция БД для импорта.
**Релиз-блокеры:** `chunkForFilter` режет пачки по длине query string.

### lib/import2gis.ts
**Назначение:** Оркестрация импорта 2GIS.
**Ключевые экспорты:** `importRows()`, `DEFAULT_FILTER` ('шин'), `ImportError`, `MAX_ROWS`, тип `ImportStats`.
**Зависимости:** `import2gis-parse`, `import2gis-store`.
**Роль в архитектуре:** Сквозной импорт (dry-run, фильтр, пагинация по 100).
**Релиз-блокеры:** Статус no_contact/new по наличию email; повторный импорт идемпотентен; параллельный конфликт slug обрабатывается; временная ошибка батча → retry, ошибка данных → без повтора.

### lib/inbox-store.ts
**Назначение:** Supabase-реализация `InboxStore`.
**Ключевые экспорты:** `supabaseInboxStore()`.
**Зависимости:** `supabase`, типы из `inbox-sync`.
**Роль в архитектуре:** Хранилище входящих/вложений/отписки.
**Релиз-блокеры:** Нет.

### lib/inbox-sync.ts
**Назначение:** Синхронизация почтового ящика по IMAP (UID-трекинг).
**Ключевые экспорты:** `syncMailbox()`, `startPoint()`, `MAX_PER_ACCOUNT`, `InboxStore`, `ImapClientLike`, `ImapState`, `IncomingRow`, `SyncDeps`.
**Зависимости:** `email-inbound`, `supabase` (через store), `log`.
**Роль в архитектуре:** Фоновая синхронизация входящих (cron).
**Релиз-блокеры:** Смена UIDVALIDITY → перечитывание без дублей; неразбираемое/битое письмо не блокирует ящик; дедлайн оставляет необработанное на следующий запуск; автоответы/спам не сохраняются; HTML санитизируется; привязка по домену только для корпоративных доменов.

### lib/json-ld.ts
**Назначение:** XSS-безопасная сериализация JSON-LD.
**Ключевые экспорты:** `jsonLdSafe()`.
**Зависимости:** Нет.
**Роль в архитектуре:** Безопасный вывод структурированных данных в <script type="application/ld+json">.
**Релиз-блокеры:** Экранирует `</script>`, `&`, U+2028/U+2029; результат остаётся валидным JSON.

### lib/legacy-apply.ts
**Назначение:** Применение legacy CSV-миграции.
**Ключевые экспорты:** `applyLegacy()`, `buildRows()`, `isActive()`, `supabaseLegacyStore()`, типы `LegacyRow`, `LegacyExisting`, `LegacyStore`.
**Зависимости:** `legacy-csv`, `supabase`.
**Роль в архитектуре:** Миграция старых данных (slug, редиректы, подписка).
**Релиз-блокеры:** Идемпотентность (обновление без дублей); телефоны дописываются; ниша существующего не меняется; временная ошибка → retry.

### lib/legacy-csv.ts
**Назначение:** Парсинг legacy CSV (RFC 4180) + Zod.
**Ключевые экспорты:** `parseCsv()`, `parseLegacyCsv()`, `parseDate()`, `normalizeDomain()`, `CsvError`, `LegacySchema`.
**Зависимости:** `zod`.
**Роль в архитектуре:** Разбор старого формата экспорта.
**Релиз-блокеры:** Кавычки/разделитель «;»/BOM; незакрытая кавычка → ошибка; даты ISO и ДД.ММ.ГГГГ; дубли slug — последняя строка побеждает; невалидные поля пропускаются с номером строки.

### lib/legal-versions.ts
**Назначение:** Версии документов и cookie-согласие.
**Ключевые экспорты:** `PRIVACY_VERSION`, `DATA_REQUEST_ANSWER_DAYS`, `COOKIE_POLICY_VERSION`, `needsConsent()`, `parseStoredConsent()`.
**Зависимости:** Нет.
**Роль в архитектуре:** Управление версиями юр. документов и согласием.
**Релиз-блокеры:** `parseStoredConsent` строго валидирует форму; лишние/мусорные значения → null; старая редакция → нужно согласие.

### lib/legal.ts
**Назначение:** Юридический слой (ФЗ-152): реквизиты, цены, отписки, доверенные Origin.
**Ключевые экспорты:** `LEGAL_DOCS`, `parseRequisites()`, `getRequisites()`, `parsePricing()`, `createUnsubscribeToken()`, `parseUnsubscribeToken()`, `unsubscribeEmail()`, `hashIdentifier()`, `isTrustedOrigin()`, `maskEmail()`, `normalizeEmail()`, `buildUnsubscribeUrl()`, `buildListUnsubscribeHeaders()`, `getClientIp()`, `operatorName()`, `isValidInn()`, `formatLegalDate()`, `PLACEHOLDER`, `DEFAULT_PRICING`, `logLegalError()`.
**Зависимости:** `env` (`UNSUBSCRIBE_SECRET`, `HASH_SALT`), `supabase`, `site`.
**Роль в архитектуре:** Центр юр. функций и защиты ПД.
**Релиз-блокеры:** Карта/банк никогда не публикуются; email не читается из токена отписки; подделка/чужой ключ → null; isTrustedOrigin для своего хоста/SITE_URL; ошибка БД → плейсхолдеры.

### lib/license-client.ts
**Назначение:** Клиент лицензии (HMAC-ping, offline grace, cookie).
**Ключевые экспорты:** `sendPing()`, `checkLicense()`, `hmacSign()`, `hmacVerify()`, `encodeLicenseCookie()`, `decodeLicenseCookie()`, `pingDue()`, `resolveAfterSuccess()`, `resolveAfterFailure()`, `safeEqualHex()`, `OFFLINE_GRACE_MS`, `SIGNATURE_HEADER`, типы `LicenseConfig`, `LicenseStatus`.
**Зависимости:** `env`, `crypto` (HMAC), Web Crypto.
**Роль в архитектуре:** Edge-совместимый клиент проверки лицензии.
**Релиз-блокеры:** Grace 7 дней; прошлый blocked при сбое → unknown (fail-safe); свежая cookie без сети; подделка статуса ломает подпись; старый неподписанный формат отвергается.

### lib/license-server.ts
**Назначение:** Сервер лицензии (обработка ping, статусы, привязка домена).
**Ключевые экспорты:** `handlePing()`, `decideStatus()`, `deriveLicenseKey()`, `setLicenseRevoked()`, `allowLicenseDomain()`, `isDomainAllowed()`, `maskDomain()`, `purgeOldPings()`, `rateLimitKey()`, `supabaseLicenseStore()`, `telegramAlerter`, типы `LicenseRow`, `LicenseStore`, `PingRow`.
**Зависимости:** `env` (`LICENSE_HMAC_SECRET`), `supabase`, `rate-limit`, `log`.
**Роль в архитектуре:** Endpoint `/api/license/ping` (route handler).
**Релиз-блокеры:** Ключ производится от master-секрета; revoked → blocked; неподписанный legacy-ping не привязывает пустую лицензию к чужому домену; unverified → 1 алерт/сутки с замаскированным доменом; старая метка времени → 401; no-store.

### lib/log.ts
**Назначение:** Логирование ошибок в `audit_log`.
**Ключевые экспорты:** `logError()`, `buildErrorRow()`, `errorMessage()`, `LOG_SOURCES`, `MAX_MESSAGE`.
**Зависимости:** `supabase`, `audit` (маскировка).
**Роль в архитектуре:** Централизованный сбор ошибок.
**Релиз-блокеры:** Обрезка до 500 символов; маскирование email/телефона; payload не может подменить message; ошибка БД не пробрасывается.

---

### Тесты (a–m)

Ниже — юнит-тесты (Vitest) для модулей выше. Они не входят в рантайм-сборку, но фиксируют контракты безопасности и корректности.

### lib/analytics-summary.test.ts
**Назначение:** Тесты агрегации дашборда: параметры отчёта, итоги, проценты, загрузка (ТЗ §12.3/§13.8).
**Покрытие:** `parseSummaryParams` (дефолт 30 дней, отклонение мусора/пустого/обратного/слишком длинного периода), `percent`/`computeTotals`, `loadSummary` (ленивый refresh, срезы платформы/бизнеса, сбой refresh не роняет отчёт, ошибка агрегата пробрасывается без деталей, неожиданная форма отклоняется).
**Зависимости:** Моки `next/cache` (прозрачная обёртка `unstable_cache`), `lib/supabase` (rpc).
**Релиз-блокеры:** Нет (тесты).

### lib/analytics.test.ts
**Назначение:** Тесты приватной аналитики: хэширование, сессия, валидация, нормализация без PII (ТЗ §12.3).
**Покрытие:** `hashIp`/`hashUa` (SHA-256+соль, детерминизм, разная соль→другой хэш, короткая соль игнорируется), сессионная cookie (host-only/httpOnly/secure/lax/30 мин), whitelist событий, суточная соль по МСК, `normalizePath`/`normalizeReferrer` (токены скрыты, длина ≤512), DNT/боты/IP, `insertEvents`/`trackPageview` (ошибка БД не пробрасывается, пустая пачка не ходит в БД).
**Зависимости:** `node:crypto`, мок `lib/supabase`.
**Релиз-блокеры:** Нет.

### lib/audit.test.ts
**Назначение:** Тесты маскирования ПД и записи в `audit_log`.
**Покрытие:** `maskString` (email/телефон), `maskPii` (по ключам, рекурсия, глубина/длина), `buildAuditRow` (UUID→entity_id, не-UUID→payload.ref, обрезка action/entity), `audit`/`auditMany` (маскировка payload, ошибка БД→false, пустой список).
**Зависимости:** Мок `lib/supabase`.
**Релиз-блокеры:** Нет.

### lib/auth-forms.test.ts
**Назначение:** Чистые помощники auth-страниц и ролей (раунд 3).
**Покрытие:** `ttlText`/`pluralRu` (склонения, совпадение с TTL), open-redirect через `%2e%2e` отсекается `sanitizeNext`, `errorText`/`noticeText` (только известные коды, `__proto__` отброшен), `formString` (резка по FIELD_MAX, игнор файлов), `withQuery`/`realmFromNext`/`param`, `sectionAllowed`/`sectionOf`.
**Зависимости:** `auth-core`, `auth-forms`, `auth-roles`.
**Релиз-блокеры:** Нет.

### lib/auth-magic.test.ts
**Назначение:** Вход по magic-link (задача 6, ТЗ §5.4).
**Покрытие:** Запрос (супер-админ/владелец, неизвестный/неактивный бизнес → тот же ответ без письма, open-redirect нейтрализуется, rate-limit 3/15 мин/email, невалидный email, гашение предыдущей ссылки), погашение (вход, одноразовость, неактивный бизнес, истёкшая ссылка, сбой провайдера→повтор, удаление из SUPERADMIN, перебор токенов 20/15 мин/IP, мусор).
**Зависимости:** `lib/__test__/setup`, `lib/__test__/harness`, `lib/__test__/helpers`, `auth-core`, `auth-provider`, `auth-magic`.
**Релиз-блокеры:** Нет (тесты).

### lib/auth-reset.test.ts
**Назначение:** Сброс пароля (задача 7, ТЗ §5.5).
**Покрытие:** Запрос (письмо+дайджест, незнакомый адрес, rate-limit 3/email и 10/IP, невалидный email), установка нового пароля (смена+отзыв сессий+одноразовость, короткий/длинный/несовпадение не гасят ссылку, истёкшая, сбой провайдера→возврат, сбой отзыва не отменяет смену, владелец/неактивный бизнес, PII не попадает в аудит, перебор токенов 20/15 мин/IP).
**Зависимости:** `lib/__test__/*`, `auth-core`, `auth-provider`, `auth-reset`, `auth-flow`.
**Релиз-блокеры:** Нет.

### lib/auth.test.ts
**Назначение:** Аутентификация: чистые функции, сессии, токены (зона 12).
**Покрытие:** email/пароль (нормализация, длина 8..72), `SUPERADMIN_EMAILS`, токены (uuid v4, digest, safeEqual, tokenState), TTL по ТЗ, JWT HS256 (подпись, alg=none, anon/service_role, exp, aud-массив, freshness), open-redirect `sanitizeNext`/`sanitizePanelNext`, isSameOrigin, fingerprint без PII; `admin-session` (вход, чужой email, rate-limit 11/IP и 6/email, CSRF Origin, PII-маскирование аудита, isSuperAdmin, signOut, refresh), `owner-session` (вход, права, inactive, rate-limit, currentOwner, ownerAccess, requireOwnerAction, signOut, отзыв сессии), `flash` (известные сообщения, отброс секрета), `auth-invites` (TTL 7 дней, дайджест, повтор гасит, peek valid/expired, accept, уже участник, повторная отправка, rate-limit 5/час, отзыв/список), `auth-mail` (тексты из TTL).
**Зависимости:** `lib/__test__/*`, `auth-core`, `auth-provider`, `admin-session`, `owner-session` (примеч.: owner-session вне a–m, импортируется в тесте), `auth-invites`, `auth-mail`.
**Релиз-блокеры:** Нет.

### lib/availability.test.ts
**Назначение:** Занятость и слоты с mock Supabase.
**Покрытие:** `busyForDay` (фильтры по бизнесу/статусу/окну ±1 день, исключение при переносе, длительность из услуги/буфера, ошибка БД пробрасывается, невалидная дата→пусто без запроса), `holidaysBetween` (даты, старая схема 42P01/PGRST205→пусто, ошибка пробрасывается), `freeSlotsFor` (пустой/полный день, выходной, буферы, параллельность, часовой пояс), хелперы `businessTimeZone`/`bookingDurationMinutes`.
**Зависимости:** Мок `lib/supabase` (PostgREST-прокси).
**Релиз-блокеры:** Нет.

### lib/backup-routes.test.ts
**Назначение:** Route handler бэкапа: GET /api/cron/backup (CRON_SECRET), POST /api/backup/restore (isSuperAdmin, лимит тела, валидация).
**Покрытие:** cron — без/неверный токен → 401 без записи; верный → 200 и файл, сбой → 500 + Telegram; restore — не супер-админ → 401 (данные не тронуты), супер-админ: мусор → 400, большое тело → 413, верный → 200.
**Зависимости:** `lib/backup`, `../tests/memory-backup-db`, моки `backup-deps`/`admin-session`/`supabase`, `../app/api/cron/backup/route`, `../app/api/backup/restore/route`.
**Релиз-блокеры:** Нет.

### lib/backup.test.ts
**Назначение:** Бэкап: полнота (пагинация), порядок restore, идемпотентность, retention, разбор дампа.
**Покрытие:** Имена файлов (UTC, обход пути), `collectBackup` (9 таблиц, пагинация >1000, ошибка чтения роняет бэкап), `runBackup` (запись/перезапись/сбой), `pruneBackups` (30 дней, последняя копия не удаляется), `parseDump` (новый/старый формат, мусор/дубли id/обрезанный/будущая версия), `restoreDump` (порядок родитель→ребёнок, batch ≤500, идемпотентность upsert, ошибка родителя→дети skipped, исключение не роняет), устойчивость, `restoreFromFile`, `listBackups` (signed URL TTL 300), `isRestoreConfirmed` (только «ВОССТАНОВИТЬ»), `performBackup` (успех/сбой/очистка пингов), `handleRestoreRequest` (confirm, 200/409/207/404/503).
**Зависимости:** `lib/backup`, `../tests/memory-backup-db`, мок `supabase`.
**Релиз-блокеры:** Нет.

### lib/booking-actions.test.ts
**Назначение:** Отмена и перенос по токену с in-memory фейком bookings.
**Покрытие:** `cancelBooking` (отмена+уведомление, повтор already, параллельные→1 уведомление, too_late с телефоном, граница, not_found/not_cancellable, ошибка БД пробрасывается), `rescheduleBooking` (сброс напоминаний+счётчик, уже, лимит переносов, старая схема без колонки, too_late/not_reschedulable, slot_taken, валидация даты, 23P01→slot_taken, конкурентная отмена), `withinCancelWindow` (пояс независимо от таймзоны), дефолты.
**Зависимости:** Моки `supabase`/`booking-notify`/`audit`/`log`.
**Релиз-блокеры:** Нет.

### lib/booking-http.test.ts
**Назначение:** Формат ошибок API, CSRF Origin, чтение тела, rate-limit → 429.
**Покрытие:** `fail`/`ok` (статусы по 12 причинам, тело, no-store), `isSameOrigin` (тот же хост, кастомный домен через x-forwarded-host, регистр/порт, нет Origin, null/мусор), `readJson` (валид/пусто/мусор/слишком большое), `validationFailure` (zod по полям/корень), `limitOrFail` (429 + Retry-After).
**Зависимости:** Мок `rate-limit`.
**Релиз-блокеры:** Нет.

### lib/contrast.test.ts
**Назначение:** Текст поверх акцента (WCAG).
**Покрытие:** Светлый акцент→чёрный, тёмный→белый; выбор варианта с большим контрастом; короткий hex/регистр; невалидный/пустой→белый (запасной).
**Зависимости:** `contrast`.
**Релиз-блокеры:** Нет.

### lib/cron-check.test.ts
**Назначение:** `scripts/cron-check.sh` на заглушке psql (коды выхода 0/1 без живого Supabase).
**Покрытие:** Все задачи на месте → 0; расхождение расписания → 1; выключена/отсутствует → 1; лишняя → предупреждение, 0; подмена команды → 1; не заданы app.site_url/cron_secret → 1; нет SUPABASE_DB_URL → 1.
**Зависимости:** `lib/schedules` (реестр SCHEDULES), bash, заглушка psql.
**Релиз-блокеры:** Тест пропускается, если нет bash (Windows).

### lib/cron.test.ts
**Назначение:** Авторизация cron и обёртка `runCronJob`.
**Покрытие:** `isCronAuthorized` (валидный/неверный/отсутствующий/пустой секрет, дефолт из env), `requireCron` (401/пропуск), `runCronJob` (401 без вызова, 200 с run_id, исключение→500+logError+unlock, уже выполняется→skipped, нет функции блокировки), PII (redactPii/errorMessage вырезают email), сбой журнала не меняет исход, блокировка TTL ≤120 с.
**Зависимости:** `lib/test-utils/supabase-mock` (createTestContext), `cron`.
**Релиз-блокеры:** Нет.

### lib/crypto.test.ts
**Назначение:** AES-256-GCM: round-trip, ключи, порча данных, ротация.
**Покрытие:** Round-trip ASCII/кириллица; формат iv:tag:ciphertext со случайным iv; другой ключ не расшифровывает; испорченный ciphertext/tag отклоняется; мусор; валидация ключа 64 hex (ошибка не содержит ключ); legacy-формат `iv.tag.data`→reencrypt; ротация через ENCRYPTION_KEY_PREVIOUS; reencryptSecret не трогает актуальное.
**Зависимости:** `node:crypto`, `crypto`.
**Релиз-блокеры:** Нет.

### lib/domain-map.test.ts
**Назначение:** Подпись и проверка cookie «домен → prefix/slug».
**Покрытие:** Подписанное значение проходит; чужой домен/истёкшая/подмена slug/другой секрет/мусор → null; без секрета не подписывает/не проверяет; невалидный prefix/slug отвергается даже с верной подписью.
**Зависимости:** `domain-map`.
**Релиз-блокеры:** Нет.

### lib/email-accounts.test.ts
**Назначение:** Ротация ящиков, дневной лимит, сброс по смене дня (МСК), гонка счётчика.
**Покрытие:** `todayMsk` (21:30 UTC → следующий день), `effectiveSentToday`, `chooseAccount` (минимум sent_today, транзакционный берёт исчерпанный лимит), `pickAccount` (сброс только при смене дня, кэш списка), `remainingCapacity`, `markSent` (увеличение+локальная копия, гонка→перечитывание), `markFailed`/`markHealthy` (укороченная ошибка), `smtpOptions`/`imapOptions` (Yandex, таймауты, резервный пароль), `normalizeSecure`, `fromHeader` (зачистка инъекции), `toPublicAccount` (не отдаёт шифротекст), `shortError`.
**Зависимости:** `crypto` (encryptSecret), `email-accounts`.
**Релиз-блокеры:** Нет.

### lib/email-inbound.test.ts
**Назначение:** Разбор входящих: автоответы, bounce (DSN), threading, sanitize, вложения.
**Покрытие:** Auto-Submitted/X-Autoreply/Precedence/X-Auto-Response-Suppress → автоответ; X-Spam-Flag/Status/Yandex → spam; обычный → message; DSN 550/452 → hard/soft, классификация кодов; threading (In-Reply-To/References/без дублей); домены (free-mail не для связки); `sanitizeIncomingHtml` (удаляет script/onclick/javascript/style/iframe, добавляет rel=noopener, удаляет трекеры); `safeFilename` (../), `messageFolder`, DSN-части не вложения.
**Зависимости:** `mailparser`, `email-inbound`, `lib/__fixtures__/mail`.
**Релиз-блокеры:** Нет.

### lib/email-panel.test.ts
**Назначение:** Разбор форм ящиков/шаблонов, нити входящих, тема/References ответа.
**Покрытие:** `parseAccountForm` (дефолты Yandex 360, пароль обязателен для нового, отклонение плохого порта/лимита/хоста/reply_to, очистка header-injection, STARTTLS для 587); `groupThreads`/`filterThreads` (по thread_id, не склейка по адресу, фильтры unread/answered); `replySubject`/`replyReferences`; `parseTemplateForm` (канал↔тип, текст или HTML, CRLF, active, unknownPlaceholders, contentChanged, sampleClientVars покрывает все переменные ТЗ §9.9).
**Зависимости:** `email-panel`, `email-render` (TEMPLATE_VARIABLES), моки `supabase`/`log`.
**Релиз-блокеры:** Нет.

### lib/email-queue.test.ts
**Назначение:** Цикл очереди: лимит 50, бюджет времени, retry 1ч/4ч → failed+алерт, hard bounce, отписка, привязка к ящику, конкурентный claim.
**Покрытие:** `retryDelayMs`/`nextAttempt`; `mailFromItem` (Message-ID на нашем домене, List-Unsubscribe, threading, сохранение существующего id); `runQueue` (≤MAX_PER_RUN, пустая, бюджет, no_account, soft→retry, 3-я неудача→failed+алерт без email, hard bounce→failed+email_bounces, отписавшийся, stolen claim, ящик ≤1 раз, привязанный занятый ждёт); устойчивость (сбой записи после отправки не дублирует, повторная запись, сбой БД на одном не останавливает, deadline); подавление hard bounce.
**Зависимости:** `email-queue`, `notify`, мок `supabase`/`log`/`site`.
**Релиз-блокеры:** Нет.

### lib/email-render.test.ts
**Назначение:** Рендер шаблонов: переменные, экранирование, inline CSS, размеры.
**Покрытие:** `substitute`/`renderText` (19 переменных ТЗ §9.9, пустые/числа, неизвестный плейсхолдер, значение не интерпретируется повторно, encode только для значений); `renderSubject` (без CRLF, ≤200); `escapeHtml` (5 символов); `textToHtml`/`htmlToText`; `inlineCss`; `rewriteLinks` (только http(s)); `extractVariables`; `renderEmail` (текст/HTML, linkRewriter не трогает отписку, без unsubscribe_url, preheader, >500 КБ → ошибка).
**Зависимости:** `email-render`.
**Релиз-блокеры:** Нет.

### lib/email-tracking.test.ts
**Назначение:** Открытия/клики (идемпотентность, legacy-токены, fail open) и отписка.
**Покрытие:** `tokenKind`/`clientIp`; `allowTrack` (лимит 1000/час, fail open); `recordEvent` (outreach_log/emails_outgoing/бизнес, только первое событие, клик не меняет статус, не откатывает воронку, legacy-токен, неизвестный/невалидный ничего не пишет, recordEventSafe ловит сбой БД); `unsubscribeByToken` (регистронезависимо, идемпотентно, из таблицы unsubscribes, невалидный/not_found, обрезка причины до 200).
**Зависимости:** мок `supabase`/`log`/`rate-limit`, `email-tracking`.
**Релиз-блокеры:** Нет.

### lib/env-example.test.ts
**Назначение:** `.env.example` синхронизирован с кодом; 'use client' не читает серверные секреты.
**Покрытие:** Все `process.env.X` из исходников описаны; все REQUIRED_ENV присутствуют; client-файлы читают только NEXT_PUBLIC_*/NODE_ENV; заполненные секреты отсутствуют.
**Зависимости:** `env`, реальные исходники проекта, `.env.example`.
**Релиз-блокеры:** Нет (ловит забытые переменные + утечку секрета в бандл).

### lib/env.test.ts
**Назначение:** Проверка обязательных переменных и их формата.
**Покрытие:** `checkEnv` (полный набор ок, каждая переменная, пробелы, ENCRYPTION_KEY 64 hex, короткий CRON_SECRET, SITE_URL с путём/Supabase http — ошибки; localhost/127.0.0.1 http допустимы, злоупотребление .evil.ru — нет); значения не попадают в текст ошибки; `requireEnv` (обрезка, EnvError с подсказкой на .env.example).
**Зависимости:** `env`.
**Релиз-блокеры:** Нет.

### lib/generate-store.test.mts
**Назначение:** Адаптер Supabase для генератора.
**Покрытие:** `slugTaken` (невалидный slug не уходит в .or(), ищет slug+slug_history кроме самого бизнеса), ошибка БД пробрасывается с контекстом, `updateBusiness` (нет колонок generation_* → fallback без них, прочие ошибки не маскируются).
**Зависимости:** `generate-store`, мини-фейк Supabase-клиента.
**Релиз-блокеры:** Нет.

### lib/generate.test.mts
**Назначение:** Генератор прототипов (БД in-memory, сеть подменена).
**Покрытие:** `extractOgImage`/`fetchOgImage` (приоритет secure_url, относительный URL, приватный отбрасывается, повтор при таймауте, SSRF без повтора, бюджет 5с); `initials`/`initialsLogo`/`safeColor` (SVG без onload, цвет только hex); `templateServices` (мусор отбрасывается); `previewUrl`; `generatePrototype` (slug/услуги/SVG/favicon/preview, og:image→лого+фото, идемпотентность, свой логотип не перезаписывается, retry, 3 неудачи→needs_retry, промежуточная ошибка→failed затем done); `generateMany` (≤5 параллельно, ошибка одного не мешает).
**Зависимости:** `generate`, `generate-og`, `generate-store`, `ssrf`, `database.types`.
**Релиз-блокеры:** Нет.

### lib/hours.test.ts
**Назначение:** Разбор рабочего времени (цель — 100% покрытия).
**Покрытие:** `parseIntervals` (один/несколько интервалов, `;`/скобки, однозначный час, тире/«до», сортировка, стык, пустые части), границы (00:00-24:00, 24:00 не как начало, MAX_INTERVALS_PER_DAY, слишком длинная строка), пустые значения = выходной, невалидные (abc, 25:00, пересечения, начало>конца), `validateIntervals` (тексты ошибок), `formatIntervals` (round-trip), `parseWorkingHours`, `hasWorkingDays`/`DAY_LABELS`.
**Зависимости:** `hours`.
**Релиз-блокеры:** Нет.

### lib/import2gis-http.test.mts
**Назначение:** Обработчик /api/import/2gis (доступ, размер, тип, dry-run, ошибки файла).
**Покрытие:** Не супер-админ → 401; dry-run (статистика без записи/аудита); фильтр по умолчанию «шин», слишком длинный → 400; нет/пустой файл → 400; >10 МБ → 413; не xlsx (расширение/MIME/сигнатура) → 415; нет колонок → 422; ошибка БД → 500 с логом.
**Зависимости:** `xlsx`, `import2gis-http`, `import2gis`, `import2gis-store` (OFFLINE_STORE).
**Релиз-блокеры:** Нет.

### lib/import2gis.test.mts
**Назначение:** Импорт 2GIS (БД in-memory с семантикой ON CONFLICT).
**Покрытие:** Нормализация (email/сайт/2GIS URL/адрес/мессенджеры/ниша); `parseRow` (телефоны через lib/phone без комментариев/дублей, рейтинг 0..5); `parseWorkbook` (первый лист, empty/headers/too_large, MAX_ROWS); `dedupeCandidates` (по 2GIS URL/телефону+адресу); `importRows` (создание, фильтр, dry-run, идемпотентность, совпадение по телефону+адресу, разные slug, невалидные строки с номером, пачки по 100, retry временной/без повтора при ошибке данных, параллельный конфликт slug, no unique constraint); `chunkForFilter`.
**Зависимости:** `xlsx`, `import2gis`, `import2gis-parse`, `import2gis-store`.
**Релиз-блокеры:** Нет.

### lib/inbox-sync.test.ts
**Назначение:** Синхронизация ящика на фейковом IMAP-клиенте и хранилище в памяти.
**Покрытие:** `startPoint` (нет состояния/смена UIDVALIDITY → с 1); `syncMailbox` (сохранение+связка по In-Reply-To+\\Seen+uidnext, первый запуск за 7 дней, продолжение с uidnext без перечитывания, смена UIDVALIDITY без дублей, автоответ не сохраняется, hard/soft bounce, связка по домену только корпоративному, HTML санитизируется+вложения по безопасному пути, битое письмо не блокирует, дедлайн оставляет на потом, ≤MAX_PER_ACCOUNT); временные сбои (сбой БД→UID не сдвигается→перечитывание, неразбираемое пропускается навсегда).
**Зависимости:** `imapflow`, `mailparser`, `email-inbound`, `inbox-sync`, `lib/__fixtures__/mail`.
**Релиз-блокеры:** Нет.

### lib/json-ld.test.ts
**Назначение:** Экранирование JSON-LD.
**Покрытие:** Значение не закрывает `<script>`, экранирует `&` и U+2028/U+2029, результат остаётся валидным JSON с сохранёнными значениями, обычный текст без изменений.
**Зависимости:** `json-ld`.
**Релиз-блокеры:** Нет.

### lib/legacy.test.mts
**Назначение:** Миграция legacy CSV (RFC 4180, Zod, upsert по slug, редиректы, retry).
**Покрытие:** `parseCsv` (кавычки/«;»/BOM/незакрытая кавычка), нормализация (даты, домен, isActive), `parseLegacyCsv` (валидная строка, пустой slug→из названия, невалидные с номером, дубли slug, нет колонки name → ошибка), `applyLegacy` (создание/обновление без дублей, телефоны дописываются, ниша не меняется, retry при временной ошибке).
**Зависимости:** `legacy-apply`, `legacy-csv`.
**Релиз-блокеры:** Нет.

### lib/legal.test.ts
**Назначение:** Юридический слой (БД замокана, проверка чистой логики).
**Покрытие:** Версии документов (PRIVACY_VERSION, cookie-согласие, formatLegalDate); `parseRequisites` (плейсхолдеры/env-фолбэк, приоритет заполненных, некорректный ИНН, мусорный jsonb, тексты policy→privacy); `formatRequisites`/`operatorName` (missing/плейсхолдер, карта/банк никогда не публикуются); `getRequisites`/`getLegalText` (чтение settings, ошибка БД→плейсхолдеры); цены оферты; IP/хэш/Origin/email; токены отписки (создаётся/разбирается, email не читается из токена, подделка/чужой ключ→null, List-Unsubscribe RFC 8058); `unsubscribeEmail`/`isUnsubscribed` (идемпотентность, ошибка БД→server, fail-safe true); `parseStoredConsent`/`needsConsent`; форма запроса субъекта ПД (валидный, доступ/исправление требуют описания, honeypot, срок ФЗ-152 10 рабочих дней).
**Зависимости:** моки `supabase`/`site`, `legal`, `legal-versions`, `data-request`.
**Релиз-блокеры:** Нет.

### lib/license.test.ts
**Назначение:** Клиент и сервер лицензии (HMAC, offline grace, cookie, fail-safe, алерты).
**Покрытие:** HMAC (детерминизм, чужой секрет/данные/мусор, safeEqualHex); `sendPing` (успех/blocked/network/5xx/чужой секрет/повтор старого nonce/чужой домен); offline grace (7 дней, >7→unknown, без истории, прошлый blocked не продлевается, будущий last_ok_at); `pingDue`; cookie (круговая кодировка, подделка статуса, старый формат); `checkLicense` (без конфигурации→null, свежая cookie без сети, устаревшая+сбой→grace, +blocked→blocked); сервер: `decideStatus` (основной/www/доп/localhost/vercel, чужой→unverified, revoked→blocked, пустая лицензия привязывается первым ping, маскирование домена), `handlePing` (клиент↔сервер active, не тот ключ→unknown, unverified 1 алерт/сутки с маской, blocked подписан, невалидное тело→400, legacy без nonce, старая метка→401), привязка/журнал/лимит (неподписанный legacy не привязывает, подписанный привязывает, дедуп пингов, rateLimitKey, 401 не перезаписывает grace), route `/api/license/ping` (active, no-store, zod 400, 413, rate-limit 429, БД 503).
**Зависимости:** моки `rate-limit`/`log`/`license-server`, `license-client`, `license-server`, `app/api/license/ping/route`.
**Релиз-блокеры:** Нет.

### lib/log.test.ts
**Назначение:** Запись ошибок: обрезка, маскирование, устойчивость к сбоям БД.
**Покрытие:** `buildErrorRow` (action `error:<source>`, обрезка до 500, маскировка email/телефона, payload не подменяет message, пустое→заглушка); `errorMessage` (Error/строка/объект); `logError` (запись в audit_log, не бросает при сбое БД).
**Зависимости:** мок `supabase`.
**Релиз-блокеры:** Нет.

---

## Часть 5. Библиотека `lib/` — часть 2 (n–z, cron-jobs, тест-утилиты) (66 файлов)

### `lib/__fixtures__/mail.ts`  (27 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** raw, dsn
**Комментарий:** lib/__fixtures__/mail.ts — сырые письма RFC 5322 для тестов разбора входящих (ответ, DSN-bounce).

### `lib/__test__/harness.ts`  (132 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** CookieRecord, jar, requestHeaders, auditCalls, rateHits, resetHarness, cookiesMock, headersMock, fakeHitRateLimit, fakeAudit, auditActions, Row, tables, seed, fakeDb, sentMails, fakeSendMail
**Комментарий:** lib/__test__/harness.ts — общее окружение unit-тестов auth: подмена cookies/headers Next.js,

### `lib/__test__/helpers.ts`  (32 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** TestSession, sessionFor, tokenFromLastMail, resetAll
**Импорты (3):** vitest, ./harness, ../auth-provider
**Комментарий:** lib/__test__/helpers.ts — общие помощники unit-тестов auth: сессия провайдера, токен из письма, сброс подмен.

### `lib/__test__/setup.ts`  (51 стр.)
**Роль:** Модуль библиотеки lib
**Импорты (1):** vitest
**Комментарий:** lib/__test__/setup.ts — подмены для auth-тестов (lib/auth*.test.ts).

### `lib/cron-jobs/archive-refused.ts`  (14 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, REFUSED_KEEP_DAYS, archiveRefused
**Импорты (2):** ../cron, ./shared
**Комментарий:** lib/cron-jobs/archive-refused.ts — отказы старше 30 дней → archived (ТЗ §3.6). Один UPDATE с проверкой статуса:

### `lib/cron-jobs/backup.test.ts`  (48 стр.)
**Роль:** Тест (Vitest)
**Импорты (5):** vitest, ./backup, ../test-utils/supabase-mock, ../test-utils/context, ../test-utils/memory-db
**Комментарий:** lib/cron-jobs/backup.test.ts — JSON-бэкап: постраничное чтение, ошибка → без файла, удаление старых копий.

### `lib/cron-jobs/backup.ts`  (72 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, BACKUP_BUCKET, BACKUP_KEEP_DAYS, BACKUP_TABLES, PAGE_SIZE, BackupRow, expiredBackups, backup
**Импорты (2):** ../cron, ./shared
**Комментарий:** lib/cron-jobs/backup.ts — еженедельная JSON-выгрузка ключевых таблиц в приватный bucket backups (ТЗ §8.4, §16.7).

### `lib/cron-jobs/booking-reminders.ts`  (129 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, REMINDER_WINDOWS, ReminderWindow, reminderText, bookingReminders
**Импорты (3):** ../cron, ../database.types, ./shared
**Комментарий:** lib/cron-jobs/booking-reminders.ts — напоминания клиентам за 24 ч и за 2 ч (ТЗ §10.6, запуск раз в час).

### `lib/cron-jobs/business-removal.ts`  (55 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** PHOTOS_BUCKET, RemovalResult, removeBusinesses
**Импорты (3):** ../cron, ../database.types, ./shared
**Комментарий:** lib/cron-jobs/business-removal.ts — удаление бизнесов вместе с фото в Storage (process-deletions, cleanup-prototypes).

### `lib/cron-jobs/check-domains.ts`  (107 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, VERCEL_API, DOMAIN_TIMEOUT_MS, SSL_STATUSES, SslStatus, domainUrl, listHash, checkDomains
**Импорты (3):** ../cron, ../database.types, ./shared
**Комментарий:** lib/cron-jobs/check-domains.ts — кастомные домены через Vercel API → businesses.ssl_status (ТЗ §8.4, §51–52).

### `lib/cron-jobs/cleanup-audit-log.test.ts`  (34 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ./cleanup-audit-log, ../test-utils/context
**Комментарий:** lib/cron-jobs/cleanup-audit-log.test.ts — страховочная очистка вызывает cron_retention для каждой таблицы политики.

### `lib/cron-jobs/cleanup-audit-log.ts`  (31 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, RETENTION_TABLES, cleanupAuditLog
**Импорты (3):** ../cron, ../schedules, ./shared
**Комментарий:** lib/cron-jobs/cleanup-audit-log.ts — страховочная очистка журналов (Vercel Cron, 06:00 UTC).

### `lib/cron-jobs/cleanup-prototypes.ts`  (78 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, PROTOTYPE_TTL_DAYS, ARCHIVE_TTL_DAYS, cleanupPrototypes
**Импорты (3):** ../cron, ./business-removal, ./shared
**Комментарий:** lib/cron-jobs/cleanup-prototypes.ts — очистка прототипов (ТЗ §11.5): preview_ready > 90 дней → archived,

### `lib/cron-jobs/follow-up.ts`  (74 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, FOLLOW_UP_SUBJECT, FollowUpStage, followUpText, followUp
**Импорты (3):** ../cron, ../database.types, ./shared
**Комментарий:** lib/cron-jobs/follow-up.ts — повторы молчунам (ТЗ §8.4): бизнес в статусе sent, от первого письма прошло

### `lib/cron-jobs/index.ts`  (66 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOBS, JobName, isJobName, CronRouteDeps, handleCronRequest, cronRoute
**Импорты (14):** ../cron, ../cron-context, ./archive-refused, ./backup, ./booking-reminders, ./check-domains, ./cleanup-audit-log, ./cleanup-prototypes, ./follow-up, ./process-deletions, ./process-transfers, ./reset-email-limits, ./subscription-reminders, ./unconfirmed-reminder
**Комментарий:** lib/cron-jobs/index.ts — реестр хендлеров cron (JOBS). Имя задачи = сегмент URL /api/cron/<name> = name в lib/schedules.ts.

### `lib/cron-jobs/process-deletions.ts`  (17 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, processDeletions
**Импорты (3):** ../cron, ./business-removal, ./shared
**Комментарий:** lib/cron-jobs/process-deletions.ts — удаление аккаунтов (ТЗ §3.6: pending_deletion → 30 дней → удалён).

### `lib/cron-jobs/process-transfers.test.ts`  (33 стр.)
**Роль:** Тест (Vitest)
**Импорты (5):** vitest, ./process-transfers, ./shared, ../test-utils/supabase-mock, ../test-utils/context
**Комментарий:** lib/cron-jobs/process-transfers.test.ts — выкуп кода: после support_until — заглушка, ещё через 7 дней — transferred_out.

### `lib/cron-jobs/process-transfers.ts`  (21 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, TRANSFER_GRACE_DAYS, processTransfers
**Импорты (2):** ../cron, ./shared
**Комментарий:** lib/cron-jobs/process-transfers.ts — выкуп кода (ТЗ §14.4): support_until = передача + 30 дней.

### `lib/cron-jobs/reset-email-limits.ts`  (27 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, RESET_DAY_TIMEZONE, resetDay, resetEmailLimits
**Импорты (2):** ../cron, ./shared
**Комментарий:** lib/cron-jobs/reset-email-limits.ts — суточный сброс sent_today у ящиков рассылки (ТЗ §8.4, §9.1).

### `lib/cron-jobs/shared.test.ts`  (64 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, ./shared, ./check-domains, ../test-utils/context
**Комментарий:** lib/cron-jobs/shared.test.ts — общие помощники: границы суток по Москве, порции, разбор ответов, захват ключей.

### `lib/cron-jobs/shared.ts`  (116 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** MINUTE_MS, HOUR_MS, DAY_MS, BATCH_SIZE, MOSCOW_OFFSET_MS, MOSCOW_TZ, unwrap, unwrapRows, isoAgo, isoAhead, moscowDate, formatMoscow, firstEmail, hasTimeLeft, claimKeys, releaseKeys, withClaimedKeys, SendOutcome, safeSendMail, safeSendTelegram, chunk, errorText
**Импорты (1):** ../cron
**Комментарий:** lib/cron-jobs/shared.ts — общие помощники cron-хендлеров: время, разбор ответов Supabase, захват ключей, отправка.

### `lib/cron-jobs/subscription-reminders.ts`  (85 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, REMIND_DAYS_BEFORE, STUB_AFTER_DAYS, ARCHIVE_AFTER_DAYS, ReminderKind, reminderKind, subscriptionText, subscriptionReminders
**Импорты (3):** ../cron, ../database.types, ./shared
**Комментарий:** lib/cron-jobs/subscription-reminders.ts — подписка (ТЗ §14.3): за 3 дня до конца — письмо, в день окончания — письмо,

### `lib/cron-jobs/unconfirmed-reminder.ts`  (62 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** JOB, unconfirmedText, unconfirmedReminder
**Импорты (3):** ../cron, ../database.types, ./shared
**Комментарий:** lib/cron-jobs/unconfirmed-reminder.ts — письмо бизнесу о брони, висящей в статусе new дольше 24 ч (ТЗ §10.8).

### `lib/notify.test.ts`  (312 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, ./crypto, ./email-accounts, ./notify
**Комментарий:** lib/notify.test.ts — sendMailWith: выбор ящика, лимиты, retry, классификация ошибок, маскирование PII.

### `lib/notify.ts`  (311 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** BusinessEvent, MAX_ATTEMPTS, maskEmail, maskPii, escapeTelegramHtml, sendTelegram, notifyBusinessEvent, SmtpErrorKind, SmtpErrorInfo, classifySmtpError, MailOptions, SendResult, MailTransport, NotifyDeps, isValidEmail, backoffMs, sendMailWith, sendMailDetailed, sendMail
**Импорты (5):** crypto, nodemailer, ./supabase, ./log, ./email-accounts
**Комментарий:** lib/notify.ts — уведомления: Telegram бизнесу и отправка email через ящики Yandex 360 (ТЗ §9.1, §17.8).

### `lib/outreach.test.ts`  (246 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** vitest
**Комментарий:** lib/outreach.test.ts — buildEmail, трекинг, List-Unsubscribe, защита от open redirect, queueApproved.

### `lib/outreach.ts`  (265 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** DEFAULT_TEMPLATE, isUuid, renderTemplate, encodeClickTarget, decodeClickTarget, safeRedirectTarget, TrackingUrls, trackingUrls, unsubscribeHeaders, OutreachBusiness, previewUrl, outreachVars, BuiltEmail, buildEmail, OutreachTemplate, chooseTemplate, primaryEmail, queueApproved
**Импорты (6):** crypto, ./supabase, ./log, ./database.types, ./site, ./email-render
**Комментарий:** lib/outreach.ts — холодная рассылка бизнесам (ТЗ §5.5, §9.2, §9.3, §9.5, §9.8).

### `lib/owner-session.ts`  (148 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** OWNER_COOKIE, OwnerAccessData, Membership, findMembership, completeOwnerSignIn, signInOwner, OwnerAccess, ownerAccess, currentOwner, requireOwnerAction, OwnerPanelInfo, ownerPanelInfo, signOutOwner, signIn, signOut
**Импорты (11):** ./react-cache, ./supabase, ./auth-core, ./auth-request, ./auth-rate, ./auth-audit, ./auth-provider, ./auth-session, ./auth-cookies, ./database.types, ./auth-roles
**Комментарий:** lib/owner-session.ts — сессия владельца/менеджера бизнеса (ТЗ §5.2, §5.3, §5.8).

### `lib/phone.test.ts`  (105 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./phone
**Комментарий:** lib/phone.test.ts — нормализация, валидация, маска и маскирование телефона для логов.

### `lib/phone.ts`  (59 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** NORMALIZED_PHONE_RE, normalizePhone, isValidPhone, formatPhoneMask, maskPhone
**Комментарий:** Телефон РФ: нормализация в +7XXXXXXXXXX и маска +7 (___) ___-__-__ (ТЗ §0.4: свой regex, своя маска).

### `lib/rate-limit.test.ts`  (327 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** vitest
**Комментарий:** lib/rate-limit.test.ts — атомарный rate limit: границы окна, лимит 5/600, сброс, конкурентные вызовы.

### `lib/rate-limit.ts`  (268 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** RATE_LIMITS, RateLimitScope, RateLimitResult, scopeLimitFromSettings, clearRateLimitSettingsCache, RateLimitOptions, rateLimit, rateLimitScope, hitRateLimit, clientIp
**Импорты (2):** ./supabase, ./log
**Комментарий:** lib/rate-limit.ts — атомарный rate limit в Postgres (ТЗ §7; DECISIONS.md: Redis заменён таблицей rate_limits).

### `lib/react-cache.ts`  (14 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** cache
**Импорты (1):** react
**Комментарий:** lib/react-cache.ts — cache() из react для серверных функций (дедупликация внутри одного запроса).

### `lib/retry.ts`  (54 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** DEFAULT_ATTEMPTS, DEFAULT_BASE_DELAY_MS, RetryOptions, sleep, withRetry, mapLimit, chunk
**Комментарий:** lib/retry.ts — повтор операций и ограничение параллельности (общие для импорта и генерации).

### `lib/schedules.test.ts`  (143 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, node:fs, node:url, ./schedules
**Комментарий:** lib/schedules.test.ts — реестр расписаний: формат, уникальность, лимиты Vercel Hobby, синхронизация с vercel.json и SQL.

### `lib/schedules.ts`  (173 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** RUNNERS, CronRunner, RETRY_POLICIES, RetryPolicy, OWNERS, CronOwner, CronSchedule, SCHEDULES, RETENTION_DAYS, UNSCHEDULED_JOBS, VERCEL_HOBBY_MAX_CRONS, schedulesBy, findSchedule, toVercelCrons, toCrontab, isValidCronExpression, runsMoreThanDaily
**Комментарий:** lib/schedules.ts — центральный реестр расписаний (ТЗ §8.4). Единственный источник правды:

### `lib/schemas.test.ts`  (215 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./schemas
**Комментарий:** lib/schemas.test.ts — общие zod-схемы flow бронирования: валидные, невалидные и граничные значения.

### `lib/schemas.ts`  (209 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** LIMITS, uuidSchema, tokenSchema, dateSchema, startsAtSchema, nameSchema, phoneSchema, emailSchema, telegramSchema, commentSchema, privacySchema, siteRefSchema, bookingFormSchema, BookingFormValues, bookingInput, BookingInput, rescheduleInput, RescheduleInput, cancelInput, CancelInput, slotsQuery, SlotsQuery, API_REASONS, ApiReason, apiError, ApiError, bookingStatusSchema, bookingCreated, BookingCreated, slotsResponse, SlotsResponse, cancelResponse, CancelResponse, rescheduleResponse, RescheduleResponse …
**Импорты (4):** zod, ./phone, ./slots, ./legal-versions
**Комментарий:** lib/schemas.ts — общие zod-схемы flow бронирования (ТЗ §10.3 п.1–2: одна валидация на клиенте и сервере).

### `lib/site.test.ts`  (127 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./site
**Комментарий:** lib/site.test.ts — SITE_URL, нормализация хоста, MAIN_HOSTS, isMainHost.

### `lib/site.ts`  (65 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** DEFAULT_SITE_URL, normalizeSiteUrl, normalizeHost, mainHostsFor, mainHostsFromEnv, SITE_URL, SITE_HOST, MAIN_HOSTS, isMainHost
**Комментарий:** lib/site.ts — адрес сервиса в одном месте. Смена домена = смена NEXT_PUBLIC_SITE_URL.

### `lib/slots-client.ts`  (112 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** SLOTS_CACHE_TTL_MS, SLOTS_ENDPOINT, SlotsKey, SlotsFailureReason, SlotsResult, slotsQueryString, createSlotsClient, SlotsClient, sharedSlotsClient
**Импорты (1):** ./schemas
**Комментарий:** lib/slots-client.ts — загрузка свободных слотов в браузере (BookingForm, RescheduleForm).

### `lib/slots.test.ts`  (267 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ./slots, ./database.types
**Комментарий:** lib/slots.test.ts — расчёт слотов: рабочие часы, обед, буферы, окна записи, выходные, пояса, полночь.

### `lib/slots.ts`  (230 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** DEFAULT_TIME_ZONE, DEFAULT_OFFSET_MINUTES, BusyInterval, SlotInput, isValidTimeZone, tzOffsetMinutes, parseDate, localDateOf, addDays, dayBoundsUtc, freeSlots, isSlotFree, formatSlotTime, formatSlotDateTime
**Импорты (1):** ./database.types
**Комментарий:** lib/slots.ts — расчёт свободных слотов (ТЗ §10.1). Чистые функции без БД, работают и в браузере, и на сервере.

### `lib/slug.ts`  (82 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** MAX_SLUG_LENGTH, FALLBACK_SLUG, MAX_SLUG_ATTEMPTS, transliterate, slugify, isValidSlug, slugWithSuffix, ensureUniqueSlug, pickUniqueSlug
**Комментарий:** lib/slug.ts — транслит и slug (ТЗ §0.4: «свой словарь транслита в lib/slug.ts»).

### `lib/ssrf.ts`  (255 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** SSRF_TIMEOUT_MS, SSRF_MAX_BYTES, SSRF_MAX_REDIRECTS, SsrfReason, SsrfError, ResolvedAddress, Resolver, ValidatedUrl, isPrivateIpv4, expandIpv6, isPrivateIpv6, isPrivateIp, defaultResolver, parseSafeUrl, validateUrl, TransportResponse, Transport, defaultTransport, readLimited, SafeFetchOptions, SafeResponse, safeFetch
**Импорты (5):** node:dns/promises, node:http, node:https, node:net, node:stream
**Комментарий:** lib/ssrf.ts — безопасный fetch внешних URL (ТЗ §11.3 п.4, §17.9).

### `lib/supabase.test.ts`  (101 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** vitest
**Комментарий:** lib/supabase.test.ts — singleton клиентов, пересоздание при смене env, понятная ошибка без env.

### `lib/supabase.ts`  (52 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** poolerUrl, publicClient, adminClient, resetSupabaseClients
**Импорты (2):** @supabase/supabase-js, ./env
**Комментарий:** lib/supabase.ts — клиенты Supabase (ТЗ §2, §34: service_role только на сервере).

### `lib/sw-rules.test.ts`  (94 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ./sw-source, ./sw-rules
**Комментарий:** lib/sw-rules.test.ts — правила кэширования service worker: что сохраняется, а что нет.

### `lib/sw-rules.ts`  (44 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** SW_CACHE, RESERVED_SEGMENTS, SHELL_PATHS, isShellPathWith, isCacheableResponse, isShellPath
**Комментарий:** lib/sw-rules.ts — правила кэширования service worker (ТЗ §5.1).

### `lib/sw-source.ts`  (60 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** swRulesSource, buildServiceWorker
**Импорты (1):** ./sw-rules
**Комментарий:** lib/sw-source.ts — исходный текст service worker для app/sw.js/route.ts.

### `lib/telegram-admin.ts`  (73 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** ADMIN_COMMANDS, buildStats, buildHealth, ADMIN_UNKNOWN_COMMAND, runAdminCommand
**Импорты (2):** ./supabase, ./telegram
**Комментарий:** lib/telegram-admin.ts — команды владельца сервиса (ТЗ §18.4, §21, §54).

### `lib/telegram-connect.ts`  (193 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** CODE_TTL_MINUTES, CODE_TTL_MS, CODE_ATTEMPTS_LIMIT, CODE_ATTEMPTS_WINDOW_SECONDS, ClaimResult, generateCode, normalizeCode, codeExpiresAt, isCodeExpired, allowCodeAttempt, claimCode, issueCode, activeCode, bindChat, unbindChat, rebindChat, resetConnectState
**Импорты (4):** crypto, ./supabase, ./rate-limit, ./telegram
**Комментарий:** lib/telegram-connect.ts — коды подключения бизнеса к боту: BIZ-xxxxxx (ТЗ §4.30, §18.3).

### `lib/telegram-events.test.ts`  (163 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./telegram-events
**Комментарий:** lib/telegram-events.test.ts — Vitest: форматирование уведомлений (HTML, эмодзи, экранирование).

### `lib/telegram-events.ts`  (263 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** EVENT_EMOJI, TelegramEventKind, BookingInfo, RescheduleInfo, formatWhen, formatAmount, newBooking, cancel, reschedule, reminder24h, reminder1h, unconfirmed, SubscriptionInfo, pluralDays, subscriptionReminder, AdminBookingInfo, adminNewBooking, clientReply, LicenseAlertKind, licenseAlert, payment, smtpError, generationFailed, restoreTest, domainsProblem, deletionRequest, BOT_REPLIES, sendBusinessEvent, sendAdminEvent
**Импорты (2):** ./telegram, ./telegram-connect
**Комментарий:** lib/telegram-events.ts — форматирование уведомлений Telegram (ТЗ §18.4, §18.5, §10.3–10.6).

### `lib/telegram-format.ts`  (47 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** TELEGRAM_TEXT_LIMIT, escapeHtml, stripHtml, clampText, safeEqual
**Импорты (1):** crypto
**Комментарий:** lib/telegram-format.ts — чистые утилиты Telegram-интеграции без зависимостей от БД и окружения:

### `lib/telegram-webhook.test.ts`  (424 стр.)
**Роль:** Тест (Vitest)
**Импорты (7):** vitest, ./telegram.fake-db, @/app/api/telegram/webhook/route, ./telegram, ./telegram-webhook, ./telegram-connect, ./telegram-events
**Комментарий:** lib/telegram-webhook.test.ts — Vitest: оба webhook целиком (секрет, idempotency, /start BIZ, TTL,

### `lib/telegram-webhook.ts`  (249 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** SECRET_HEADER, WebhookSource, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_SECONDS, TelegramUpdate, IncomingMessage, MembershipChange, parseUpdate, extractMessage, extractMembership, ParsedCommand, parseCommand, eventKey, claimUpdate, markProcessed, allowChat, WebhookHandlers, incomingLabel, handleTelegramWebhook, businessWebhookSecret, resetWebhookState
**Импорты (5):** next/server, zod, ./supabase, ./rate-limit, ./telegram
**Комментарий:** lib/telegram-webhook.ts — общий каркас обоих webhook Telegram (ТЗ §18.2).

### `lib/telegram.fake-db.ts`  (154 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** FakeDb, createFakeDb
**Комментарий:** lib/telegram.fake-db.ts — in-memory подмена Supabase для Vitest-тестов Telegram-интеграции.

### `lib/telegram.test.ts`  (401 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./telegram
**Комментарий:** lib/telegram.test.ts — Vitest: единая точка отправки (успех, ошибка, retry, timeout, кэш getMe).

### `lib/telegram.ts`  (434 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** TelegramRole, InlineButton, SendOptions, SendResult, BotInfo, botToken, adminChatId, isAdminChat, hashChatId, runInBackground, errorName, logTelegramError, MessageLogEntry, logTelegramMessage, callTelegram, sendTelegram, getBotInfo, botUsername, resetTelegramState, clampText, escapeHtml, safeEqual, stripHtml, TELEGRAM_TEXT_LIMIT
**Импорты (3):** crypto, ./supabase, ./telegram-format
**Комментарий:** lib/telegram.ts — единая точка отправки в Telegram Bot API (ТЗ §18).

### `lib/test-utils/context.ts`  (51 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** MemoryContext, MemoryContextOptions, memoryContext, hoursFrom, daysFrom
**Импорты (3):** ../cron, ./memory-db, ./supabase-mock
**Комментарий:** lib/test-utils/context.ts — контекст cron-задачи поверх Supabase в памяти (lib/test-utils/memory-db.ts).

### `lib/test-utils/memory-db.ts`  (220 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** Row, Op, MemoryQuery, DbError, MemoryDbOptions, MemoryDb, createMemoryDb
**Импорты (1):** @supabase/supabase-js
**Комментарий:** lib/test-utils/memory-db.ts — Supabase в памяти для тестов cron-хендлеров.

### `lib/test-utils/supabase-mock.ts`  (186 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** Filter, RecordedQuery, MockResponse, Resolver, ok, fail, DbMock, createDbMock, filterValue, NotifierMock, createNotifierMock, LoggerMock, createLoggerMock, TEST_NOW, TestContext, createTestContext
**Импорты (2):** @supabase/supabase-js, ../cron
**Комментарий:** lib/test-utils/supabase-mock.ts — мок Supabase для юнит-тестов cron.

### `lib/transfer.test.ts`  (179 стр.)
**Роль:** Тест (Vitest)
**Импорты (5):** vitest, ./transfer, ./license-server, ./license-client, node:fs
**Комментарий:** lib/transfer.test.ts — тесты передачи кода (lib/transfer.ts, app/api/transfer/[id]): один .txt без ZIP,

### `lib/transfer.ts`  (256 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** SUPPORT_DAYS, SECTION_RE, MIGRATION_FILES, TransferBusiness, TransferStore, TransferResult, safeSlug, transferFileName, TransferContent, buildTransferText, splitTransferText, handleTransfer, supabaseTransferStore
**Импорты (3):** ./license-server, ./supabase, ./audit
**Комментарий:** lib/transfer.ts — передача кода клиенту (ТЗ 4.0 §14.4, §5.9): один .txt вместо ZIP.

### `lib/use-slots.ts`  (89 стр.)
**Роль:** Модуль библиотеки lib
**Экспорты:** SKELETON_DELAY_MS, PENDING_TEXT_DELAY_MS, SlotsState, useDelayedFlag, useSlots
**Импорты (2):** react, ./slots-client
**Комментарий:** lib/use-slots.ts — React-хуки загрузки слотов для BookingForm и RescheduleForm (только браузер).

---

## Часть 6. API-роуты — `app/api/` (53 файлов)

### `app/api/analytics/summary/route.test.ts`  (86 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./route
**Комментарий:** app/api/analytics/summary/route.test.ts — Vitest: права, параметры и кэш-заголовки /api/analytics/summary.

### `app/api/analytics/summary/route.ts`  (52 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (6):** next/server, @/lib/supabase, @/lib/admin-session, @/lib/owner-session, @/lib/log, @/lib/analytics-summary
**Комментарий:** app/api/analytics/summary/route.ts — JSON-агрегаты для дашборда (ТЗ 4.0 §12.3, §13.8).

### `app/api/auth/refresh/route.ts`  (35 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (3):** next/server, @/lib/auth-core, @/lib/auth-session
**Комментарий:** app/api/auth/refresh/route.ts — обновление сессии по refresh-токену (ТЗ §5.1: 30 дней без повторного входа).

### `app/api/backup/restore/route.ts`  (34 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, maxDuration, POST
**Импорты (5):** next/server, zod, @/lib/admin-session, @/lib/backup, @/lib/backup-deps
**Комментарий:** app/api/backup/restore/route.ts — восстановление из JSON-копии в bucket backups (ТЗ 4.0 §16.7, §5.4 /panel/backup).

### `app/api/bookings/[token]/cancel/route.ts`  (30 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, POST
**Импорты (4):** @/lib/schemas, @/lib/booking-actions, @/lib/booking-http, @/lib/log
**Комментарий:** app/api/bookings/[token]/cancel/route.ts — отмена брони клиентом по токену (ТЗ §10.4).

### `app/api/bookings/[token]/reschedule/route.ts`  (32 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, POST
**Импорты (4):** @/lib/schemas, @/lib/booking-actions, @/lib/booking-http, @/lib/log
**Комментарий:** app/api/bookings/[token]/reschedule/route.ts — перенос брони клиентом по токену (ТЗ §10.5).

### `app/api/bookings/route.ts`  (185 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, POST
**Импорты (13):** zod, @/lib/supabase, @/lib/business, @/lib/phone, @/lib/slots, @/lib/availability, @/lib/schemas, @/lib/rate-limit, @/lib/booking-http, @/lib/booking-notify, @/lib/audit, @/lib/log, @/lib/database.types
**Комментарий:** app/api/bookings/route.ts — создание брони клиентом (ТЗ §10.3).

### `app/api/bookings/slots/route.ts`  (61 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (7):** zod, @/lib/supabase, @/lib/business, @/lib/availability, @/lib/schemas, @/lib/booking-http, @/lib/log
**Комментарий:** app/api/bookings/slots/route.ts — свободные слоты услуги на день (ТЗ §10.1).

### `app/api/cookie-consent/route.ts`  (60 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, POST
**Импорты (5):** next/server, zod, @/lib/supabase, @/lib/rate-limit, @/lib/legal
**Комментарий:** app/api/cookie-consent/route.ts — запись согласия на cookie в журнал cookie_consents (ТЗ 4.0 §15.6, §4.44).

### `app/api/cron/[job]/route.test.ts`  (101 стр.)
**Роль:** Тест (Vitest)
**Импорты (6):** vitest, node:fs, node:path, @/lib/cron-jobs, @/lib/schedules, @/lib/test-utils/context
**Комментарий:** app/api/cron/[job]/route.test.ts — универсальный маршрут: 401, 404, реестр JOBS, 500 + logError, совпадение с реестром расписаний.

### `app/api/cron/[job]/route.ts`  (16 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/[job]/route.ts — универсальный маршрут cron: /api/cron/<job>. Реестр хендлеров — lib/cron-jobs (JOBS),

### `app/api/cron/archive-refused/route.test.ts`  (28 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, @/lib/cron-jobs/archive-refused, @/lib/test-utils/supabase-mock, @/lib/test-utils/context
**Комментарий:** app/api/cron/archive-refused/route.test.ts — отказы старше 30 дней → archived.

### `app/api/cron/archive-refused/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/archive-refused/route.ts — cron-задача archive-refused. Логика — lib/cron-jobs/archive-refused.ts, расписание — lib/schedules.ts.

### `app/api/cron/backup/route.ts`  (20 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, maxDuration, GET
**Импорты (4):** next/server, @/lib/cron, @/lib/backup-deps, @/lib/backup
**Комментарий:** app/api/cron/backup/route.ts — ежедневный JSON-бэкап 9 таблиц в приватный bucket backups (ТЗ 4.0 §16.7).

### `app/api/cron/booking-reminders/route.test.ts`  (124 стр.)
**Роль:** Тест (Vitest)
**Импорты (5):** vitest, @/lib/cron-jobs/booking-reminders, @/lib/test-utils/supabase-mock, @/lib/test-utils/context, @/lib/test-utils/memory-db
**Комментарий:** app/api/cron/booking-reminders/route.test.ts — напоминания клиентам: оба окна за вызов, без повторов, без отменённых.

### `app/api/cron/booking-reminders/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/booking-reminders/route.ts — cron-задача booking-reminders. Логика — lib/cron-jobs/booking-reminders.ts, расписание — lib/schedules.ts.

### `app/api/cron/check-domains/route.test.ts`  (83 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, @/lib/cron-jobs/check-domains, @/lib/test-utils/context
**Комментарий:** app/api/cron/check-domains/route.test.ts — Vercel API → ssl_status, одно уведомление админу о проблемах.

### `app/api/cron/check-domains/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/check-domains/route.ts — cron-задача check-domains. Логика — lib/cron-jobs/check-domains.ts, расписание — lib/schedules.ts.

### `app/api/cron/check-replies/route.ts`  (82 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, maxDuration, GET
**Импорты (9):** next/server, imapflow, mailparser, @/lib/cron, @/lib/log, @/lib/notify, @/lib/email-accounts, @/lib/inbox-sync, @/lib/inbox-store
**Комментарий:** app/api/cron/check-replies/route.ts — входящие по IMAP (ТЗ §9.4; cron раз в 5 минут, ≤ 60 с).

### `app/api/cron/cleanup-prototypes/route.test.ts`  (76 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, @/lib/cron-jobs/cleanup-prototypes, @/lib/test-utils/supabase-mock, @/lib/test-utils/context
**Комментарий:** app/api/cron/cleanup-prototypes/route.test.ts — preview_ready > 90 дней → archived; через 30 дней после архивации → удаление.

### `app/api/cron/cleanup-prototypes/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/cleanup-prototypes/route.ts — cron-задача cleanup-prototypes. Логика — lib/cron-jobs/cleanup-prototypes.ts, расписание — lib/schedules.ts.

### `app/api/cron/follow-up/route.test.ts`  (69 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, @/lib/cron-jobs/follow-up, @/lib/test-utils/context, @/lib/test-utils/memory-db
**Комментарий:** app/api/cron/follow-up/route.test.ts — повторы молчунам: стадии 30/60 → письмо + emails_outgoing, 90 → archived.

### `app/api/cron/follow-up/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/follow-up/route.ts — cron-задача follow-up. Логика — lib/cron-jobs/follow-up.ts, расписание — lib/schedules.ts.

### `app/api/cron/process-deletions/route.test.ts`  (42 стр.)
**Роль:** Тест (Vitest)
**Импорты (5):** vitest, @/lib/cron-jobs/process-deletions, @/lib/cron-jobs/business-removal, @/lib/test-utils/supabase-mock, @/lib/test-utils/context
**Комментарий:** app/api/cron/process-deletions/route.test.ts — pending_deletion с наступившей датой → удаление вместе с фото.

### `app/api/cron/process-deletions/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/process-deletions/route.ts — cron-задача process-deletions. Логика — lib/cron-jobs/process-deletions.ts, расписание — lib/schedules.ts.

### `app/api/cron/reset-email-limits/route.test.ts`  (35 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, @/lib/cron-jobs/reset-email-limits, @/lib/test-utils/supabase-mock, @/lib/test-utils/context
**Комментарий:** app/api/cron/reset-email-limits/route.test.ts — сброс sent_today раз в сутки, повтор в тот же день не обнуляет.

### `app/api/cron/reset-email-limits/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/reset-email-limits/route.ts — cron-задача reset-email-limits. Логика — lib/cron-jobs/reset-email-limits.ts, расписание — lib/schedules.ts.

### `app/api/cron/send-emails/route.ts`  (37 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, maxDuration, GET
**Импорты (6):** next/server, @/lib/cron, @/lib/notify, @/lib/email-queue, @/lib/log, @/lib/admin-notify
**Комментарий:** app/api/cron/send-emails/route.ts — отправка писем из email_queue (ТЗ §9.1, §9.2; cron раз в минуту).

### `app/api/cron/subscription-reminders/route.test.ts`  (91 стр.)
**Роль:** Тест (Vitest)
**Импорты (6):** vitest, @/lib/cron-jobs/subscription-reminders, @/lib/cron-jobs/shared, @/lib/test-utils/supabase-mock, @/lib/test-utils/context, @/lib/test-utils/memory-db
**Комментарий:** app/api/cron/subscription-reminders/route.test.ts — подписка: за 3 дня, в день окончания, +7 заглушка, +30 архив.

### `app/api/cron/subscription-reminders/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/subscription-reminders/route.ts — cron-задача subscription-reminders. Логика — lib/cron-jobs/subscription-reminders.ts, расписание — lib/schedules.ts.

### `app/api/cron/unconfirmed-reminder/route.test.ts`  (86 стр.)
**Роль:** Тест (Vitest)
**Импорты (5):** vitest, @/lib/cron-jobs/unconfirmed-reminder, @/lib/test-utils/supabase-mock, @/lib/test-utils/context, @/lib/test-utils/memory-db
**Комментарий:** app/api/cron/unconfirmed-reminder/route.test.ts — висящие брони (status=new > 24 ч): одно письмо на бизнес, без повторов.

### `app/api/cron/unconfirmed-reminder/route.ts`  (11 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, maxDuration, dynamic, GET
**Импорты (1):** @/lib/cron-jobs
**Комментарий:** app/api/cron/unconfirmed-reminder/route.ts — cron-задача unconfirmed-reminder. Логика — lib/cron-jobs/unconfirmed-reminder.ts, расписание — lib/schedules.ts.

### `app/api/cron/warmup/route.ts`  (32 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, maxDuration, GET
**Импорты (2):** @/lib/cron, @/lib/supabase
**Комментарий:** app/api/cron/warmup/route.ts — лёгкий «ping» базы, чтобы проект Supabase (free-тариф) не засыпал.

### `app/api/export/businesses/format.test.ts`  (47 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./format
**Комментарий:** Тесты форматирования экспорта: экранирование CSV, защита от формул, массивы, имя файла.

### `app/api/export/businesses/format.ts`  (53 стр.)
**Роль:** API-роут (Route Handler)
**Экспорты:** COLUMNS, Column, ExportRow, plain, safeText, csvCell, csvLine, CSV_HEADER, BOM, xlsxRecord, fileBase
**Комментарий:** app/api/export/businesses/format.ts — форматирование строк экспорта бизнесов (CSV/XLSX). Чистые функции — для тестов.

### `app/api/export/businesses/route.test.ts`  (110 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, @/app/panel/(protected)/_lib/fake-db, ./route
**Комментарий:** Тесты экспорта бизнесов: права, фильтры как у списка, постраничное чтение, стриминг CSV, audit без ПД.

### `app/api/export/businesses/route.ts`  (124 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (7):** xlsx, @/lib/admin-session, @/lib/supabase, @/lib/audit, @/lib/log, @/app/panel/(protected)/_lib/business-filters, ./format
**Комментарий:** app/api/export/businesses/route.ts — экспорт бизнесов в CSV или XLSX (ТЗ §13.1). Только супер-админ.

### `app/api/health/route.test.ts`  (94 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** vitest
**Комментарий:** app/api/health/route.test.ts — 200 при живой БД, 503 при ошибке/таймауте/без env, без чувствительных данных.

### `app/api/health/route.ts`  (61 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET, HEAD
**Экспорты:** runtime, dynamic, GET, HEAD
**Импорты (3):** next/server, @/lib/supabase, @/lib/env
**Комментарий:** app/api/health/route.ts — healthcheck для мониторинга (ТЗ §3.2, §16.8: ping /api/health каждую минуту).

### `app/api/import/2gis/route.ts`  (24 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, maxDuration, POST
**Импорты (6):** next/server, @/lib/admin-session, @/lib/audit, @/lib/import2gis-http, @/lib/log, @/lib/supabase
**Комментарий:** app/api/import/2gis/route.ts — загрузка выгрузки 2GIS из /panel/businesses (ТЗ §13.2 шаг 1). Только супер-админ.

### `app/api/license/ping/route.ts`  (47 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, maxDuration, POST
**Импорты (4):** @/lib/license-client, @/lib/license-server, @/lib/rate-limit, @/lib/log
**Комментарий:** app/api/license/ping/route.ts — приём license ping от переданных клиентам копий (ТЗ 4.0 §14.6, §14.7).

### `app/api/license/revoke/route.ts`  (31 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, POST
**Импорты (5):** next/server, zod, @/lib/admin-session, @/lib/audit, @/lib/license-server
**Комментарий:** app/api/license/revoke/route.ts — ручная блокировка/разблокировка лицензии (ТЗ 4.0 §14.6: «только вручную»).

### `app/api/resolve-domain/route.test.ts`  (150 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** vitest
**Комментарий:** app/api/resolve-domain/route.test.ts — JSON-режим, redirect-режим (заголовки x-resolve-*), кэш, лимит, open redirect.

### `app/api/resolve-domain/route.ts`  (137 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, ResolvedDomain, GET
**Импорты (5):** next/server, @/lib/custom-domain, @/lib/rate-limit, @/lib/site, @/lib/domain-map
**Комментарий:** app/api/resolve-domain/route.ts — кастомный домен → prefix/slug бизнеса (ТЗ §3.3, §40).

### `app/api/telegram/webhook/route.ts`  (117 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, POST
**Импорты (6):** @/lib/telegram-events, @/lib/telegram, @/lib/telegram-connect, @/lib/telegram-webhook, @/lib/telegram-admin, @/lib/audit
**Комментарий:** app/api/telegram/webhook/route.ts — webhook бизнес-бота (ТЗ §18.2, §18.3).

### `app/api/track/click/[token]/route.ts`  (26 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (3):** next/server, @/lib/outreach, @/lib/email-tracking
**Комментарий:** app/api/track/click/[token]/route.ts — клик по ссылке в письме (ТЗ §9.3): 302 на целевой адрес.

### `app/api/track/open/[token]/route.ts`  (23 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (1):** @/lib/email-tracking
**Комментарий:** app/api/track/open/[token]/route.ts — пиксель открытия письма (ТЗ §9.3).

### `app/api/track/page/route.test.ts`  (181 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./route
**Комментарий:** app/api/track/page/route.test.ts — Vitest: приём событий pixel (ТЗ §12.3). Supabase и rate limit замоканы.

### `app/api/track/page/route.ts`  (175 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST
**Экспорты:** runtime, dynamic, POST
**Импорты (3):** zod, @/lib/supabase, @/lib/analytics
**Комментарий:** app/api/track/page/route.ts — приём событий аналитики с сайтов клиентов (ТЗ 4.0 §12.3).

### `app/api/transfer/[id]/route.ts`  (33 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, maxDuration, GET
**Импорты (4):** next/server, @/lib/admin-session, @/lib/site, @/lib/transfer
**Комментарий:** app/api/transfer/[id]/route.ts — передача кода клиенту (ТЗ 4.0 §14.4, §5.9). Только супер-админ.

### `app/api/unsubscribe/[token]/route.ts`  (62 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** POST, GET
**Экспорты:** runtime, dynamic, POST, GET
**Импорты (4):** next/server, @/lib/rate-limit, @/lib/legal, @/lib/site
**Комментарий:** app/api/unsubscribe/[token]/route.ts — One-Click отписка (RFC 8058, ТЗ 4.0 §9.5, §15.7).

### `app/api/verticals/route.test.ts`  (47 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, @/app/panel/(protected)/_lib/fake-db, ./route, @/app/panel/(protected)/verticals/schema
**Комментарий:** Тесты выгрузки ниш: права, набор колонок = схема импорта, ошибки БД.

### `app/api/verticals/route.ts`  (38 стр.)
**Роль:** API-роут (Route Handler)
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (4):** @/lib/admin-session, @/lib/supabase, @/lib/log, @/app/panel/(protected)/verticals/schema
**Комментарий:** app/api/verticals/route.ts — выгрузка всех ниш в JSON (ТЗ §4.5, §13.1 «загрузка/выгрузка JSON»). Только супер-админ.

---

## Часть 7. Супер-админка — `app/panel/` (101 файлов)

### `app/panel/(protected)/_components/ActionForm.tsx`  (136 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** FormAction, ActionForm, useFieldError, Field, CheckField, SubmitButton, FormError
**Импорты (5):** react, react-dom, ../_lib/action, ../_lib/network, ./Toast
**Комментарий:** Форма с server action и типизированным результатом (ActionResult) — общая для всех форм зоны 7.

### `app/panel/(protected)/_components/BulkTable.tsx`  (334 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** BulkRow, BulkColumn, BulkOption, BulkAction, BulkTable
**Импорты (7):** react, ../_lib/action, ../_lib/network, ./Toast, ./ConfirmDialog, ./PrefetchLink, ./StatusBadge
**Комментарий:** Таблица с чекбоксами и массовыми операциями (воронка, бизнесы). Промт агента 7: optimistic по умолчанию.

### `app/panel/(protected)/_components/ConfirmDialog.tsx`  (47 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** ConfirmDialog
**Импорты (1):** react
**Комментарий:** Подтверждение опасных действий (design-spec §6). Нативный <dialog> + showModal():

### `app/panel/(protected)/_components/Pager.tsx`  (40 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** Pager
**Импорты (2):** next/link, ../_lib/url
**Комментарий:** Пагинация через searchParams: ровно 50 записей на странице, фильтры сохраняются (промт агента 7).

### `app/panel/(protected)/_components/PanelNav.tsx`  (79 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** NavItem, PanelNav
**Импорты (3):** react, next/link, next/navigation
**Комментарий:** Навигация супер-админки: горизонтальное меню на десктопе, burger на < 768px (ТЗ §13.11).

### `app/panel/(protected)/_components/PrefetchLink.tsx`  (20 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** PrefetchLink
**Импорты (3):** next/link, next/navigation, react
**Комментарий:** Ссылка с prefetch при наведении/фокусе (промт агента 7: «prefetch при hover на карточку»).

### `app/panel/(protected)/_components/Skeleton.tsx`  (17 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** Skeleton
**Комментарий:** Скелетон загрузки списка (design-spec §6). Серверный компонент: без JS.

### `app/panel/(protected)/_components/StatusBadge.tsx`  (21 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** StatusBadge
**Импорты (1):** ../_lib/statuses
**Комментарий:** Бейдж статуса бизнеса: точка + текст (цвет не единственный признак, design-spec §9).

### `app/panel/(protected)/_components/Toast.tsx`  (64 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** ToastKind, ToastProvider, useToast
**Импорты (1):** react
**Комментарий:** Тосты супер-админки: результат действия, ошибки сервера, отчёт массовых операций (design-spec §6).

### `app/panel/(protected)/_lib/action.ts`  (95 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** FieldErrors, ActionResult, BulkResult, MAX_BULK, MSG_FORBIDDEN, MSG_FAIL, uuid, idList, ok, fail, zodFieldErrors, zodFail, guarded, guardedBulk, bulkReport, formObject
**Импорты (3):** zod, ./guard, @/lib/log
**Комментарий:** app/panel/(protected)/_lib/action.ts — общий каркас server actions супер-админки.

### `app/panel/(protected)/_lib/audit-labels.ts`  (107 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** ACTION_LABEL, ENTITY_LABEL, SOURCE_LABEL, isLogSource, actionLabel, auditDetails
**Импорты (2):** @/lib/log, ./statuses
**Комментарий:** app/panel/(protected)/_lib/audit-labels.ts — человекочитаемые подписи событий audit_log.

### `app/panel/(protected)/_lib/business-filters.ts`  (43 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** BusinessFilters, readBusinessFilters, paramsFromUrl, applyBusinessFilters
**Импорты (3):** @/lib/database.types, ./statuses, ./url
**Комментарий:** app/panel/(protected)/_lib/business-filters.ts — разбор и проверка фильтров списка бизнесов.

### `app/panel/(protected)/_lib/db.test.ts`  (28 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./db
**Комментарий:** Тесты разбора ответов Supabase: сбой базы не должен превращаться в «пусто» / «0».

### `app/panel/(protected)/_lib/db.ts`  (19 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** rowsOf, countOf
**Комментарий:** app/panel/(protected)/_lib/db.ts — разбор ответов Supabase для страниц и actions зоны.

### `app/panel/(protected)/_lib/fake-db.ts`  (68 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** Call, Query, Reply, FakeDb, createFakeDb, argOf
**Комментарий:** app/panel/(protected)/_lib/fake-db.ts — поддельный Supabase-клиент для unit-тестов server actions (только тесты).

### `app/panel/(protected)/_lib/guard.ts`  (18 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** ForbiddenError, requireSuperAdmin
**Импорты (1):** @/lib/admin-session
**Комментарий:** app/panel/(protected)/_lib/guard.ts — проверка прав супер-админа для server actions и route handlers.

### `app/panel/(protected)/_lib/network.test.ts`  (16 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./network
**Комментарий:** Тесты обёртки отказа server action.

### `app/panel/(protected)/_lib/network.ts`  (17 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** MSG_NETWORK, orNetworkError
**Комментарий:** app/panel/(protected)/_lib/network.ts — отказ server action на клиенте (сеть пропала, 502, деплой посреди запроса).

### `app/panel/(protected)/_lib/statuses.ts`  (45 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** BUSINESS_STATUSES, MASS_STATUSES, MassStatus, STATUS_LABEL, Tone, STATUS_TONE, isBusinessStatus, statusLabel
**Импорты (1):** @/lib/database.types
**Комментарий:** app/panel/(protected)/_lib/statuses.ts — статусы бизнеса и их подписи (ТЗ §3.6). Общие для всех разделов зоны 7.

### `app/panel/(protected)/_lib/url.test.ts`  (59 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./url
**Комментарий:** Тесты сборки ссылок пагинации/фильтров и разбора searchParams.

### `app/panel/(protected)/_lib/url.ts`  (55 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** Params, one, withParams, pageNumber, searchTerm, uuidParam, PagerState, pagerState
**Комментарий:** app/panel/(protected)/_lib/url.ts — сборка ссылок с сохранением фильтров (пагинация через searchParams).

### `app/panel/(protected)/actions.ts`  (81 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** moveToInProgress, generateOne, generateForSelected, approveSelected, sendBackForRework, queueOutreach
**Импорты (6):** next/cache, @/lib/supabase, @/lib/generate, @/lib/log, ./_lib/guard, @/lib/database.types
**Комментарий:** app/panel/(protected)/actions.ts — действия воронки (ТЗ §5.4, шаги 1–4).

### `app/panel/(protected)/backup/BackupNowButton.tsx`  (28 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** BackupNowButton
**Импорты (2):** react, ./actions
**Комментарий:** Кнопка ручного бэкапа: состояние «идёт», результат в aria-live (экранные дикторы озвучивают итог).

### `app/panel/(protected)/backup/RestoreForm.tsx`  (103 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** RestoreForm
**Импорты (2):** react, @/lib/backup-shared
**Комментарий:** Восстановление из копии (ТЗ 4.0 §16.7): нужно ввести ВОССТАНОВИТЬ, затем подтвердить в диалоге.

### `app/panel/(protected)/backup/actions.ts`  (26 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** BackupActionResult, runBackupNow
**Импорты (5):** next/cache, @/lib/admin-session, @/lib/backup, @/lib/backup-deps, @/lib/rate-limit
**Комментарий:** app/panel/(protected)/backup/actions.ts — ручной запуск бэкапа (кнопка «Сделать копию сейчас»).

### `app/panel/(protected)/backup/page.tsx`  (78 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, maxDuration, BackupPage, default async
**Импорты (4):** @/lib/backup, @/lib/backup-shared, ./BackupNowButton, ./RestoreForm
**Комментарий:** app/panel/(protected)/backup/page.tsx — резервные копии (ТЗ 4.0 §16.7, §5.4 /panel/backup):

### `app/panel/(protected)/businesses/AddBusinessForm.tsx`  (21 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** AddBusinessForm
**Импорты (2):** ../_components/ActionForm, ./actions
**Комментарий:** Ручное добавление бизнеса: поля с подписями, ошибки zod под полями, тост с результатом, сброс формы.

### `app/panel/(protected)/businesses/ImportForm.tsx`  (123 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** ImportForm
**Импорты (4):** react, next/navigation, ../_components/Toast, ./import-result
**Комментарий:** Импорт выгрузки 2GIS (ТЗ §5.7 → /api/import/2gis, зона агента 14 — API не меняется).

### `app/panel/(protected)/businesses/[id]/CardForms.tsx`  (144 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** SlugForm, DomainForms, NotesForm, StatusControl, CardButtons
**Импорты (9):** react, ../../_components/ActionForm, ../../_components/ConfirmDialog, ../../_components/StatusBadge, ../../_components/Toast, ../../_lib/network, ../../_lib/statuses, ./actions, ./schema
**Комментарий:** Формы карточки бизнеса: slug, домен, SSL, заметки (ActionForm — ошибки под полями, тост),

### `app/panel/(protected)/businesses/[id]/History.tsx`  (35 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** AuditRow, History
**Импорты (1):** ../../_lib/audit-labels
**Комментарий:** История изменений бизнеса из audit_log (ТЗ §13.3, промт: «карточка с полной историей»).

### `app/panel/(protected)/businesses/[id]/actions.test.ts`  (268 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../../_lib/fake-db, ./actions
**Комментарий:** Тесты карточки бизнеса: заметки без ПД в audit, домен, slug с историей, статус, кнопки (идемпотентность).

### `app/panel/(protected)/businesses/[id]/actions.ts`  (231 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** saveNotes, saveDomain, checkSsl, changeSlug, changeStatus, cardAction
**Импорты (8):** crypto, next/cache, @/lib/supabase, @/lib/audit, @/lib/log, @/lib/site, ../../_lib/action, ./schema
**Комментарий:** app/panel/(protected)/businesses/[id]/actions.ts — действия карточки бизнеса (ТЗ §13.3).

### `app/panel/(protected)/businesses/[id]/page.test.ts`  (61 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../../_lib/fake-db, ./page
**Комментарий:** Тесты загрузки карточки бизнеса: сбой любой связанной выборки — исключение (error.tsx), а не «пусто».

### `app/panel/(protected)/businesses/[id]/page.tsx`  (210 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, BusinessCard, default async
**Импорты (9):** next/navigation, next/link, @/lib/supabase, @/lib/database.types, ../../_lib/db, ../../_lib/statuses, ./CardForms, ./History, ./schema
**Комментарий:** app/panel/(protected)/businesses/[id]/page.tsx — карточка бизнеса (ТЗ §13.3): все поля, slug, статус, тариф,

### `app/panel/(protected)/businesses/[id]/schema.ts`  (32 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** MAX_NOTES, idSchema, domainSchema, slugSchema, cardStatusSchema, notesSchema
**Импорты (3):** zod, @/lib/slug, ../../_lib/statuses
**Комментарий:** app/panel/(protected)/businesses/[id]/schema.ts — zod-схемы карточки бизнеса (вынесены из 'use server' ради тестов).

### `app/panel/(protected)/businesses/actions.test.ts`  (86 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../_lib/fake-db, ./actions
**Комментарий:** Тесты «Бизнесы»: ручное добавление (zod, slug, гонка 23505, audit без ПД), массовая смена статуса.

### `app/panel/(protected)/businesses/actions.ts`  (103 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** addBusiness, massSetStatus
**Импорты (8):** next/cache, zod, ./schema, @/lib/supabase, @/lib/slug, @/lib/audit, ../_lib/action, ../_lib/statuses
**Комментарий:** app/panel/(protected)/businesses/actions.ts — ручное добавление и массовая смена статуса (ТЗ §13.1, §3.6).

### `app/panel/(protected)/businesses/import-result.test.ts`  (30 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./import-result
**Комментарий:** Тесты разбора ответа импорта 2GIS: права, причины ошибок, сводка, защита от кривого ответа.

### `app/panel/(protected)/businesses/import-result.ts`  (29 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** interpret
**Комментарий:** app/panel/(protected)/businesses/import-result.ts — разбор ответа /api/import/2gis для ImportForm.

### `app/panel/(protected)/businesses/page.tsx`  (122 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, BusinessesPage, default async
**Импорты (9):** @/lib/supabase, ../_components/BulkTable, ../_components/Pager, ../_lib/statuses, ../_lib/business-filters, ../_lib/url, ./actions, ./ImportForm, ./AddBusinessForm
**Комментарий:** app/panel/(protected)/businesses/page.tsx — список бизнесов: фильтры, пагинация, массовая смена статуса,

### `app/panel/(protected)/businesses/schema.ts`  (32 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** addBusinessSchema
**Импорты (2):** zod, @/lib/phone
**Комментарий:** app/panel/(protected)/businesses/schema.ts — zod-схемы раздела «Бизнесы».

### `app/panel/(protected)/clients/AccessForm.tsx`  (62 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** AccessForm
**Импорты (4):** react, ../_components/ActionForm, ../_lib/action, ./actions
**Комментарий:** «Создать доступ» владельцу (ТЗ §14.2 п.2–3, §19.2). Форма раскрывается по кнопке, чтобы не занимать строку.

### `app/panel/(protected)/clients/ClientsTable.tsx`  (229 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** ClientsTable
**Импорты (9):** react, ../_components/Toast, ../_components/ConfirmDialog, ../_components/PrefetchLink, ../_components/StatusBadge, ./actions, ../_lib/network, ./AccessForm, ./schema
**Комментарий:** Таблица клиентов (ТЗ §13.5): кнопки действий с optimistic-обновлением строки и откатом при ошибке.

### `app/panel/(protected)/clients/actions.test.ts`  (223 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../_lib/fake-db, ./actions
**Комментарий:** Тесты server actions «Клиенты»: права, валидация, условные UPDATE, audit без ПД, пароль не в cookie.

### `app/panel/(protected)/clients/actions.ts`  (201 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** clientAction, AccessCreated, createOwnerAccess
**Импорты (11):** crypto, next/cache, zod, @/lib/supabase, @/lib/audit, @/lib/admin-notify, @/lib/notify, @/lib/log, @/lib/site, ../_lib/action, ./schema
**Комментарий:** app/panel/(protected)/clients/actions.ts — клиенты: оплата, продление, отключение, напоминание, отказ,

### `app/panel/(protected)/clients/page.tsx`  (95 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, ClientsPage, default async
**Импорты (6):** next/link, @/lib/supabase, ../_components/Pager, ../_lib/url, ./ClientsTable, ./schema
**Комментарий:** app/panel/(protected)/clients/page.tsx — клиенты (ТЗ §13.5, §14.2–14.4).

### `app/panel/(protected)/clients/schema.test.ts`  (62 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./schema
**Комментарий:** Тесты чистой логики раздела «Клиенты»: продление, предсказание optimistic-изменений, доступные кнопки.

### `app/panel/(protected)/clients/schema.ts`  (114 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** DAY_MS, PERIOD_DAYS, DEFAULT_INITIAL, DEFAULT_MONTHLY, CLIENT_OPS, ClientOp, clientOpSchema, CANDIDATE_STATUSES, NOT_PAYABLE, accessSchema, ClientRow, ClientPatch, isoDate, extendFrom, predictPatch, allowedOps, OP_LABEL, OP_CONFIRM
**Импорты (1):** zod
**Комментарий:** app/panel/(protected)/clients/schema.ts — схемы и чистая логика раздела «Клиенты» (ТЗ §13.5, §14.2).

### `app/panel/(protected)/email-accounts/AccountsClient.tsx`  (172 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** AccountsClient
**Импорты (4):** react, react-dom, @/lib/email-accounts, ./actions
**Комментарий:** app/panel/(protected)/email-accounts/AccountsClient.tsx — список ящиков и форма (ТЗ §4.16).

### `app/panel/(protected)/email-accounts/actions.ts`  (176 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** ActionState, saveEmailAccount, setEmailAccountActive, resetEmailLimit, deleteEmailAccount, testEmailAccount, sendTestEmail
**Импорты (12):** next/cache, nodemailer, imapflow, @supabase/supabase-js, @/lib/supabase, @/lib/admin-session, @/lib/crypto, @/lib/audit, @/lib/log, @/lib/notify, @/lib/email-accounts, @/lib/email-panel
**Комментарий:** app/panel/(protected)/email-accounts/actions.ts — ящики рассылки: создание/правка, вкл/выкл, сброс лимита,

### `app/panel/(protected)/email-accounts/page.tsx`  (47 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, EmailAccountsPage, default async
**Импорты (5):** @/lib/supabase, @/lib/log, @/lib/crypto, @/lib/email-accounts, ./AccountsClient
**Комментарий:** app/panel/(protected)/email-accounts/page.tsx — ящики рассылки Yandex 360 (ТЗ §4.16, §9.1).

### `app/panel/(protected)/error.tsx`  (23 стр.)
**Роль:** Error Boundary
**Директива:** "use client"
**Экспорты:** PanelError, default function
**Импорты (1):** react
**Комментарий:** app/panel/(protected)/error.tsx — error boundary разделов супер-админки (ТЗ §13.12, §19.5).

### `app/panel/(protected)/funnel/FunnelFilters.tsx`  (34 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** FunnelFilters
**Импорты (2):** next/link, ../_lib/url
**Комментарий:** Фильтры шага 1 воронки (ТЗ §13.2: city, vertical_template_id, has_email). GET-форма без JS:

### `app/panel/(protected)/funnel/GenerateProgress.tsx`  (180 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** GenerateProgress
**Импорты (5):** react, next/navigation, ./actions, ./constants, ../_components/Toast
**Комментарий:** Шаг 2 воронки: генерация прототипов пачками с прогресс-баром (ТЗ §13.2, design-spec §7.5).

### `app/panel/(protected)/funnel/QueueForm.tsx`  (52 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** QueueForm
**Импорты (5):** react, react-dom, ../_components/ActionForm, ../_components/ConfirmDialog, ./actions
**Комментарий:** Шаг 4 воронки: кнопка «Отправить всем одобренным» с подтверждением и результатом в тосте.

### `app/panel/(protected)/funnel/actions.test.ts`  (128 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../_lib/fake-db, ./actions
**Комментарий:** Тесты действий воронки: права, один условный UPDATE, отчёт о пропущенных, генерация пачкой без N+1, очередь.

### `app/panel/(protected)/funnel/actions.ts`  (125 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** moveToInProgress, approveSelected, sendBackForRework, generateBatch, GenerationProgress, generationProgress, queueOutreach
**Импорты (10):** next/cache, zod, @/lib/supabase, @/lib/generate, @/lib/outreach, @/lib/audit, @/lib/log, @/lib/database.types, ../_lib/action, ./constants
**Комментарий:** app/panel/(protected)/funnel/actions.ts — действия воронки (ТЗ §13.2, шаги 1–4).

### `app/panel/(protected)/funnel/constants.ts`  (12 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** GENERATE_CHUNK, GENERATE_MAX, POLL_MS, FUNNEL_PAGE
**Комментарий:** app/panel/(protected)/funnel/constants.ts — лимиты генерации. Отдельный модуль: файл 'use server'

### `app/panel/(protected)/funnel/page.tsx`  (210 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, FunnelPage, default async
**Импорты (13):** next/link, @/lib/supabase, @/lib/outreach, @/lib/database.types, ../_components/BulkTable, ../_components/Pager, ../_lib/db, ../_lib/url, ./actions, ./constants, ./GenerateProgress, ./QueueForm, ./FunnelFilters
**Комментарий:** app/panel/(protected)/funnel/page.tsx — воронка из пяти шагов (ТЗ §13.2, design-spec §7.5).

### `app/panel/(protected)/inbox/InboxThread.tsx`  (101 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** MessageView, ThreadView, InboxThreadCard
**Импорты (4):** next/link, react, react-dom, ./actions
**Комментарий:** app/panel/(protected)/inbox/InboxThread.tsx — карточка нити: письма, отметки прочитано/непрочитано, ответ (ТЗ §13.4).

### `app/panel/(protected)/inbox/actions.ts`  (103 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** InboxActionState, setRead, replyToIncoming
**Импорты (10):** next/cache, crypto, @/lib/supabase, @/lib/admin-session, @/lib/audit, @/lib/log, @/lib/notify, @/lib/email-render, @/lib/outreach, @/lib/email-panel
**Комментарий:** app/panel/(protected)/inbox/actions.ts — отметки прочитано/непрочитано и ответ из входящих (ТЗ §13.4).

### `app/panel/(protected)/inbox/page.tsx`  (100 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, InboxPage, default async
**Импорты (5):** next/link, @/lib/supabase, @/lib/log, @/lib/email-panel, ./InboxThread
**Комментарий:** app/panel/(protected)/inbox/page.tsx — входящие: нити по thread_id, фильтры, ответ, прототип (ТЗ §13.4).

### `app/panel/(protected)/layout.tsx`  (44 стр.)
**Роль:** Layout
**Экспорты:** dynamic, PanelLayout, default async
**Импорты (4):** next/navigation, @/lib/admin-session, ./_components/PanelNav, ./_components/Toast
**Комментарий:** app/panel/(protected)/layout.tsx — все страницы супер-админки кроме входа (ТЗ §13.1, §13.11).

### `app/panel/(protected)/licenses/CreateLicenseForm.tsx`  (41 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** CreateLicenseForm
**Импорты (2):** react, ./actions
**Комментарий:** Форма выдачи лицензии: подписанные поля, результат в aria-live.

### `app/panel/(protected)/licenses/LicensesTable.tsx`  (193 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** LicenseView, LicensesTable
**Импорты (3):** react, @/lib/license-client, ./actions
**Комментарий:** Таблица лицензий с optimistic-обновлением: статус меняется сразу, при ошибке сервера — откат и сообщение.

### `app/panel/(protected)/licenses/actions.ts`  (87 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** ActionResult, createLicense, setRevoked, allowDomain, ignoreSignal
**Импорты (6):** next/cache, @/lib/supabase, @/lib/audit, @/lib/admin-session, @/lib/license-client, @/lib/license-server
**Комментарий:** app/panel/(protected)/licenses/actions.ts — лицензии: выдача, блокировка, разрешённый домен, игнор сигнала (ТЗ 4.0 §14.6).

### `app/panel/(protected)/licenses/page.tsx`  (152 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, LicensesPage, default async
**Импорты (5):** @/lib/supabase, @/lib/license-client, @/lib/license-server, ./LicensesTable, ./CreateLicenseForm
**Комментарий:** app/panel/(protected)/licenses/page.tsx — лицензии: статус, последний ping, сигналы, блокировка, домены (ТЗ 4.0 §14.6).

### `app/panel/(protected)/loading.tsx`  (9 стр.)
**Роль:** Loading UI
**Экспорты:** PanelLoading, default function
**Импорты (1):** ./_components/Skeleton
**Комментарий:** app/panel/(protected)/loading.tsx — скелетон списков супер-админки (ТЗ §13.12).

### `app/panel/(protected)/logs/filters.test.ts`  (49 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./filters
**Комментарий:** Тесты разбора фильтров журнала: вкладки, проверка значений, период по Москве.

### `app/panel/(protected)/logs/filters.ts`  (68 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** LogTab, LogFilters, dateParam, readLogFilters, periodBounds, hasFilters
**Импорты (3):** @/lib/log, ../_lib/audit-labels, ../_lib/url
**Комментарий:** app/panel/(protected)/logs/filters.ts — разбор фильтров журнала /panel/logs из searchParams (ТЗ §13.7).

### `app/panel/(protected)/logs/page.tsx`  (205 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, LogsPage, default async
**Импорты (8):** next/link, @/lib/log, ../_components/PrefetchLink, ../_components/Pager, ../_lib/audit-labels, ../_lib/url, ./filters, ./query
**Комментарий:** app/panel/(protected)/logs/page.tsx — журнал: вкладки «Ошибки» и «Аудит» (ТЗ §13.7).

### `app/panel/(protected)/logs/query.test.ts`  (48 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, ../_lib/fake-db, ./filters, ./query
**Комментарий:** Тесты выборки журнала: условия SQL по вкладке и фильтрам, ровно 50 строк, повторное маскирование ПД.

### `app/panel/(protected)/logs/query.ts`  (48 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** LOG_PAGE, LogRow, LogPage, loadLogs
**Импорты (4):** @/lib/supabase, @/lib/audit, @/lib/log, ./filters
**Комментарий:** app/panel/(protected)/logs/query.ts — выборка журнала: одна страница audit_log по фильтрам (ТЗ §13.7).

### `app/panel/(protected)/settings/SettingsForms.tsx`  (119 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** RequisitesForm, TariffsForm, DefaultPriceForm, RateLimitsForm, FlagsForm
**Импорты (3):** ../_components/ActionForm, ./actions, ./schema
**Комментарий:** Формы настроек платформы. Клиентский компонент нужен для useFormState: ошибки zod — под полем

### `app/panel/(protected)/settings/actions.test.ts`  (87 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../_lib/fake-db, ./actions
**Комментарий:** Тесты server actions «Настройки»: права, ошибки под полем, audit без ПД, пропуск неизменённых значений.

### `app/panel/(protected)/settings/actions.ts`  (92 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** saveRequisites, saveTariffs, saveDefaultPrice, saveRateLimits, saveFlags
**Импорты (6):** next/cache, zod, @/lib/supabase, @/lib/audit, ../_lib/action, ./schema
**Комментарий:** app/panel/(protected)/settings/actions.ts — настройки платформы: реквизиты, тарифы, цены, rate limit, флаги (ТЗ §13.1, §15.5).

### `app/panel/(protected)/settings/page.tsx`  (55 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, PlatformSettingsPage, default async
**Импорты (3):** @/lib/supabase, ./schema, ./SettingsForms
**Комментарий:** app/panel/(protected)/settings/page.tsx — настройки платформы (ТЗ §13.1, §15.5): реквизиты, тарифы, цены, rate limit, флаги.

### `app/panel/(protected)/settings/schema.test.ts`  (82 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./schema
**Комментарий:** Тесты схем настроек платформы: валидация реквизитов, цен, лимитов; чтение с дефолтами; diff полей.

### `app/panel/(protected)/settings/schema.ts`  (181 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** SETTINGS_KEYS, SettingsKey, luhnValid, formatCard, requisitesSchema, Requisites, REQUISITE_FIELDS, tariffsSchema, Tariffs, defaultPriceSchema, DefaultPrice, rateLimitsSchema, RateLimits, flagsSchema, Flags, DEFAULTS, PlatformSettings, readSettings, changedPaths
**Импорты (2):** zod, @/lib/phone
**Комментарий:** app/panel/(protected)/settings/schema.ts — схемы настроек платформы (ТЗ §13.1, §15.5) и чтение их из settings.

### `app/panel/(protected)/stats/RefreshButton.tsx`  (14 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** RefreshButton
**Импорты (2):** ../_components/ActionForm, ./actions
**Комментарий:** Кнопка «Пересчитать» статистики: server action, тост с результатом, без перезагрузки страницы.

### `app/panel/(protected)/stats/StatsTables.tsx`  (163 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** formatNumber, formatPercent, formatDateTime, KpiCard, KpiGrid, Column, Row, DataTable, KeyValueTable, FunnelTable, PeriodForm
**Импорты (1):** react
**Комментарий:** app/panel/(protected)/stats/StatsTables.tsx — презентационные блоки дашборда статистики (Server Components).

### `app/panel/(protected)/stats/actions.test.ts`  (52 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./actions
**Комментарий:** Тесты ручного пересчёта статистики: права, белый список периодов, audit, принудительный пересчёт кэша.

### `app/panel/(protected)/stats/actions.ts`  (21 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** refreshStats
**Импорты (5):** next/cache, zod, @/lib/audit, ../_lib/action, ./compute
**Комментарий:** app/panel/(protected)/stats/actions.ts — ручной пересчёт статистики (кнопка «Пересчитать»). Права — guarded.

### `app/panel/(protected)/stats/aggregate.test.ts`  (61 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./aggregate
**Комментарий:** Тесты агрегации статистики: MRR из numeric-строк, конверсия sent → paid, шаблоны, дни без дыр.

### `app/panel/(protected)/stats/aggregate.ts`  (131 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** BizRow, ClientRow, OutreachRow, Count, TemplateStat, DayStat, StatsSnapshot, TOP_CITIES, DAYS_SHOWN, DEFAULT_TEMPLATE, toCounts, mrr, conversion, aggregateBusinesses, aggregateOutreach, lastDays
**Комментарий:** app/panel/(protected)/stats/aggregate.ts — чистые функции агрегации статистики (ТЗ §13.8). Без БД — покрыты тестами.

### `app/panel/(protected)/stats/compute.test.ts`  (49 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../_lib/fake-db, ./compute
**Комментарий:** Тесты кэша статистики и постраничного чтения (лимит PostgREST 1000 строк).

### `app/panel/(protected)/stats/compute.ts`  (107 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** PERIODS, Period, CACHE_TTL_MS, cacheKey, fetchAll, computeStats, getStats
**Импорты (4):** @/lib/supabase, ../_lib/db, ../_lib/statuses, ./aggregate
**Комментарий:** app/panel/(protected)/stats/compute.ts — расчёт и кэш статистики (ТЗ §13.8, промт: «кэш для stats, не тяжёлый SQL каждый раз»).

### `app/panel/(protected)/stats/page.tsx`  (170 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, StatsPage, default async
**Импорты (5):** next/link, ../_lib/url, ./compute, ./aggregate, ./RefreshButton
**Комментарий:** app/panel/(protected)/stats/page.tsx — статистика (ТЗ §13.8): MRR, конверсия sent → paid, воронка, города, ниши,

### `app/panel/(protected)/templates/TemplateEditor.tsx`  (141 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** TemplateView, VersionView, TemplateEditor, VersionList, DeleteTemplateButton
**Импорты (5):** react, next/navigation, react-dom, @/lib/email-template-types, ./actions
**Комментарий:** app/panel/(protected)/templates/TemplateEditor.tsx — форма шаблона, история версий с откатом, удаление (ТЗ §4.14, §4.15).

### `app/panel/(protected)/templates/actions.ts`  (144 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** TemplateActionState, saveTemplate, restoreVersion, deleteTemplate
**Импорты (7):** next/cache, @supabase/supabase-js, @/lib/supabase, @/lib/admin-session, @/lib/audit, @/lib/log, @/lib/email-panel
**Комментарий:** app/panel/(protected)/templates/actions.ts — шаблоны писем: создание, правка, версии, откат, удаление (ТЗ §4.14, §4.15).

### `app/panel/(protected)/templates/page.tsx`  (116 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, TemplatesPage, default async
**Импорты (8):** next/link, @/lib/supabase, @/lib/log, @/lib/site, @/lib/outreach, @/lib/email-render, @/lib/email-panel, ./TemplateEditor
**Комментарий:** app/panel/(protected)/templates/page.tsx — шаблоны писем: список, правка, версии, откат, предпросмотр (ТЗ §4.14, §4.15, §9.7–9.9).

### `app/panel/(protected)/verticals/JsonEditor.tsx`  (73 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** JsonEditor
**Импорты (2):** react, ../_components/ActionForm
**Комментарий:** JSON-редактор для полей ниши (ТЗ §4.5): моноширинный textarea + проверка синтаксиса на лету + «Форматировать».

### `app/panel/(protected)/verticals/VerticalForms.tsx`  (138 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** VerticalView, VerticalForm, ImportVerticalsForm, ActiveToggle
**Импорты (9):** react, next/navigation, ../_components/ActionForm, ../_components/Toast, ../_lib/action, ../_lib/network, ./actions, ./JsonEditor, ./schema
**Комментарий:** Формы раздела «Ниши»: создание/правка (поля + JSON-редакторы), импорт JSON (файл или вставка),

### `app/panel/(protected)/verticals/actions.test.ts`  (92 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** vitest, ../_lib/fake-db, ./actions
**Комментарий:** Тесты server actions «Ниши»: права, ошибки JSON под полем, уникальность, импорт одним upsert.

### `app/panel/(protected)/verticals/actions.ts`  (122 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** saveVertical, setVerticalActive, ImportResult, importVerticals
**Импорты (6):** next/cache, zod, @/lib/supabase, @/lib/audit, ../_lib/action, ./schema
**Комментарий:** app/panel/(protected)/verticals/actions.ts — ниши: создание, правка, включение/выключение, импорт JSON (ТЗ §4.5, §13.1).

### `app/panel/(protected)/verticals/page.tsx`  (102 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, VerticalsPage, default async
**Импорты (7):** next/link, @/lib/supabase, ../_lib/db, @/lib/database.types, ../_lib/url, ./schema, ./VerticalForms
**Комментарий:** app/panel/(protected)/verticals/page.tsx — ниши (ТЗ §4.5, §13.1): список, правка, создание, импорт/экспорт JSON.

### `app/panel/(protected)/verticals/schema.test.ts`  (55 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./schema
**Комментарий:** Тесты валидации ниш: структура JSON-полей, системные префиксы, отчёт импорта.

### `app/panel/(protected)/verticals/schema.ts`  (117 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** RESERVED_PREFIXES, MAX_SERVICES, MAX_FIELDS, MAX_IMPORT, serviceSchema, fieldDefSchema, textsSchema, colorsSchema, blocksSchema, verticalSchema, VerticalInput, JSON_FIELDS, JsonField, JSON_HINT, JSON_EMPTY, parseJsonSafe, issuePath, ImportReport, validateImport
**Импорты (1):** zod
**Комментарий:** app/panel/(protected)/verticals/schema.ts — zod-схемы ниш (ТЗ §4.5). Общие для формы, импорта, экспорта и тестов.

### `app/panel/forgot-password/page.tsx`  (30 стр.)
**Роль:** Страница (Page)
**Экспорты:** metadata, dynamic, ForgotPasswordPage, default function
**Импорты (5):** @/lib/auth-forms, @/lib/auth-flow, @/lib/auth-core, @/components/auth/AuthUi, @/app/reset-password/actions
**Комментарий:** app/panel/forgot-password/page.tsx — запрос сброса пароля (ТЗ §5.5: /panel/forgot-password → письмо).

### `app/panel/login/page.tsx`  (46 стр.)
**Роль:** Страница (Page)
**Директива:** "use server"
**Экспорты:** metadata, dynamic, LoginPage, default async
**Импорты (6):** next/navigation, @/lib/admin-session, @/lib/auth-core, @/lib/auth-forms, @/lib/auth-flow, @/components/auth/AuthUi
**Комментарий:** app/panel/login/page.tsx — вход супер-админа (ТЗ §5.3: email + пароль, /panel/login).

### `app/panel/page.tsx`  (7 стр.)
**Роль:** Страница (Page)
**Экспорты:** PanelRoot, default function
**Импорты (1):** next/navigation
**Комментарий:** app/panel/page.tsx — корень супер-админки: отправляем на воронку (ТЗ §55: /panel).

---

## Часть 8. Публичный сайт и панель владельца — `app/[prefix]/` (90 файлов)

### `app/[prefix]/[slug]/BookingForm.tsx`  (283 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** BookingForm
**Импорты (10):** react, react-hook-form, @hookform/resolvers/zod, @/lib/schemas, @/lib/phone, @/lib/slots, @/lib/booking-dates, @/lib/use-slots, ./booking-ui, ./use-booking-submit
**Комментарий:** Форма брони (ТЗ §5.2, §10.3): услуга → дата → время → контакты → согласие.

### `app/[prefix]/[slug]/SwRegister.tsx`  (13 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** SwRegister
**Импорты (1):** react
**Комментарий:** Регистрация service worker для PWA (ТЗ §5.1). Вызывается на публичных страницах сайта.

### `app/[prefix]/[slug]/booking-ui.tsx`  (168 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** fieldStyles, FieldError, DateStrip, SlotPicker
**Импорты (4):** react, @/lib/slots, @/lib/booking-dates, @/lib/use-slots
**Комментарий:** Общие элементы выбора даты и времени для BookingForm и RescheduleForm (клиентские: обработчики событий).

### `app/[prefix]/[slug]/booking/booking-page-ui.tsx`  (57 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** telHref, PageShell, BookingSummary, Notice, NotFoundNotice
**Импорты (2):** react, @/lib/booking-view
**Комментарий:** Общая разметка страниц отмены и переноса (Server Components, без клиентского JS).

### `app/[prefix]/[slug]/booking/cancel/[token]/CancelForm.tsx`  (81 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** CancelForm
**Импорты (5):** react, react-dom, ./actions, @/lib/booking-action-state-types, ../../booking-page-ui
**Комментарий:** Кнопка отмены: подтверждение в два шага (опасное действие, design-spec §6), useFormState + server action.

### `app/[prefix]/[slug]/booking/cancel/[token]/actions.ts`  (11 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** cancelAction
**Импорты (2):** @/lib/booking-action-state, @/lib/booking-action-state-types
**Комментарий:** app/[prefix]/[slug]/booking/cancel/[token]/actions.ts — server action отмены на сайте бизнеса (ТЗ §10.4).

### `app/[prefix]/[slug]/booking/cancel/[token]/page.tsx`  (42 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, CancelPage, default async
**Импорты (3):** @/lib/booking-view, ../../booking-page-ui, ./CancelForm
**Комментарий:** app/[prefix]/[slug]/booking/cancel/[token]/page.tsx — отмена по ссылке из письма (ТЗ §10.4).

### `app/[prefix]/[slug]/booking/error.tsx`  (27 стр.)
**Роль:** Error Boundary
**Директива:** "use client"
**Экспорты:** BookingError, default function
**Импорты (1):** react
**Комментарий:** Error boundary страниц отмены и переноса (app/[prefix]/[slug]/booking/**).

### `app/[prefix]/[slug]/booking/reschedule/[token]/RescheduleForm.tsx`  (176 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** RescheduleForm
**Импорты (9):** react, @/lib/booking-dates, @/lib/slots, @/lib/schemas, @/lib/booking-client, @/lib/use-slots, ../../../booking-ui, ../../booking-page-ui, ./use-reschedule-submit
**Комментарий:** Выбор нового времени при переносе (ТЗ §10.5). Слоты — публичный API (кэш, prefetch, AbortController,

### `app/[prefix]/[slug]/booking/reschedule/[token]/page.tsx`  (56 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, ReschedulePage, default async
**Импорты (3):** @/lib/booking-view, ../../booking-page-ui, ./RescheduleForm
**Комментарий:** app/[prefix]/[slug]/booking/reschedule/[token]/page.tsx — перенос записи по ссылке из письма (ТЗ §10.5).

### `app/[prefix]/[slug]/booking/reschedule/[token]/use-reschedule-submit.ts`  (66 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** RescheduleOutcome, useRescheduleSubmit
**Импорты (3):** react, @/lib/booking-client, @/lib/schemas
**Комментарий:** Отправка переноса: useOptimistic (кнопка блокируется в том же кадре, откат при ошибке) + useTransition.

### `app/[prefix]/[slug]/manifest.webmanifest/route.ts`  (25 стр.)
**Роль:** Route Handler
**HTTP-методы:** GET
**Экспорты:** runtime, GET
**Импорты (1):** @/lib/supabase
**Комментарий:** app/[prefix]/[slug]/manifest.webmanifest/route.ts — PWA-манифест каждого сайта (ТЗ §5.1, §9).

### `app/[prefix]/[slug]/page.tsx`  (72 стр.)
**Роль:** Страница (Page)
**Экспорты:** revalidate, generateMetadata, BusinessPage, default async
**Импорты (8):** next/navigation, next, @/lib/business, @/lib/json-ld, @/lib/supabase, ./BookingForm, ./SwRegister, @/components/templates/StudioTemplate
**Комментарий:** app/[prefix]/[slug]/page.tsx — публичный сайт бизнеса (ТЗ §5.1, §3.3, §3.4).

### `app/[prefix]/[slug]/panel/(protected)/_components/ConfirmDialog.tsx`  (85 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** useConfirm
**Импорты (1):** react
**Комментарий:** _components/ConfirmDialog.tsx — подтверждение опасных действий (design-spec §6, ТЗ §19.6).

### `app/[prefix]/[slug]/panel/(protected)/_components/CopyButton.tsx`  (68 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** CopyButton
**Импорты (1):** react
**Комментарий:** _components/CopyButton.tsx — кнопка «Скопировать» с подтверждением для глаз и для диктора.

### `app/[prefix]/[slug]/panel/(protected)/_components/Field.tsx`  (33 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** FieldA11y, fieldA11y, FieldFrame
**Комментарий:** _components/Field.tsx — подпись + поле + подсказка + ошибка (design-spec §6, ТЗ §19.6).

### `app/[prefix]/[slug]/panel/(protected)/_components/OnboardingTip.tsx`  (53 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** OnboardingTip
**Импорты (2):** react, ../_lib/tips
**Комментарий:** _components/OnboardingTip.tsx — подсказка новичку, показывается один раз (ТЗ §13.13, §19.1: «тултипы через localStorage»).

### `app/[prefix]/[slug]/panel/(protected)/_components/PanelNav.tsx`  (96 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** PanelNav
**Импорты (4):** next/link, next/navigation, react, ../_lib/sections
**Комментарий:** _components/PanelNav.tsx — навигация кабинета (ТЗ §13.9, §13.11).

### `app/[prefix]/[slug]/panel/(protected)/_components/Skeleton.tsx`  (19 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** SkeletonFrame, SkeletonBlock
**Комментарий:** _components/Skeleton.tsx — обёртка скелетонов загрузки (ТЗ §13.12). Серверный, без JS.

### `app/[prefix]/[slug]/panel/(protected)/_components/Toast.tsx`  (83 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** useToast, ToastProvider
**Импорты (1):** react
**Комментарий:** _components/Toast.tsx — тосты результата действий (design-spec §6) с aria-live (ТЗ §19.6).

### `app/[prefix]/[slug]/panel/(protected)/_lib/access.ts`  (34 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** OwnerAccess, Role, isOwner, requirePageAccess, actionAccess, OWNER_ONLY
**Импорты (4):** next/navigation, @/lib/owner-session, @/lib/database.types, ./sections
**Комментарий:** _lib/access.ts — проверка доступа к кабинету для страниц и server actions (ТЗ §5.2, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/_lib/busy.ts`  (32 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** withBusy, withoutBusy, BusyIds, useBusyIds
**Импорты (1):** react
**Комментарий:** _lib/busy.ts — набор «занятых» строк списка (идёт запрос по этой строке).

### `app/[prefix]/[slug]/panel/(protected)/_lib/client-action.ts`  (23 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** callAction
**Импорты (1):** ./result
**Комментарий:** _lib/client-action.ts — вызов server action из клиентского компонента с повтором при сетевой ошибке.

### `app/[prefix]/[slug]/panel/(protected)/_lib/color.ts`  (42 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** DEFAULT_ACCENT, MIN_CONTRAST, contrastWithWhite, accentColor
**Комментарий:** _lib/color.ts — акцентный цвет кабинета из brand_color бизнеса с гарантией контраста (WCAG AA, ТЗ §19.6).

### `app/[prefix]/[slug]/panel/(protected)/_lib/form.ts`  (24 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** applyServerErrors
**Импорты (2):** react-hook-form, ./result
**Комментарий:** _lib/form.ts — связка react-hook-form с ответом server action.

### `app/[prefix]/[slug]/panel/(protected)/_lib/onboarding.ts`  (33 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** ChecklistItem, OnboardingFacts, buildChecklist, progressPercent
**Импорты (2):** @/lib/hours, @/lib/database.types
**Комментарий:** _lib/onboarding.ts — чек-лист готовности сайта (ТЗ §13.13, §19.1): 4 пункта по 25%.

### `app/[prefix]/[slug]/panel/(protected)/_lib/result.ts`  (40 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** FieldErrors, ActionResult, ERR, ok, fail, zodFieldErrors, UUID_RE
**Импорты (1):** zod
**Комментарий:** _lib/result.ts — единый формат ответа server actions кабинета.

### `app/[prefix]/[slug]/panel/(protected)/_lib/sections.ts`  (55 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** PanelParams, SectionKey, Section, SECTIONS, NavItem, panelBase, sectionHref, visibleSections, isActiveSection
**Импорты (1):** @/lib/database.types
**Комментарий:** _lib/sections.ts — разделы кабинета и правила видимости по ролям (ТЗ §13.9, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/_lib/subscription.ts`  (26 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** WARN_DAYS, SubscriptionTone, SubscriptionView, subscriptionStatus, subscriptionAttention
**Импорты (1):** ./time
**Комментарий:** _lib/subscription.ts — статус подписки для страницы «Подписка» и отметки в меню (ТЗ §5.3, §14).

### `app/[prefix]/[slug]/panel/(protected)/_lib/time.ts`  (41 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** BUSINESS_TZ, DAY_MS, businessDayStart, businessDayIndex, dayTitle, formatDateTime, formatDate
**Комментарий:** _lib/time.ts — время кабинета в часовом поясе бизнеса.

### `app/[prefix]/[slug]/panel/(protected)/_lib/tips.ts`  (11 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** TIP_PREFIX, TIPS, TipKey, tipStorageKey
**Комментарий:** _lib/tips.ts — ключи одноразовых подсказок в localStorage (ТЗ §13.13). Чистый модуль, покрыт тестами.

### `app/[prefix]/[slug]/panel/(protected)/_lib/useUnsavedGuard.ts`  (21 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** useUnsavedGuard
**Импорты (1):** react
**Комментарий:** _lib/useUnsavedGuard.ts — предупреждение браузера при уходе со страницы с несохранёнными изменениями.

### `app/[prefix]/[slug]/panel/(protected)/bookings/BookingList.tsx`  (218 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** BookingRow, BookingList
**Импорты (10):** react, @/lib/database.types, ../_components/Toast, ../_components/ConfirmDialog, ../_lib/client-action, ../_lib/busy, ./actions, ./tel, ./view, ./status
**Комментарий:** bookings/BookingList.tsx — список броней с мгновенной сменой статуса (useOptimistic + useTransition).

### `app/[prefix]/[slug]/panel/(protected)/bookings/actions.ts`  (72 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** ChangeStatusInput, changeBookingStatus
**Импорты (10):** next/cache, zod, @/lib/supabase, @/lib/notify, @/lib/log, @/lib/database.types, ../_lib/access, ../_lib/result, ../_lib/time, ./status
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/bookings/actions.ts — действия владельца и менеджера над бронями (ТЗ §10.7, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/bookings/loading.tsx`  (25 стр.)
**Роль:** Loading UI
**Экспорты:** BookingsLoading, default function
**Импорты (1):** ../_components/Skeleton
**Комментарий:** bookings/loading.tsx — скелетон списка броней: та же форма, что у готовой страницы (заголовок + фильтр,

### `app/[prefix]/[slug]/panel/(protected)/bookings/page.tsx`  (85 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, BookingsPage, default async
**Импорты (8):** next/link, @/lib/supabase, ../_lib/access, ../_lib/sections, ../_lib/time, ../_components/OnboardingTip, ./BookingList, ./rows
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/bookings/page.tsx — брони бизнеса (ТЗ §5.3, §10.7, §13.9).

### `app/[prefix]/[slug]/panel/(protected)/bookings/rows.ts`  (31 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** BOOKING_ROW_SELECT, BookingDbRow, toBookingRow
**Импорты (3):** @/lib/database.types, ../_lib/time, ./BookingList
**Комментарий:** bookings/rows.ts — строка брони для клиентского списка: общий SELECT и маппинг (список броней и дашборд).

### `app/[prefix]/[slug]/panel/(protected)/bookings/status.ts`  (60 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** BOOKING_ACTIONS, BookingAction, TRANSITIONS, STATUS_LABEL, ACTION_LABEL, ACTION_DONE, isBookingAction, canApply, VISIT_ACTIONS, availableActions, isActiveStatus
**Импорты (1):** @/lib/database.types
**Комментарий:** bookings/status.ts — переходы статусов брони (ТЗ §10.7, DECISIONS.md: new/confirmed/cancelled/done/no_show).

### `app/[prefix]/[slug]/panel/(protected)/bookings/tel.ts`  (11 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** telHref
**Комментарий:** bookings/tel.ts — ссылка «позвонить» для карточки брони. Чистый модуль: импортируется клиентским BookingList,

### `app/[prefix]/[slug]/panel/(protected)/bookings/view.ts`  (35 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** DayGroup, groupByDay, matchesQuery, SEARCH_MIN_ROWS
**Импорты (2):** ../_lib/time, ./BookingList
**Комментарий:** bookings/view.ts — представление списка броней: поиск и группировка по дням (часовой пояс бизнеса).

### `app/[prefix]/[slug]/panel/(protected)/data/DeleteAccount.tsx`  (68 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** DeleteAccount
**Импорты (7):** react, ../_components/Field, ../_components/Toast, ../_lib/client-action, ../_lib/time, ./actions, ./rules
**Комментарий:** data/DeleteAccount.tsx — запрос на удаление аккаунта с подтверждением вводом адреса сайта (ТЗ §32, design-spec §6).

### `app/[prefix]/[slug]/panel/(protected)/data/actions.ts`  (36 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** requestDeletion
**Импорты (8):** next/cache, @/lib/supabase, @/lib/admin-notify, @/lib/audit, ../_lib/access, ../_lib/time, ../_lib/result, ./rules
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/data/actions.ts — запрос на удаление аккаунта (ТЗ §32).

### `app/[prefix]/[slug]/panel/(protected)/data/page.tsx`  (44 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, DataPage, default async
**Импорты (5):** ../_lib/access, ../_lib/sections, ../_lib/time, ./rules, ./DeleteAccount
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/data/page.tsx — данные бизнеса: выгрузка CSV и удаление аккаунта (ТЗ §32).

### `app/[prefix]/[slug]/panel/(protected)/data/rules.ts`  (8 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** DELETION_GRACE_DAYS, confirmationMatches
**Комментарий:** data/rules.ts — правила удаления аккаунта (ТЗ §32). Чистый модуль: используется формой, action и тестами.

### `app/[prefix]/[slug]/panel/(protected)/error.tsx`  (21 стр.)
**Роль:** Error Boundary
**Директива:** "use client"
**Экспорты:** PanelError, default function
**Импорты (1):** react
**Комментарий:** (protected)/error.tsx — error boundary кабинета (ТЗ §13.12, §19.5). Клиентский по требованию Next.js.

### `app/[prefix]/[slug]/panel/(protected)/layout.tsx`  (53 стр.)
**Роль:** Layout
**Директива:** "use server"
**Экспорты:** dynamic, metadata, OwnerLayout, default async
**Импорты (7):** next/navigation, @/lib/owner-session, ./_components/PanelNav, ./_components/Toast, ./_lib/sections, ./_lib/color, ./_lib/subscription
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/layout.tsx — кабинет владельца: проверка доступа и навигация (ТЗ §13.9–13.11).

### `app/[prefix]/[slug]/panel/(protected)/loading.tsx`  (18 стр.)
**Роль:** Loading UI
**Экспорты:** PanelLoading, default function
**Импорты (1):** ./_components/Skeleton
**Комментарий:** (protected)/loading.tsx — скелетон при переходе между разделами (ТЗ §13.12).

### `app/[prefix]/[slug]/panel/(protected)/not-found.tsx`  (13 стр.)
**Роль:** Страница 404
**Экспорты:** PanelNotFound, default function
**Импорты (1):** next/link
**Комментарий:** (protected)/not-found.tsx — раздел не найден или недоступен для роли (ТЗ §19.5).

### `app/[prefix]/[slug]/panel/(protected)/notifications/TelegramConnect.tsx`  (294 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** TelegramConnect, default function
**Импорты (3):** react, ./actions, ./telegram-view
**Комментарий:** notifications/TelegramConnect.tsx — клиентская часть подключения Telegram (ТЗ §18.3, §36).

### `app/[prefix]/[slug]/panel/(protected)/notifications/actions.test.ts`  (125 стр.)
**Роль:** Тест (Vitest)
**Импорты (5):** vitest, @/lib/telegram.fake-db, ./actions, ./telegram-view, @/lib/telegram-connect
**Комментарий:** notifications/actions.test.ts — Vitest: server actions подключения Telegram (ТЗ §18.3, §36).

### `app/[prefix]/[slug]/panel/(protected)/notifications/actions.ts`  (69 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** createTelegramCode, disconnectTelegram, checkTelegramStatus
**Импорты (9):** next/cache, @/lib/owner-session, @/lib/supabase, @/lib/rate-limit, @/lib/audit, @/lib/telegram-connect, @/lib/telegram, ./telegram-state, ./telegram-view
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/notifications/actions.ts — подключение Telegram (ТЗ §18.3, §36).

### `app/[prefix]/[slug]/panel/(protected)/notifications/page.tsx`  (32 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, NotificationsPage, default async
**Импорты (5):** @/lib/owner-session, @/lib/telegram, ./telegram-state, ./telegram-view, ./TelegramConnect
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/notifications/page.tsx — подключение Telegram (ТЗ §18.3, §36).

### `app/[prefix]/[slug]/panel/(protected)/notifications/telegram-state.ts`  (22 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** loadTelegramState
**Импорты (4):** @/lib/supabase, @/lib/telegram-connect, @/lib/telegram, ./telegram-view
**Комментарий:** notifications/telegram-state.ts — загрузка состояния подключения Telegram из БД (только сервер).

### `app/[prefix]/[slug]/panel/(protected)/notifications/telegram-view.ts`  (44 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** TelegramState, ActionErrorCode, ActionResult, DISCONNECTED_STATE, ACTION_ERRORS, deepLink, formatLeft
**Комментарий:** notifications/telegram-view.ts — общие типы и тексты страницы «Уведомления» (без серверных импортов).

### `app/[prefix]/[slug]/panel/(protected)/page.tsx`  (170 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, OwnerHome, default async
**Импорты (10):** next/link, @/lib/supabase, @/lib/log, ./_lib/access, ./_lib/onboarding, ./_lib/sections, ./_lib/time, ./bookings/BookingList, ./_components/OnboardingTip, ./bookings/rows
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/page.tsx — дашборд и онбординг (ТЗ §13.9, §13.13, §19.1, design-spec §7.2).

### `app/[prefix]/[slug]/panel/(protected)/photos/PhotoGallery.tsx`  (210 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** PhotoGallery
**Импорты (9):** next/image, react, ../_components/ConfirmDialog, ../_components/Toast, ../_lib/client-action, ./actions, ./PhotoUploaderLazy, ./rules, ./usePhotoUploads
**Комментарий:** photos/PhotoGallery.tsx — сетка фото: загружаемые (превью сразу) + сохранённые (ТЗ §4.8, §45).

### `app/[prefix]/[slug]/panel/(protected)/photos/PhotoUploader.tsx`  (113 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** PhotoUploader
**Импорты (3):** react, ../_components/Field, ./rules
**Комментарий:** photos/PhotoUploader.tsx — выбор фото и подписи (ТЗ §45, §19.6). Сама загрузка — в usePhotoUploads.

### `app/[prefix]/[slug]/panel/(protected)/photos/PhotoUploaderLazy.tsx`  (11 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** PhotoUploaderLazy
**Импорты (1):** next/dynamic
**Комментарий:** photos/PhotoUploaderLazy.tsx — загрузчик подгружается отдельным чанком только у владельца:

### `app/[prefix]/[slug]/panel/(protected)/photos/actions.ts`  (147 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** PhotoRow, UploadTicket, createPhotoUpload, confirmPhotoUpload, updatePhotoAlt, deletePhoto
**Импорты (8):** crypto, next/cache, zod, @/lib/supabase, @/lib/log, ../_lib/access, ../_lib/result, ./rules
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/photos/actions.ts — фото работ (ТЗ §4.8, §45, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/photos/page.tsx`  (38 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, PhotosPage, default async
**Импорты (6):** @/lib/supabase, ../_lib/access, ../_components/OnboardingTip, ./actions, ./PhotoGallery, ./rules
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/photos/page.tsx — фото работ (ТЗ §4.8, §5.3, §45).

### `app/[prefix]/[slug]/panel/(protected)/photos/rules.ts`  (74 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** MAX_UPLOAD_BYTES, COMPRESS_FROM_BYTES, COMPRESS_TARGET_MB, COMPRESS_MAX_SIDE_PX, MAX_SOURCE_BYTES, MAX_PHOTOS, ALT_MIN, ALT_MAX, BUCKET, PHOTO_TYPES, PhotoMime, ACCEPT, isPhotoMime, formatMb, AltSchema, sourceFileError, uploadFileError, remainingSlots, isOwnPhotoPath, altForIndex
**Импорты (1):** zod
**Комментарий:** photos/rules.ts — ограничения фото (ТЗ §4.8, §45: bucket photos, jpg/png/webp, до 5 МБ, сжатие до 2 МБ).

### `app/[prefix]/[slug]/panel/(protected)/photos/upload-client.ts`  (56 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** ProgressFn, compressIfNeeded, uploadToSignedUrl
**Импорты (1):** ./rules
**Комментарий:** photos/upload-client.ts — браузерная часть загрузки: сжатие и PUT в Storage с прогрессом.

### `app/[prefix]/[slug]/panel/(protected)/photos/usePhotoUploads.ts`  (122 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** UploadStage, PendingPhoto, usePhotoUploads
**Импорты (5):** react, ../_lib/client-action, ./actions, ./upload-client, ./rules
**Комментарий:** photos/usePhotoUploads.ts — очередь загрузки: превью сразу (optimistic), затем сжатие → ссылка → PUT → запись.

### `app/[prefix]/[slug]/panel/(protected)/services/ServiceForm.tsx`  (74 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** ServiceForm
**Импорты (9):** react, react-hook-form, @hookform/resolvers/zod, ../_components/Field, ../_components/Toast, ../_lib/client-action, ../_lib/form, ../_lib/result, ./schema
**Комментарий:** services/ServiceForm.tsx — форма услуги: добавление и редактирование (ТЗ §4.7).

### `app/[prefix]/[slug]/panel/(protected)/services/ServiceList.tsx`  (161 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** ServiceList
**Импорты (7):** react, ../_components/Toast, ../_lib/client-action, ../_lib/busy, ./actions, ./schema, ./ServiceForm
**Комментарий:** services/ServiceList.tsx — список услуг: мгновенное скрытие/показ (useOptimistic) и правка на месте.

### `app/[prefix]/[slug]/panel/(protected)/services/actions.ts`  (87 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** addService, updateService, setServiceActive
**Импорты (6):** next/cache, zod, @/lib/supabase, ../_lib/access, ../_lib/result, ./schema
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/services/actions.ts — CRUD услуг (ТЗ §4.7, §5.3, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/services/page.tsx`  (42 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, ServicesPage, default async
**Импорты (5):** @/lib/supabase, ../_lib/access, ../_components/OnboardingTip, ./schema, ./ServiceList
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/services/page.tsx — услуги бизнеса (ТЗ §4.7, §5.3, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/services/schema.ts`  (65 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** SERVICE_LIMITS, ServiceSchema, ServiceFormValues, ServiceValues, ServiceRow, EMPTY_SERVICE, toFormValues, formatPrice, formatDuration
**Импорты (1):** zod
**Комментарий:** services/schema.ts — правила услуги (ТЗ §4.7). Чистый модуль: одна схема у формы (react-hook-form) и у server action.

### `app/[prefix]/[slug]/panel/(protected)/settings/SettingsForm.tsx`  (181 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** SettingsForm
**Импорты (12):** react, react-hook-form, @hookform/resolvers/zod, @/lib/hours, @/lib/phone, ../_components/Field, ../_components/Toast, ../_lib/client-action, ../_lib/form, ../_lib/useUnsavedGuard, ./actions, ./schema
**Комментарий:** settings/SettingsForm.tsx — форма настроек (ТЗ §4.6, §19.6). react-hook-form + та же zod-схема, что на сервере.

### `app/[prefix]/[slug]/panel/(protected)/settings/actions.ts`  (41 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** saveSettings
**Импорты (5):** next/cache, @/lib/supabase, ../_lib/access, ../_lib/result, ./schema
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/settings/actions.ts — настройки бизнеса (ТЗ §4.6, §5.3, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/settings/page.tsx`  (22 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, SettingsPage, default async
**Импорты (3):** ../_lib/access, ./schema, ./SettingsForm
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/settings/page.tsx — настройки бизнеса (ТЗ §4.6, §5.3).

### `app/[prefix]/[slug]/panel/(protected)/settings/schema.ts`  (103 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** SLOT_STEPS, SettingsSchema, SettingsFormValues, SettingsValues, SETTINGS_FIELDS, toSettingsForm
**Импорты (4):** zod, @/lib/hours, @/lib/phone, @/lib/database.types
**Комментарий:** settings/schema.ts — правила настроек бизнеса (ТЗ §4.6). Чистый модуль: одна схема у формы и у server action.

### `app/[prefix]/[slug]/panel/(protected)/subscription/PaidReport.tsx`  (68 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** PaidReport
**Импорты (9):** react, react-hook-form, @hookform/resolvers/zod, ../_components/Field, ../_components/Toast, ../_lib/client-action, ../_lib/form, ./actions, ./schema
**Комментарий:** subscription/PaidReport.tsx — «Я оплатил»: сообщение админу платформы (ТЗ §14.1–14.2).

### `app/[prefix]/[slug]/panel/(protected)/subscription/actions.ts`  (49 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** reportPayment
**Импорты (7):** @/lib/notify, @/lib/admin-notify, @/lib/rate-limit, @/lib/audit, ../_lib/access, ../_lib/result, ./schema
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/subscription/actions.ts — «Я оплатил» (ТЗ §5.3, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/subscription/page.tsx`  (95 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, SubscriptionPage, default async
**Импорты (7):** zod, @/lib/supabase, ../_lib/access, ../_lib/time, ../_lib/subscription, ../_components/CopyButton, ./PaidReport
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/subscription/page.tsx — подписка владельца (ТЗ §5.3, §13.10, §14.1).

### `app/[prefix]/[slug]/panel/(protected)/subscription/schema.ts`  (17 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** PAID_LIMITS, PaidSchema, PaidInput, PAID_FIELDS
**Импорты (1):** zod
**Комментарий:** subscription/schema.ts — форма «Я оплатил»: одна zod-схема для клиента (react-hook-form) и server action.

### `app/[prefix]/[slug]/panel/(protected)/team/CredentialsCard.tsx`  (36 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** CredentialsCard
**Импорты (3):** react, ../_components/CopyButton, ./schema
**Комментарий:** team/CredentialsCard.tsx — одноразовый показ логина и пароля нового менеджера.

### `app/[prefix]/[slug]/panel/(protected)/team/InviteForm.tsx`  (49 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** InviteForm
**Импорты (9):** react, react-hook-form, @hookform/resolvers/zod, ../_components/Field, ../_components/Toast, ../_lib/client-action, ../_lib/form, ./actions, ./schema
**Комментарий:** team/InviteForm.tsx — форма приглашения менеджера: zod на клиенте (та же схема, что в action), ошибка под полем.

### `app/[prefix]/[slug]/panel/(protected)/team/TeamManager.tsx`  (94 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** TeamManager
**Импорты (8):** react, ../_components/Toast, ../_components/ConfirmDialog, ../_lib/client-action, ./actions, ./InviteForm, ./CredentialsCard, ./schema
**Комментарий:** team/TeamManager.tsx — список участников, приглашение и удаление менеджера (ТЗ §5.6, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/team/actions.ts`  (90 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** inviteManager, removeMember
**Импорты (7):** crypto, next/cache, @/lib/supabase, @/lib/audit, ../_lib/access, ../_lib/result, ./schema
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/team/actions.ts — команда: приглашение менеджера и удаление (ТЗ §5.6, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/team/page.tsx`  (34 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, TeamPage, default async
**Импорты (4):** @/lib/supabase, ../_lib/access, ./schema, ./TeamManager
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/team/page.tsx — команда бизнеса (ТЗ §5.6, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/team/schema.ts`  (33 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** MAX_MANAGERS, EMAIL_MAX, InviteSchema, InviteInput, INVITE_FIELDS, MemberRow, InviteResult, ROLE_LABEL, managersCount, canRemove
**Импорты (2):** zod, @/lib/database.types
**Комментарий:** team/schema.ts — команда бизнеса: валидация приглашения и тип строки списка (ТЗ §5.6, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/texts/TextsForm.tsx`  (101 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** TextsForm
**Импорты (10):** react, react-hook-form, @hookform/resolvers/zod, ../_components/Field, ../_components/Toast, ../_lib/client-action, ../_lib/form, ../_lib/useUnsavedGuard, ./actions, ./schema
**Комментарий:** texts/TextsForm.tsx — редактор текстов с живым превью первого экрана (ТЗ §5.3, §19.6).

### `app/[prefix]/[slug]/panel/(protected)/texts/actions.ts`  (27 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** saveTexts
**Импорты (5):** next/cache, @/lib/supabase, ../_lib/access, ../_lib/result, ./schema
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/texts/actions.ts — сохранение текстов сайта (ТЗ §5.3, §13.10).

### `app/[prefix]/[slug]/panel/(protected)/texts/page.tsx`  (30 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, TextsPage, default async
**Импорты (3):** ../_lib/access, ./schema, ./TextsForm
**Комментарий:** app/[prefix]/[slug]/panel/(protected)/texts/page.tsx — тексты сайта (ТЗ §5.3, §15).

### `app/[prefix]/[slug]/panel/(protected)/texts/schema.ts`  (56 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** TEXT_KEYS, TextKey, TEXT_META, DEFAULT_CTA, cleanText, TextsSchema, TextsValues, toTextsForm, mergeTexts
**Импорты (1):** zod
**Комментарий:** texts/schema.ts — тексты сайта (custom_texts): заголовок, подзаголовок, «О нас», кнопка записи.

### `app/[prefix]/[slug]/panel/export/csv.ts`  (58 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** CSV_SEPARATOR, ExportBooking, CSV_HEADER, csvCell, csvRow, bookingToRow, buildCsv, exportFilename
**Импорты (1):** @/lib/database.types
**Комментарий:** export/csv.ts — сборка CSV броней (ТЗ §32). Чистый модуль: без БД, покрыт тестами.

### `app/[prefix]/[slug]/panel/export/route.ts`  (71 стр.)
**Роль:** Route Handler
**HTTP-методы:** GET
**Экспорты:** runtime, dynamic, GET
**Импорты (6):** @/lib/owner-session, @/lib/supabase, @/lib/audit, ../(protected)/bookings/status, ../(protected)/_lib/time, ./csv
**Комментарий:** app/[prefix]/[slug]/panel/export/route.ts — выгрузка броней бизнеса в CSV (ТЗ §32).

### `app/[prefix]/[slug]/panel/login/page.tsx`  (55 стр.)
**Роль:** Страница (Page)
**Директива:** "use server"
**Экспорты:** metadata, dynamic, OwnerLogin, default async
**Импорты (7):** next/navigation, @/lib/owner-session, @/lib/auth-core, @/lib/auth-request, @/lib/auth-forms, @/lib/site, @/components/auth/AuthUi
**Комментарий:** app/[prefix]/[slug]/panel/login/page.tsx — вход владельца/менеджера (ТЗ §5.3: /{prefix}/{slug}/panel/login).

### `app/[prefix]/[slug]/use-booking-submit.ts`  (80 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** SubmitPhase, SubmitOutcome, useBookingSubmit
**Импорты (4):** react, react-hook-form, @/lib/booking-client, @/lib/schemas
**Комментарий:** Отправка формы брони: useOptimistic (мгновенный отклик «Записываем…» и откат при ошибке) + useTransition.

---

## Часть 9. Верхнеуровневые маршруты `app/` (28 файлов)

### `app/_legal/LegalDocument.tsx`  (115 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** LegalSection, LegalDocument, RequisitesBlock, Clauses
**Импорты (4):** next/link, @/components/CookieSettingsButton, react, @/lib/legal
**Комментарий:** app/_legal/LegalDocument.tsx — общий каркас юридических документов (/oferta, /privacy, /dogovor-porucheniya):

### `app/blocked/page.tsx`  (49 стр.)
**Роль:** Страница (Page)
**Экспорты:** metadata, Blocked, default function
**Импорты (2):** next, @/lib/site
**Комментарий:** app/blocked/page.tsx — заглушка: лицензия заблокирована вручную или срок поддержки истёк (ТЗ 4.0 §3.4 п.6, §14.4, §14.6).

### `app/booking/cancel/[token]/actions.ts`  (11 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** cancelAction
**Импорты (2):** @/lib/booking-action-state, @/lib/booking-action-state-types
**Комментарий:** app/booking/cancel/[token]/actions.ts — server action отмены по токену (ТЗ §10.4).

### `app/booking/cancel/[token]/page.tsx`  (14 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, CancelShortPage, default async
**Импорты (2):** next/navigation, @/lib/booking-view
**Комментарий:** app/booking/cancel/[token]/page.tsx — короткий адрес из письма (ТЗ §10.4). Переводит на страницу на сайте бизнеса,

### `app/booking/reschedule/[token]/actions.ts`  (11 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** rescheduleAction
**Импорты (2):** @/lib/booking-action-state, @/lib/booking-action-state-types
**Комментарий:** app/booking/reschedule/[token]/actions.ts — server action переноса по токену (ТЗ §10.5).

### `app/booking/reschedule/[token]/page.tsx`  (14 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, RescheduleShortPage, default async
**Импорты (2):** next/navigation, @/lib/booking-view
**Комментарий:** app/booking/reschedule/[token]/page.tsx — короткий адрес из письма (ТЗ §10.5). Переводит на страницу на сайте бизнеса,

### `app/data-request/DataRequestForm.tsx`  (127 стр.)
**Роль:** Файл маршрута App Router
**Директива:** "use client"
**Экспорты:** DataRequestForm
**Импорты (3):** react-dom, @/lib/data-request, ./actions
**Комментарий:** app/data-request/DataRequestForm.tsx — форма запроса субъекта ПД.

### `app/data-request/actions.ts`  (87 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** submitDataRequest
**Импорты (8):** next/headers, @/lib/supabase, @/lib/rate-limit, @/lib/admin-notify, @/lib/notify, @/lib/legal, @/lib/data-request, @/lib/site
**Комментарий:** app/data-request/actions.ts — приём запроса субъекта ПД (ТЗ 4.0 §4.42, §7.2, §15.4; ст. 14, 20, 21 ФЗ-152).

### `app/data-request/page.tsx`  (51 стр.)
**Роль:** Страница (Page)
**Экспорты:** revalidate, metadata, DataRequestPage, default async
**Импорты (4):** next, next/link, @/lib/legal, ./DataRequestForm
**Комментарий:** app/data-request/page.tsx — запрос субъекта ПД: доступ, исправление, удаление, отзыв согласия, отказ от писем

### `app/dogovor-porucheniya/page.tsx`  (165 стр.)
**Роль:** Страница (Page)
**Экспорты:** revalidate, metadata, DpaPage, default async
**Импорты (5):** next, next/link, @/app/_legal/LegalDocument, @/lib/legal, @/lib/site
**Комментарий:** app/dogovor-porucheniya/page.tsx — договор поручения на обработку ПД (ТЗ 4.0 §15.2, §15.4; ч. 3–5 ст. 6 ФЗ-152).

### `app/domain-site/by-domain/[[...rest]]/page.tsx`  (48 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, generateMetadata, CustomDomainPage, default async
**Импорты (6):** next, next/navigation, @/lib/supabase, @/lib/site, @/lib/custom-domain, @/app/[prefix]/[slug]/page
**Комментарий:** app/domain-site/by-domain/[[...rest]]/page.tsx — главная сайта клиента на кастомном домене (ТЗ §3.2, §40).

### `app/globals.css`  (133 стр.)
**Роль:** Файл маршрута App Router
**Правил CSS:** ~27

### `app/invite/[token]/actions.ts`  (39 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** acceptInviteAction
**Импорты (6):** next/navigation, @/lib/auth-invites, @/lib/auth-request, @/lib/auth-audit, @/lib/auth-forms, @/lib/auth-core
**Комментарий:** app/invite/[token]/actions.ts — принятие приглашения (ТЗ §5.6): установка пароля и вход в кабинет.

### `app/invite/[token]/page.tsx`  (51 стр.)
**Роль:** Страница (Page)
**Экспорты:** metadata, dynamic, InvitePage, default async
**Импорты (6):** @/lib/auth-invites, @/lib/auth-roles, @/lib/auth-forms, @/lib/auth-core, @/components/auth/AuthUi, ./actions
**Комментарий:** app/invite/[token]/page.tsx — страница приглашения в кабинет (ТЗ §5.3, §5.6: /invite/{token}).

### `app/layout.tsx`  (49 стр.)
**Роль:** Layout
**Экспорты:** metadata, viewport, RootLayout, default function
**Импорты (3):** react, next, @/lib/site
**Комментарий:** app/layout.tsx — корневой макет: глобальные metadata и viewport (ТЗ §12.2).

### `app/magic-link/actions.ts`  (47 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** requestMagicLinkAction, consumeMagicLinkAction
**Импорты (6):** next/navigation, @/lib/auth-magic, @/lib/auth-request, @/lib/auth-audit, @/lib/auth-core, @/lib/auth-forms
**Комментарий:** app/magic-link/actions.ts — magic-link (ТЗ §5.3, §5.4): запрос письма и вход по ссылке.

### `app/magic-link/page.tsx`  (56 стр.)
**Роль:** Страница (Page)
**Экспорты:** metadata, dynamic, MagicLinkPage, default async
**Импорты (6):** @/lib/auth-magic, @/lib/auth-flow, @/lib/auth-core, @/lib/auth-forms, @/components/auth/AuthUi, ./actions
**Комментарий:** app/magic-link/page.tsx — вход по ссылке из письма (ТЗ §5.3, §5.4: /magic-link, /magic-link?token=...).

### `app/oferta/page.tsx`  (162 стр.)
**Роль:** Страница (Page)
**Экспорты:** revalidate, metadata, OfertaPage, default async
**Импорты (5):** next, next/link, @/app/_legal/LegalDocument, @/lib/legal, @/lib/site
**Комментарий:** app/oferta/page.tsx — публичная оферта (ТЗ 4.0 §1.3, §14, §15.2, §15.5). Реквизиты и цены — из settings.

### `app/page.tsx`  (72 стр.)
**Роль:** Страница (Page)
**Экспорты:** metadata, revalidate, Home, default async
**Импорты (3):** next/link, @/components/CookieSettingsButton, @/lib/legal
**Комментарий:** app/page.tsx — лендинг сервиса (ТЗ §15).

### `app/preview/[slug]/page.tsx`  (49 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, PreviewPage, default async
**Импорты (5):** next/navigation, next, @/lib/supabase, @/lib/business, @/components/templates/StudioTemplate
**Комментарий:** app/preview/[slug]/page.tsx — прототип для просмотра по токену (ТЗ §3.4, §48).

### `app/privacy/page.tsx`  (244 стр.)
**Роль:** Страница (Page)
**Экспорты:** revalidate, metadata, PrivacyPage, default async
**Импорты (5):** next, next/link, @/app/_legal/LegalDocument, @/lib/legal, @/lib/site
**Комментарий:** app/privacy/page.tsx — политика обработки персональных данных (ТЗ 4.0 §15.3, §15.4, §15.8; ст. 18.1 ФЗ-152).

### `app/reset-password/actions.ts`  (56 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** requestResetAction, completeResetAction
**Импорты (6):** next/navigation, @/lib/auth-reset, @/lib/auth-request, @/lib/auth-audit, @/lib/auth-core, @/lib/auth-forms
**Комментарий:** app/reset-password/actions.ts — сброс пароля (ТЗ §5.5): запрос письма (форма /panel/forgot-password)

### `app/reset-password/page.tsx`  (42 стр.)
**Роль:** Страница (Page)
**Экспорты:** metadata, dynamic, ResetPasswordPage, default async
**Импорты (6):** next/navigation, @/lib/auth-reset, @/lib/auth-forms, @/lib/auth-core, @/components/auth/AuthUi, ./actions
**Комментарий:** app/reset-password/page.tsx — новый пароль по ссылке из письма (ТЗ §5.5: /reset-password?token=...).

### `app/robots.ts`  (19 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** robots, default function
**Импорты (2):** next, @/lib/site
**Комментарий:** app/robots.ts — правила для поисковиков (ТЗ §3.4: прототипы закрыты).

### `app/sitemap.ts`  (32 стр.)
**Роль:** Файл маршрута App Router
**Экспорты:** dynamic, sitemap, default async
**Импорты (4):** next, @/lib/supabase, @/lib/site, @/lib/legal
**Комментарий:** app/sitemap.ts — карта сайта (ТЗ §0.3, §5.1). Только бизнесы со status='client'.

### `app/sw.js/route.ts`  (19 стр.)
**Роль:** Route Handler
**HTTP-методы:** GET
**Экспорты:** runtime, GET
**Импорты (1):** @/lib/sw-source
**Комментарий:** app/sw.js/route.ts — service worker PWA (ТЗ §5.1: без Workbox).

### `app/unsubscribe/[token]/actions.ts`  (64 стр.)
**Роль:** Server Actions
**Директива:** "use server"
**Экспорты:** UnsubscribePageStatus, confirmUnsubscribe, saveUnsubscribeReason
**Импорты (4):** next/headers, next/navigation, @/lib/rate-limit, @/lib/legal
**Комментарий:** app/unsubscribe/[token]/actions.ts — подтверждение отписки со страницы и необязательная причина (ТЗ 4.0 §9.5).

### `app/unsubscribe/[token]/page.tsx`  (134 стр.)
**Роль:** Страница (Page)
**Экспорты:** dynamic, metadata, UnsubscribePage, default async
**Импорты (5):** next, next/link, react, @/lib/legal, ./actions
**Комментарий:** app/unsubscribe/[token]/page.tsx — страница отписки по ссылке из письма (ТЗ 4.0 §9.5, §15.7; 38-ФЗ ст. 18).

---

## Часть 10. React-компоненты — `components/` (12 файлов)

### `components/Analytics.test.ts`  (104 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** vitest, ./Analytics
**Комментарий:** components/Analytics.test.ts — Vitest: клиентский pixel без DOM-окружения (jsdom не добавляем — новые зависимости

### `components/Analytics.tsx`  (144 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** TRACK_ENDPOINT, ClientAnalyticsEvent, isTrackingDisabled, sendAnalyticsEvent, Analytics
**Импорты (1):** react
**Комментарий:** components/Analytics.tsx — pixel аналитики на публичных страницах (ТЗ 4.0 §12.3).

### `components/CookieBanner.tsx`  (280 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** CookieBanner
**Импорты (3):** react, @/lib/legal-versions, @/lib/site
**Комментарий:** components/CookieBanner.tsx — баннер согласия на cookie (ТЗ 4.0 §15.6, §4.44).

### `components/CookieBannerLazy.tsx`  (10 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** CookieBannerLazy
**Импорты (1):** next/dynamic
**Комментарий:** components/CookieBannerLazy.tsx — ленивое подключение CookieBanner: код баннера грузится отдельным чанком после

### `components/CookieSettingsButton.tsx`  (16 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** CookieSettingsButton
**Импорты (2):** react, @/lib/legal-versions
**Комментарий:** components/CookieSettingsButton.tsx — кнопка «Настройки cookie» для футеров: повторно открывает настройки баннера

### `components/Hero.tsx`  (37 стр.)
**Роль:** React-компонент
**Экспорты:** Hero
**Импорты (1):** @/lib/database.types
**Комментарий:** components/Hero.tsx — hero-блок сайта (ТЗ §5.1): логотип, название, адрес, телефон, рейтинг, кнопка записи.

### `components/MapBlock.tsx`  (45 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** MapBlock
**Импорты (1):** react
**Комментарий:** components/MapBlock.tsx — карта Leaflet + OpenStreetMap с маркером (ТЗ §5.1). Загружается только в браузере.

### `components/MapLazy.tsx`  (9 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** MapLazy
**Импорты (1):** next/dynamic
**Комментарий:** components/MapLazy.tsx — карта подгружается только в браузере и только когда нужна (ТЗ §5.1, оптимизация).

### `components/OceanBackdrop.tsx`  (101 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** OceanBackdrop
**Импорты (1):** react
**Комментарий:** components/OceanBackdrop.tsx — пиксельный фон карточки записи (перенесён из rabota).

### `components/auth/AuthUi.tsx`  (100 стр.)
**Роль:** React-компонент
**Экспорты:** AuthShell, AuthMessages, AuthField, AuthForm, HiddenField, AuthLinks, PASSWORD_HINT
**Импорты (4):** react, @/lib/auth-forms, @/lib/auth-core, ./SubmitButton
**Комментарий:** components/auth/AuthUi.tsx — разметка auth-страниц (вход, magic-link, приглашение, сброс пароля).

### `components/auth/SubmitButton.tsx`  (14 стр.)
**Роль:** React-компонент
**Директива:** "use client"
**Экспорты:** SubmitButton
**Импорты (1):** react-dom
**Комментарий:** components/auth/SubmitButton.tsx — кнопка отправки auth-форм: блокируется на время запроса

### `components/templates/StudioTemplate.tsx`  (348 стр.)
**Роль:** React-компонент
**Экспорты:** TemplatePhoto, StudioTemplate
**Импорты (6):** @phosphor-icons/react/dist/ssr, @/lib/database.types, @/components/OceanBackdrop, @/components/MapLazy, @/lib/contrast, next/image
**Комментарий:** components/templates/StudioTemplate.tsx — шаблон сайта, повторяет разметку и классы rabota (см. SGX_Detailing.html):

---

## Часть 11. Статические ресурсы — `public/` (2 файлов CSS + 13 шрифтов)

### `public/assets/studio-site.css`  (219 стр.)
**Роль:** Статический ресурс
**Правил CSS:** ~29

### `public/assets/studio.css`  (2 стр.)
**Роль:** Статический ресурс
**Правил CSS:** ~2550


### Шрифтовые файлы `public/assets/*.woff2` (13 шт.)

Все 13 файлов — вариативные веб-шрифты (ось `wght`), подключённые через `@font-face` в `studio.css` / `studio-site.css`. Разбиты по подмножествам Unicode для оптимальной загрузки. Бинарные, в каталоге перечислены с размером и назначением.

| Файл | Семейство | Подмножество | Размер | Назначение |
|---|---|---|---|---|
| `public/assets/ibm-plex-sans-cyrillic-ext-wght-normal-d45eAU9y.woff2` | IBM Plex Sans | cyrillic-ext | 23.0 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/ibm-plex-sans-cyrillic-wght-normal-BAAhND-U.woff2` | IBM Plex Sans | cyrillic | 28.8 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/ibm-plex-sans-greek-wght-normal-CmyJS8uq.woff2` | IBM Plex Sans | greek | 19.0 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/ibm-plex-sans-latin-ext-wght-normal-CIII54If.woff2` | IBM Plex Sans | latin-ext | 30.2 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/ibm-plex-sans-latin-wght-normal-IvpUvPa2.woff2` | IBM Plex Sans | latin | 44.6 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/ibm-plex-sans-vietnamese-wght-normal-Dg1JeJN0.woff2` | IBM Plex Sans | vietnamese | 12.9 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2` | Inter | cyrillic-ext | 25.4 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2` | Inter | cyrillic | 18.3 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/inter-greek-ext-wght-normal-DlzME5K_.woff2` | Inter | greek-ext | 11.0 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/inter-greek-wght-normal-CkhJZR-_.woff2` | Inter | greek | 18.6 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2` | Inter | latin-ext | 83.1 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/inter-latin-wght-normal-Dx4kXJAl.woff2` | Inter | latin | 47.1 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |
| `public/assets/inter-vietnamese-wght-normal-CBcvBZtf.woff2` | Inter | vietnamese | 10.0 КБ | Вариативный шрифт (ось wght) для веб-интерфейса |

---

## Часть 12. Тесты — `tests/` (40 файлов)

### `tests/admin-businesses.spec.ts`  (110 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./admin-helpers
**Комментарий:** tests/admin-businesses.spec.ts — список бизнесов (ТЗ §13.1, §13.3): доступ к экспорту, фильтры, пагинация,

### `tests/admin-funnel.spec.ts`  (90 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./admin-helpers
**Комментарий:** tests/admin-funnel.spec.ts — воронка супер-админки (ТЗ §13.2): доступ, 5 шагов, фильтры в URL, a11y, burger.

### `tests/admin-helpers.ts`  (48 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** ADMIN_EMAIL, ADMIN_PASSWORD, HAS_ADMIN, HAS_APP, ALLOW_WRITES, requireAdmin, requireApp, requireWrites, loginAsAdmin, expectToast, runId, isMobile
**Импорты (1):** @playwright/test
**Комментарий:** tests/admin-helpers.ts — общие шаги e2e супер-админки: вход, ожидание тоста, флаги окружения.

### `tests/admin-settings.spec.ts`  (83 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./admin-helpers
**Комментарий:** tests/admin-settings.spec.ts — настройки платформы (ТЗ §15.5): разделы, валидация ИНН/цен/лимитов, сохранение.

### `tests/admin-verticals.spec.ts`  (71 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./admin-helpers
**Комментарий:** tests/admin-verticals.spec.ts — ниши (ТЗ §4.5): экспорт JSON под защитой, JSON-редактор с проверкой синтаксиса,

### `tests/analytics.spec.ts`  (145 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** @playwright/test
**Комментарий:** tests/analytics.spec.ts — Playwright E2E собственной аналитики (ТЗ 4.0 §12.3).

### `tests/auth.spec.ts`  (138 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** @playwright/test, ./stand, ./ui
**Комментарий:** tests/auth.spec.ts — e2e входа: страницы, a11y форм, ошибки, open redirect, refresh, стенд (вход/выход/роли).

### `tests/backup.spec.ts`  (50 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** @playwright/test
**Комментарий:** tests/backup.spec.ts — e2e бэкапа и transfer: защита маршрутов (CRON_SECRET, isSuperAdmin), подтверждение restore.

### `tests/cookie.spec.ts`  (130 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ../lib/legal-versions
**Комментарий:** tests/cookie.spec.ts — баннер cookie: показ, 3 кнопки, хранение выбора, запись согласия, настройки, a11y.

### `tests/e2e-mock-supabase.ts`  (202 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** node:http, node:crypto
**Комментарий:** tests/e2e-mock-supabase.ts — стенд для e2e без настоящей базы: Supabase Auth (вход по паролю, /user)

### `tests/email-accounts.spec.ts`  (58 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./email-helpers
**Комментарий:** tests/email-accounts.spec.ts — ящики рассылки: доступ, создание, валидация, optimistic вкл/выкл, удаление, a11y.

### `tests/email-helpers.ts`  (28 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** E2E, E2E_READY, SKIP_REASON, loginAsAdmin, uniq
**Импорты (1):** @playwright/test
**Комментарий:** tests/email-helpers.ts — общий вход в супер-админку для Playwright-спеков зоны email (агент 8).

### `tests/email-inbox.spec.ts`  (53 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./email-helpers
**Комментарий:** tests/email-inbox.spec.ts — входящие: доступ, фильтры, отметки, валидация ответа, a11y.

### `tests/email-templates.spec.ts`  (47 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./email-helpers
**Комментарий:** tests/email-templates.spec.ts — шаблоны: создание, новая версия, откат, предпросмотр в sandbox, экранирование, удаление.

### `tests/helpers.ts`  (27 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** E2E_SECRET, makeUnsubscribeToken, uniqueEmail, LEGAL_PAGES, DISMISS_COOKIE_SCRIPT
**Импорты (1):** ../lib/legal
**Комментарий:** tests/helpers.ts — общие утилиты e2e юридического слоя.

### `tests/invite.spec.ts`  (77 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** @playwright/test, ./stand, ./ui
**Комментарий:** tests/invite.spec.ts — e2e приглашения /invite/{token} (ТЗ §5.6).

### `tests/legal.spec.ts`  (101 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** @playwright/test, ../lib/legal-versions, ./helpers
**Комментарий:** tests/legal.spec.ts — юридические документы: структура, версия, реквизиты, ссылки, robots, a11y-разметка.

### `tests/license.spec.ts`  (72 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ../lib/license-client
**Комментарий:** tests/license.spec.ts — e2e лицензии: протокол ping (HMAC запроса и ответа), fail-safe ответы, revoke, /blocked.

### `tests/memory-backup-db.ts`  (72 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** MemoryDb
**Импорты (1):** ../lib/backup
**Комментарий:** tests/memory-backup-db.ts — BackupDb в памяти для unit-тестов lib/backup*.test.ts (не Playwright-спека).

### `tests/owner-bookings.spec.ts`  (85 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./owner-helpers
**Комментарий:** tests/owner-bookings.spec.ts — брони: фильтр, мгновенная смена статуса, подтверждение отмены, мобильные карточки.

### `tests/owner-helpers.ts`  (46 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** PANEL_PATH, OWNER, MANAGER, hasOwner, hasManager, panelUrl, requireOwner, login, uniq, escapeRe, expectToast
**Импорты (1):** @playwright/test
**Комментарий:** tests/owner-helpers.ts — общие шаги e2e кабинета владельца (Playwright).

### `tests/owner-login.spec.ts`  (91 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./owner-helpers
**Комментарий:** tests/owner-login.spec.ts — вход в кабинет, навигация, роли и выход (ТЗ §13.9–13.11).

### `tests/owner-photos.spec.ts`  (75 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./owner-helpers
**Комментарий:** tests/owner-photos.spec.ts — фото: подпись обязательна, превью и прогресс сразу, удаление с подтверждением, лимиты.

### `tests/owner-services.spec.ts`  (72 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./owner-helpers
**Комментарий:** tests/owner-services.spec.ts — услуги: добавление с валидацией, правка, мгновенное скрытие/показ.

### `tests/owner-settings.spec.ts`  (77 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./owner-helpers
**Комментарий:** tests/owner-settings.spec.ts — настройки: валидация рабочего времени и телефонов на клиенте, сохранение, a11y-атрибуты.

### `tests/playwright.config.ts`  (21 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** default defineConfig
**Импорты (1):** @playwright/test
**Комментарий:** tests/playwright.config.ts — e2e кабинета владельца. Запуск: npx playwright test -c tests

### `tests/reset.spec.ts`  (76 стр.)
**Роль:** Тест (Vitest)
**Импорты (3):** @playwright/test, ./stand, ./ui
**Комментарий:** tests/reset.spec.ts — e2e сброса пароля: /panel/forgot-password → /reset-password?token=... (ТЗ §5.5).

### `tests/stand.ts`  (80 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** STAND, STAND_SKIP_REASON, uniqueEmail, StandBusiness, createBusiness, createUser, addMember, createInviteToken, TokenKind, createAuthToken, clearAuthRateLimits
**Импорты (2):** @supabase/supabase-js, ../lib/auth-core
**Комментарий:** tests/stand.ts — подготовка данных для e2e на тестовом стенде (E2E_STAND=1).

### `tests/support/env.ts`  (28 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** TestEnv, testEnv, testDb
**Импорты (1):** @supabase/supabase-js
**Комментарий:** tests/support/env.ts — доступ к тестовому Supabase для E2E. Только TEST_SUPABASE_* (ТЗ: «не ходить в прод БД»).

### `tests/support/fixtures.ts`  (133 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** TEMPLATE_PREFIX, BUSINESS_PHONE, TestBusiness, BookingOverrides, TestBooking, createBusiness, removeBusiness, hourIn, createBooking, BookingRow, readBooking, bookingsOf, auditCount, uniqueIp, test, expect
**Импорты (3):** node:crypto, @playwright/test, ./env
**Комментарий:** tests/support/fixtures.ts — тестовые данные E2E: свой бизнес на каждый тест (уникальный slug), услуга, брони.

### `tests/support/global-setup.ts`  (8 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** globalSetup, default async
**Импорты (1):** ./env
**Комментарий:** tests/support/global-setup.ts — проверка окружения до старта E2E: тестовая БД доступна и в ней есть миграции.

### `tests/telegram-connect.spec.ts`  (154 стр.)
**Роль:** Тест (Vitest)
**Импорты (1):** @playwright/test
**Комментарий:** tests/telegram-connect.spec.ts — Playwright E2E: подключение Telegram в кабинете бизнеса (ТЗ §18.3, §36).

### `tests/ui.ts`  (12 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** formAlert, formStatus
**Импорты (1):** @playwright/test
**Комментарий:** tests/ui.ts — локаторы сообщений формы. Next.js добавляет на каждую страницу пустой

### `tests/unit/panel-actions.test.ts`  (378 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, @/lib/database.types, ./supabase-mock, ./panel-fixtures
**Комментарий:** tests/unit/panel-actions.test.ts — server actions кабинета с моком Supabase (Vitest).

### `tests/unit/panel-export.test.ts`  (82 стр.)
**Роль:** Тест (Vitest)
**Импорты (4):** vitest, @/lib/database.types, ./supabase-mock, ./panel-fixtures
**Комментарий:** tests/unit/panel-export.test.ts — GET /panel/export (CSV броней): права, постраничное чтение, заголовки ответа.

### `tests/unit/panel-fixtures.ts`  (37 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** BUSINESS_ID, OTHER_ID, ROW_ID, SLUG, makeBusiness, makeMember
**Импорты (1):** @/lib/database.types
**Комментарий:** tests/unit/panel-fixtures.ts — общие данные и моки модулей для тестов actions кабинета.

### `tests/unit/panel-pure.test.ts`  (421 стр.)
**Роль:** Тест (Vitest)
**Импорты (14):** vitest, ../../app/[prefix]/[slug]/panel/export/csv, ../../app/[prefix]/[slug]/panel/(protected)/_lib/onboarding, ../../app/[prefix]/[slug]/panel/(protected)/_lib/sections, ../../app/[prefix]/[slug]/panel/(protected)/bookings/status, ../../app/[prefix]/[slug]/panel/(protected)/photos/rules, ../../app/[prefix]/[slug]/panel/(protected)/_lib/time, ../../app/[prefix]/[slug]/panel/(protected)/_lib/client-action, ../../app/[prefix]/[slug]/panel/(protected)/_lib/result, ../../app/[prefix]/[slug]/panel/(protected)/data/rules, ../../app/[prefix]/[slug]/panel/(protected)/team/schema, ../../app/[prefix]/[slug]/panel/(protected)/subscription/schema, ../../app/[prefix]/[slug]/panel/(protected)/texts/schema, ../../app/[prefix]/[slug]/panel/(protected)/services/schema
**Комментарий:** tests/unit/panel-pure.test.ts — чистые модули кабинета: CSV, чек-лист, разделы и роли, статусы, фото, время, команда.

### `tests/unit/supabase-mock.ts`  (85 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** DbResult, QueryCall, calls, queueResult, storageApi, authAdmin, db, resetDb, hasOp, opsOf, argOf
**Импорты (1):** vitest
**Комментарий:** tests/unit/supabase-mock.ts — мок Supabase для unit-тестов server actions кабинета.

### `tests/unsubscribe.spec.ts`  (90 стр.)
**Роль:** Тест (Vitest)
**Импорты (2):** @playwright/test, ./helpers
**Комментарий:** tests/unsubscribe.spec.ts — отписка: страница, One-Click API (RFC 8058), идемпотентность, noindex.

### `tests/vitest.config.ts`  (22 стр.)
**Роль:** Тест (Vitest)
**Экспорты:** default defineConfig
**Импорты (2):** node:url, vitest/config
**Комментарий:** tests/vitest.config.ts — unit-тесты (lib/hours, actions кабинета). Запуск: npx vitest run -c tests/vitest.config.ts

---

## Итоговая сводка и релиз-блокеры

- **Единственный открытый релиз-блокер:** в Vercel-проекте `servis` не заданы 3 ключа Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) для проекта `oryzoexstuzgpbqvpjbr`. Без них лайв-сайт не работает.
- В `.env.local` остаётся плейсхолдер `SUPABASE_JWT_SECRET=<VSTAVIT_JWT>` — нужен реальный секрет.
- В `vercel.json` объявлены только 2 cron-задачи (лимит Vercel Hobby); остальные 13+ задач выполняются через `pg_cron` (миграция `0008_pg_cron.sql`) — это осознанное архитектурное решение, не баг.
- Миграции накатаны до `0014_partition_bookings.sql`; README/DEPLOY частично не синхронизированы с `PROGRESS.md`.

_Конец документа._