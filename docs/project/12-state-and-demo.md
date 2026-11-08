# Том 12. Фактическое состояние, demo-кабинеты, инфраструктурные нюансы, расхождения

Источники: `PROGRESS.md`, `DECISIONS.md`, `CHANGELOG.md`, `README.md`, `TESTING.md`, `общие/lib/demo.ts`, `demo-constants.ts`, `app/api/demo/*`, журнал работ проекта и проверки, выполненные при составлении документа.

## 1. Состояние по `PROGRESS.md` (обновлено 30.10.2026)

| Область | Статус |
|---|---|
| БД (миграции 0001–0014) | Готово, проверено на PostgreSQL 17, идемпотентно |
| Публичный сайт и запись | Готово |
| Кабинет владельца | Готово |
| Супер-админка | Готово; server actions сами проверяют `isSuperAdmin` |
| Рассылка и входящие | Готово; частые cron — только через внешний планировщик |
| Telegram | Готово (один бот, привязка по коду `BIZ-…` с TTL 15 мин) |
| Лицензии и передача кода | Готово: один `.txt` без ZIP и исходников |
| Документация | Готово |
| Автотесты | На 30.10: 1296 passed / 85 файлов; на 08.11: 1501 passed / 99 файлов; на 09.11: 1409 passed / 97 файлов + 1 skipped |

**Закрытые релиз-блокеры (№4–№30):** №6 (`guarded` → `requireSuperAdmin` на всех server actions), №22 (выбор тарифа при оплате), №23 (неоплаченный сайт скрыт), №24 (ссылки отмены/переноса в письме клиенту), №26 (transactional-письма не тратят лимит рассылки), №29 (rate limit читает settings), №4 (`NEXT_PUBLIC_MAIN_HOSTS` оверрайд), №8 (убраны 8 неиспользуемых env), №12 (`MIGRATION_FILES` до 0014), №30 (двухуровневая защита cleanup-prototypes), №27 (ложная тревога — алерты идут ботом оператора), №28 (экранирование HTML), №7 (TTL BIZ-кода 15 мин).

**Частично:** cron — задачи написаны, но частые не в `vercel.json` (лимит Hobby), нужен внешний планировщик.

**Не сделано (по `PROGRESS.md`, проверено 30.10.2026):**

| Что | Комментарий | Блокирует релиз |
|---|---|---|
| Single-tenant сборка (`SINGLE_TENANT`, `build-single-tenant.ts`) | `SINGLE_TENANT=true` — плейсхолдер в генерируемом `.env.example`; отдельной сборки нет | Нет |
| Пауза 45 с + 3 повтора между письмами | Нет `sleep`/`setTimeout`; retry на уровне очереди (`next_retry_at`) | Нет |
| Отдельный service worker на каждый сайт | Один глобальный `app/sw.js/route.ts` | Нет |
| Миграция на VPS / Docker / российский хостинг | Абстракции `*_PROVIDER` не реализованы | Нет |
| Сброс пароля владельцем | Через Supabase Dashboard | Нет |
| ESLint | `pnpm lint` спрашивает конфиг, выходит с кодом 1 | Нет |
| Юридические вопросы (ФЗ-152, холодная рассылка) | Риск принят владельцем | Нет |

## 2. Demo-кабинеты (коммиты `6bd7260`, `5aab7c4`)

Цель: не статичные макеты, а **настоящие** кабинеты с реальными данными и рабочими server actions, у которых «demo» присутствует только в названии аккаунта.

### Файлы
- `общие/lib/demo-constants.ts` — константы, импортобезопасные для клиента:
  `DEMO_PARTNER_EMAIL = demo-partner@zapishisya.ru`, `DEMO_PARTNER_NAME = DEMO Партнёр`, `DEMO_PARTNER_REF = PR-DEMO01`, `DEMO_OWNER_EMAIL = demo-owner@zapishisya.ru`, `DEMO_PASSWORD = demo12345`, `DEMO_PREFIX = m`, `DEMO_SLUG = demo`, `DEMO_BUSINESS_NAME = DEMO — Студия маникюра «Любава»`; функции `isDemoPartner(email)`, `isDemoBusiness(slug)`.
- `общие/lib/demo.ts` — серверная часть (только сервер: `crypto` + service_role): `ensureDemoPartner()`, `ensureDemoBusiness()`, идемпотентно создаёт данные при первом входе.
- `app/api/demo/partner/route.ts` (GET) — `ensureDemoPartner()` → `createPartnerSession()` → cookie `partner_session` → редирект `/partner`; при ошибке — `/partner/demo?error=…`.
- `app/api/demo/owner/route.ts` (GET) — `ensureDemoBusiness()` → `passwordSignIn(DEMO_OWNER_EMAIL, DEMO_PASSWORD)` → `startSession('owner', …)` → редирект `/m/demo/panel`; при ошибке — `/demo/business?error=…`.
- `app/demo/page.tsx` — лаунчер в оболочке настоящей панели (сайдбар, шапка, 2 карточки).
- `app/demo/business/page.tsx` → `redirect('/api/demo/owner')`; `app/partner/demo/page.tsx` → `redirect('/api/demo/partner')`.
- `app/partner/page.tsx` передаёт `demo={isDemoPartner(partner.email)}` в `PartnerShell`; в сайдбаре заголовок «Кабинет партнёра — DEMO».

### Что создаётся в БД

**Демо-партнёр:** строка `partners` (scrypt-хеш пароля, рефкод `PR-DEMO01`), 3 лида (`contacted` / `new` / `converted`), 3 счёта (`subscription_5000` paid, `code_5000` paid, `custom` 20 000 ₽ awaiting_payment), 2 начисления `accrued` по оплаченным счетам.

**Демо-бизнес `m/demo`:** `vertical_templates.url_prefix = 'm'`, `status = 'client'`, `plan = basic`, `subscription_active = true`, `subscription_until = 2030-01-01`, контакты, график работы, `brand_color = #d977a6`, рейтинг 4.9 / 127 отзывов; 5 услуг (Классический маникюр 1500/60, Гель-лак 2000/90, Наращивание 3500/150, Дизайн ногтей 500/15, Педикюр 2500/60), 2 фото (`/media/covers/beauty.svg`, `detailing.svg`), 4 брони (`new`, `confirmed`, `done`, `cancelled`). Плюс пользователь Supabase Auth `demo-owner@zapishisya.ru` и строка `admin_users` с ролью `owner`.

Все действия в демо-кабинетах настоящие: лиды, счета, услуги, брони, фото, настройки сохраняются в БД демо-аккаунтов; реальные бизнесы и партнёры не затрагиваются.

`isDemoBusiness` после коммита `5aab7c4` определена в `demo-constants.ts`, но ни одним файлом не вызывается — визуальных бейджей нет, «DEMO» содержится только в названии бизнеса.

**Прод отстаёт от master (проверено 09.11.2026):** на `www.zapishisya.ru` `/demo`, `/m/demo`, `/api/demo/partner` отдают 404, а `/` и `/d/glowdetailing` отдают 200 — задеплоенная на Vercel (проект `servis`, `.vercel/project.json`) версия не содержит последних коммитов с demo-кабинетами. Демо-кабинеты есть в коде, но не в текущем прод-деплое.

## 3. Инфраструктурные нюансы, выявленные и исправленные в ноябре 2026

Эти сведения важны для того, кто будет эксплуатировать проект: они объясняют текущие значения конфигов и известные симптомы.

| Проблема | Причина | Что сделано |
|---|---|---|
| `42703: column "ready_site_id" does not exist` при накате 0017 | Таблицы партнёрки уже существовали в проде, `CREATE TABLE IF NOT EXISTS` пропустил их | В 0017 добавлен идемпотентный блок `alter table … add column if not exists` для всех не-PK колонок; исправлена опечатка `timestamptimptz` → `timestamptz` |
| `42501: permission denied to set parameter "app.site_url"` | `ALTER DATABASE … SET app.*` требует суперпользователя, на Supabase недоступно | `configure-cron.sql` и `DEPLOY.md` переведены на `vault.create_secret`; `cron_setting()` умеет читать Vault |
| `42703: column "jobname" does not exist` | Проверочный запрос выбирал `jobname` из `cron.job_run_details` | Запрос через `JOIN cron.job j ON j.jobid = r.jobid` |
| `NEXT_OUTPUT_DIR_MISSING` на Vercel | `NEXT_DIST_DIR=.next-prod` в env отправлял сборку не в `.next` | `distDir: process.env.VERCEL ? '.next' : (NEXT_DIST_DIR || '.next')` |
| `TypeError: Request cannot be constructed from a URL that includes credentials: postgresql://…:6543/postgres/rest/v1/businesses` | В Vercel `NEXT_PUBLIC_SUPABASE_URL` (или `SUPABASE_POOLER_URL`) был Postgres connection string вместо REST-URL; supabase-js добавил `/rest/v1/...` и `fetch` отказал | `poolerUrl()` в `общие/lib/supabase.ts` (и корневой копии) отклоняет не-http(s) URL с понятной ошибкой; в Vercel нужно `https://oryzoexstuzgpbqvpjbr.supabase.co`, `SUPABASE_POOLER_URL` оставить пустым |
| Белый экран / бесконечная загрузка на кастомном домене | Service worker ждал `await cache.put(res.clone())` до возврата ответа | `sw-source.ts`: ответ отдаётся сразу, кэш пишется в фоне через `e.waitUntil`, сетевой таймаут 4 с, `SW_CACHE` → `booking-shell-v3` |
| `net::ERR_CONNECTION_CLOSED` / `ERR_HTTP2_PING_FAILED` на `www.zapishisya.ru` при рабочем `*.vercel.app` | Ответы с конкретных anycast-IP Vercel (`216.198.79.1/.65`, `76.76.21.22`, `66.33.60.129`) обрывались на ~20 КБ; PoP `arn1` против рабочего `fra1` | DNS на reg.ru переведён на `A @ 76.76.21.21`, `A www 76.76.21.21`; через этот IP HTML 59 КБ, чанки 172 КБ / 123 КБ, CSS 50 КБ / 80 КБ приходят целиком; `/api/health` → 200 `db: ok` |

**На машине разработчика:** DNS-резолвер `172.19.0.2` может держать старые A-записи; `ipconfig /flushdns` очищает только кэш Windows. Временное решение — строка `76.76.21.21 www.zapishisya.ru` в `C:\Windows\System32\drivers\etc\hosts` (важно, чтобы старые строки `216.198.79.65 www.zapishisya.ru` были удалены: в Windows hosts побеждает первое совпадение). После обновления DNS провайдера строку из hosts нужно убрать.

**Безопасность:** пароль БД Supabase светился в логах Vercel в ноябре 2026 — требуется ротация в Supabase Dashboard → Settings → Database. Ротация пароля БД не меняет anon/service_role JWT-ключи.

## 4. Расхождения в существующей документации (факты, а не ошибки этого документа)

| Где | Утверждение | Факт |
|---|---|---|
| `TESTING.md`, первая строка | «Автотестов (unit, e2e) в проекте нет» | 155 файлов `*.test.ts` + 14 `*.test.mts`, 23 `*.spec.ts`; `vitest run` → до 1501 passed |
| `PROGRESS.md` (30.10.2026) | 1296 passed / 85 файлов, миграции 0001–0014 | 1501 / 99 (08.11); миграций 20 (до 0020) |
| `README.md`, таблица стека | Node `engines.node` 24.x; в быстром старте «Node 20+, Vercel 24.x» | `package.json → engines.node: "22.x"` |
| `README.md`, быстрый старт | «выполните миграции 0001…0005» | 20 SQL-файлов; полный набор накатывался на прод |
| `README.md` | 11 ниш и префиксы `t,d,m,sa,b,av,p,r,c,st,v` | Подтверждено `0003_seed.sql` |
| `ARCHITECTURE.md` / `DECISIONS.md` | Описание ветки `main`, обновлено 16.10.2026 | Рабочая ветка `master`, репозиторий `KazymaAP/saas-booking` |
| `CHANGELOG.md` | `[Unreleased]` после коммита от 13.10.2026 | Множество более поздних коммитов (см. том 11) |
| `INSTALL.md` | Single-tenant сборки нет | Подтверждено `PROGRESS.md` |
| `docs/faq.md`, `docs/troubleshooting.md` | Ссылки на «MAIN_HOSTS в lib/site.ts, правка кода» | `NEXT_PUBLIC_MAIN_HOSTS` позволяет менять список через env (`PROGRESS.md`, №4) |
| `главная/SuperAdmin.tsx`, `PREVIEW_TABS` | Подписи «Демо-макет … Данные не сохраняются» для `/partner/demo` и `/admin/preview/tenant` | `/partner/demo` теперь редиректит в рабочий кабинет с БД; текст подписи в студии остался прежним |
| `служебное/docs/PROJECT_FILES_CATALOG.md` | Каталог от 30.10.2026, ~577 файлов | Позже добавлены demo-модули, роуты, правки SW |

## 5. Известные особенности кодовой базы

- Два дерева библиотек: рабочее `общие/lib/` (алиас `@/lib`) и дублирующее `lib/`. Правки нужно вносить в `общие/lib/` (том 03).
- Два конфига Vitest (`vitest.config.ts` и `vitest.config.mts`), два Playwright (`playwright.config.ts` и `.mts`), дубли документации в `служебное/docs/`, дубли тестов в `служебное/tests/`, дубли скриптов в `служебное/scripts/`.
- Часть `/admin` (SuperAdmin.tsx, 4688 строк) — клиентский компонент с собственными data-actions, частично использующий `fake-db.ts` и demо-режим localStorage; старая `/panel/*` — серверные страницы с `guarded`-actions. Обе панели сосуществуют.
- `/partner/demo` и `/admin/preview/tenant` historically были статичными предпросмотрами; первый теперь рабочий редирект, второй остаётся интерактивным предпросмотром (`TenantPreview.tsx`).
- `TESTING.md` описывает ручные сценарии и smoke-test, но не отражает текущий объём автотестов.
- Прямой порт 5432 Supabase из песочницы недоступен, миграции накатываются через Management API (`scripts/apply-migrations-api.cjs`).
- Платформенные фичи приоритетны над углублённой CRM арендатора (зона ответственности — работоспособность платформы).
