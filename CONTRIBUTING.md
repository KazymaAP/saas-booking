# CONTRIBUTING — правила работы с кодом saas-booking

Документ для разработчика, который вносит изменения в проект. Проект проприетарный (`"private": true`),
изменения принимаются только от участников с доступом к репозиторию `KazymaAP/saas-booking`.

## Оглавление

1. [Подготовка окружения](#подготовка-окружения)
2. [Порядок работы](#порядок-работы)
3. [Ветки](#ветки)
4. [Коммиты](#коммиты)
5. [Стиль кода](#стиль-кода)
6. [Где что менять](#где-что-менять)
7. [Миграции БД](#миграции-бд)
8. [Переменные окружения](#переменные-окружения)
9. [Проверка перед push](#проверка-перед-push)
10. [Документация](#документация)
11. [Чего не делать](#чего-не-делать)

## Подготовка окружения

| Инструмент | Версия | Почему |
|---|---|---|
| Node | 20 или новее; Vercel собирает на 24.x (`engines.node`) | Next.js 14.2 |
| pnpm | 10 | pnpm 9 не принимает текущий `pnpm-workspace.yaml` (`packages field missing or empty`) |
| Git | любая актуальная | — |
| Редактор | с поддержкой TypeScript | VS Code по ТЗ §0.1 |

```bash
git clone https://github.com/KazymaAP/saas-booking.git
cd saas-booking
pnpm install
cp .env.example .env.local      # заполнить — см. README.md, «Быстрый старт»
pnpm dev
```

`.npmrc` содержит `ignore-scripts=true`: postinstall-скрипты зависимостей не выполняются. Не меняйте это без причины.

## Порядок работы

1. Создайте ветку от свежего `main`.
2. Внесите изменение. Одна ветка — одна задача.
3. Прогоните [проверку перед push](#проверка-перед-push).
4. Обновите документацию, если поменялось поведение, env, маршрут, таблица или команда.
5. Сделайте push и откройте Pull Request в `main`.
6. Vercel собирает Preview-деплой для PR. Проверьте на нём сценарий, который меняли.
7. Merge — только после зелёной сборки Vercel. Merge в `main` = деплой в production.

## Ветки

| Префикс | Назначение | Пример |
|---|---|---|
| `feat/` | новая функция | `feat/booking-cancel-link` |
| `fix/` | исправление ошибки | `fix/superadmin-actions-auth` |
| `docs/` | только документация | `docs/telegram-setup` |
| `refactor/` | переработка без изменения поведения | `refactor/notify-module` |
| `chore/` | зависимости, конфиги, скрипты | `chore/eslint-config` |
| `db/` | новая миграция | `db/0006-booking-indexes` |

Имена веток — латиница, цифры и дефис (ТЗ §0.1).

## Коммиты

Формат — [Conventional Commits 1.0](https://www.conventionalcommits.org/ru/v1.0.0/):

```
<тип>(<область>): <что сделано>

<зачем, если неочевидно>
```

| Тип | Когда | Попадает в CHANGELOG |
|---|---|---|
| `feat` | новая функция для пользователя | «Добавлено» |
| `fix` | исправление ошибки | «Исправлено» |
| `perf` | ускорение без изменения поведения | «Изменено» |
| `refactor` | переработка кода | нет |
| `docs` | документация | нет |
| `chore` | зависимости, конфиги | нет, кроме обновления зависимостей с влиянием на поведение |
| `db` | миграция | «Изменено» или «Добавлено» |
| `test` | проверки, smoke-test | нет |

Области (`scope`) — по разделам проекта:

| Область | Код |
|---|---|
| `booking` | `app/api/bookings/**`, `BookingForm.tsx`, `lib/slots.ts`, `lib/availability.ts` |
| `site` | `app/[prefix]/[slug]/page.tsx`, `components/**`, `public/assets/**` |
| `owner` | `app/[prefix]/[slug]/panel/**` |
| `admin` | `app/panel/**` |
| `cron` | `app/api/cron/**`, `vercel.json` |
| `email` | `lib/notify.ts`, `lib/outreach.ts`, `email-accounts`, `inbox` |
| `telegram` | `app/api/telegram/**`, `lib/admin-notify.ts` |
| `license` | `app/api/license/**`, `lib/license-client.ts`, `app/api/transfer/**` |
| `domain` | `middleware.ts`, `app/domain-site/**`, `app/api/resolve-domain/**` |
| `db` | `supabase/migrations/**`, `lib/database.types.ts` |
| `import` | `lib/import2gis.ts`, `scripts/import-excel.ts`, `app/api/import/**` |

Примеры:

```
feat(booking): ссылка на отмену в письме подтверждения
fix(admin): проверка isSuperAdmin в server actions клиентов
db: 0006 индекс bookings(business_id, status)
docs: инструкция по настройке DMARC
```

Правила:

- Заголовок — до 72 символов, в повелительном или номинативном виде, без точки в конце.
- Язык описания — русский; имена файлов, функций, таблиц — как в коде.
- Ломающее изменение (новая обязательная env, изменение схемы с потерей данных, смена URL) — `!` после типа
  и строка `BREAKING CHANGE:` в теле с инструкцией, что сделать при деплое.

```
feat(domain)!: основной домен из NEXT_PUBLIC_SITE_URL

BREAKING CHANGE: MAIN_HOSTS больше не захардкожен; перед деплоем проверьте NEXT_PUBLIC_SITE_URL в Vercel.
```

## Стиль кода

### Общее

| Правило | Как в проекте |
|---|---|
| Язык | TypeScript, `strict: true` (`tsconfig.json`) |
| Импорты внутри проекта | через алиас `@/` (`@/lib/supabase`), не `../../..` |
| Кавычки и точка с запятой | одинарные кавычки, `;` в конце строки |
| Отступ | 2 пробела |
| Кодировка, переносы | UTF-8, LF в git |
| Имена файлов | латиница: компоненты `PascalCase.tsx`, модули `lib/kebab-case.ts`, маршруты — по App Router |
| Первая строка файла | комментарий `// путь/к/файлу — назначение (ТЗ §N)` |
| Комментарии | на русском, коротко: зачем, а не что; ссылка на раздел ТЗ, если правило оттуда |
| Секреты | только `process.env.*`, никаких значений в коде |

Форматтер и ESLint в проекте не настроены (`pnpm lint` задаёт интерактивный вопрос). До их появления
следуйте стилю соседнего файла.

### Серверный и клиентский код

- По умолчанию — Server Components. `'use client'` — только там, где нужен state или браузерный API
  (формы с `useState`, загрузка фото, карта).
- Доступ к БД — только на сервере, через `adminClient()` из `lib/supabase.ts`. Ключ `service_role` не должен
  попадать в клиентский бандл: не импортируйте `lib/supabase.ts` из файлов с `'use client'`.
- Тяжёлые клиентские библиотеки (Leaflet, `browser-image-compression`) — через `next/dynamic` с `ssr: false`
  (пример: `components/MapLazy.tsx`, `photos/PhotoUploaderLazy.tsx`).

### Права доступа

Каждая точка входа проверяет права сама, не полагаясь на layout:

| Где | Проверка |
|---|---|
| server action кабинета | `const access = await currentOwner(slug); if (!access) return;` + `role === 'owner'` для настроек, подписки, команды |
| server action супер-админки | `if (!(await isSuperAdmin())) return;` |
| route handler супер-админки | `isSuperAdmin()`, иначе 401 |
| cron | `isCronAuthorized(req)`, иначе 401 |
| публичный POST | `hitRateLimit(...)` + zod-схема |

Server actions вызываются прямым POST-запросом, поэтому проверка в layout их не защищает.

### Валидация и ошибки

- Вход от пользователя — через zod (`z.object(...).safeParse`). Пример: `app/api/bookings/route.ts`.
- `id` из формы — проверка формата uuid перед запросом в БД.
- Ошибки внешних сервисов (SMTP, Telegram, Vercel API) не должны ронять запрос: `.catch(() => false)` и запись
  через `logError()` из `lib/log.ts` в `audit_log`.
- Действия оператора и владельца, которые меняют данные, — `audit(action, entity, id, payload)` из `lib/audit.ts`.
- Публичный API отвечает `{ ok: false, reason: '<код>' }` с HTTP-кодом; тексты для пользователя — на клиенте.

### Даты и время

- В БД — `timestamptz` в UTC. Отображение — `toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })`.
- Расчёт слотов — только через `lib/slots.ts` (смещение бизнеса UTC+3).

### UI

- Tailwind без shadcn/ui; общие классы панелей — в `app/globals.css` (`.panel-shell`, `.btn-primary`, `.input`).
- Сайт бизнеса — `components/templates/StudioTemplate.tsx` и `public/assets/studio.css`.
- Иконки — inline SVG или `@phosphor-icons/react`; новые иконочные библиотеки не добавлять.
- Тексты интерфейса — на русском. Требования к дизайну панелей — [docs/design-spec.md](docs/design-spec.md).

## Где что менять

| Задача | Файлы |
|---|---|
| Новая страница кабинета | `app/[prefix]/[slug]/panel/(protected)/<раздел>/page.tsx` + пункт в массиве `nav` в `(protected)/layout.tsx` |
| Новый раздел супер-админки | `app/panel/(protected)/<раздел>/page.tsx` + пункт в массиве `NAV` в `app/panel/(protected)/layout.tsx` |
| Новая cron-задача | обработчик в объекте `JOBS` в `app/api/cron/[job]/route.ts` + расписание в `vercel.json` или во внешнем планировщике |
| Новое уведомление | `lib/notify.ts` (бизнесу, клиенту) или `lib/admin-notify.ts` (оператору) |
| Новая ниша | строка в `vertical_templates` через `/panel/verticals` или новую миграцию; префикс уникален |
| Новая переменная окружения | код + `.env.example` + таблица в [DEPLOY.md](DEPLOY.md#шаг-4-переменные-окружения) |
| Тексты сайта по умолчанию | `default_texts` ниши, словарь в `StudioTemplate.tsx` |

## Миграции БД

1. Новый файл — следующий номер: `supabase/migrations/0006_<кратко>.sql`. Старые миграции не редактируются.
2. Миграция идемпотентна: `create table if not exists`, `add column if not exists`, `create index if not exists`,
   `insert ... on conflict do nothing`. Повторный запуск не должен падать.
3. На каждой новой таблице — `alter table ... enable row level security;` и политики (или явный комментарий,
   что доступ только через `service_role`).
4. Обновите `lib/database.types.ts` — типы пишутся вручную.
5. Проверьте на локальном PostgreSQL или в отдельном проекте Supabase: запуск дважды подряд без ошибок.
6. Опишите миграцию в PR и в [CHANGELOG.md](CHANGELOG.md); порядок применения — в [DEPLOY.md](DEPLOY.md).
7. Миграция применяется в Supabase SQL Editor **до** merge кода, который её использует.

## Переменные окружения

- Источник истины — `.env.example`. Каждая переменная — с комментарием: что это и где взять.
- `NEXT_PUBLIC_*` попадают в браузер. Секреты так называть нельзя.
- Новая обязательная переменная — `BREAKING CHANGE` в коммите и шаг в DEPLOY.md.
- После добавления в Vercel нужен повторный деплой: переменные читаются при сборке и старте.

## Проверка перед push

```bash
pnpm typecheck                                   # обязательно, exit 0
pnpm build                                       # обязательно, exit 0
bash scripts/smoke-test.sh http://localhost:3000 # после pnpm start, если менялись маршруты, middleware, SEO
```

На Windows — `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` (install + typecheck + build, лог
в `check-log.txt`, файл в `.gitignore`).

Для `pnpm build` без реального Supabase подойдут фиктивные значения env — см. [TESTING.md](TESTING.md#типы-и-сборка).

Чек-лист Pull Request:

- [ ] `pnpm typecheck` и `pnpm build` проходят.
- [ ] Новые server actions и route handlers проверяют права сами.
- [ ] Пользовательский ввод проходит через zod или явную проверку формата.
- [ ] Нет секретов, `.env.local`, выгрузок 2GIS и дампов в коммите.
- [ ] Миграция идемпотентна, `database.types.ts` обновлён.
- [ ] Обновлены README / ARCHITECTURE / DEPLOY / CHANGELOG, если изменилось поведение.
- [ ] Ручной сценарий из [TESTING.md](TESTING.md#ручные-сценарии-по-разделам) пройден на Preview-деплое.

## Документация

| Изменилось | Обновить |
|---|---|
| маршрут, API, таблица, модуль `lib` | [ARCHITECTURE.md](ARCHITECTURE.md) |
| env, шаг деплоя, cron | [DEPLOY.md](DEPLOY.md), `.env.example` |
| команда в `package.json` | [README.md](README.md), [TESTING.md](TESTING.md) |
| поведение для клиента, цены | [KP.md](KP.md), [DEMO.md](DEMO.md), [docs/faq.md](docs/faq.md) |
| принятое решение или отклонение от ТЗ | [DECISIONS.md](DECISIONS.md) |
| релиз | [CHANGELOG.md](CHANGELOG.md), `version` в `package.json` |

## Чего не делать

- Не коммитить `.env.local`, ключи, пароли, `scripts/import/*.xlsx`, дампы БД.
- Не использовать `SUPABASE_SERVICE_ROLE_KEY` в клиентском коде и в `NEXT_PUBLIC_*`.
- Не хранить состояние в памяти процесса (Map, глобальные переменные) — serverless-инстансы её не делят.
  Лимиты, очереди и счётчики — в Postgres.
- Не добавлять платные API (Google Maps, Stripe, Twilio, Resend) и неофициальные WhatsApp-библиотеки (ТЗ §0.4).
- Не добавлять кириллицу в имена файлов и папок.
- Не править применённые миграции — только новая миграция.
- Не делать `git push --force` в `main`.
