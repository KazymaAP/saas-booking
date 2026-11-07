# Аудит проекта: чек-лист «сделано / не сделано / доработать»

Дата: 2026-10-31. Версия: `0.1.0`. Ветка: `master`.
Методика: прочитаны все документы в `служебное/docs/` и `README.md`; факты сверены с кодом (`app/`, `общие/`, `главная/`, `шаблоны/`, `телеграмм-бот/`, `связь/`, `supabase/`), запущены `tsc`, `tsc -p tsconfig.strict.json`, `vitest`, `next lint`, `next build`.

Ограничения аудита: нет доступа к Vercel/Supabase (нельзя проверить живой деплой и применённые миграции); `next build` в песочнице падает на `EPERM` при записи `.next` — это ограничение окружения, а не вывод о коде.

---

## 1. Итоговая сводка

| Область | Статус | Оценка |
|---|---|---|
| БД и миграции (0001–0016) | Готово | 16 миграций, идемпотентны |
| Публичный сайт и запись | Готово | StudioTemplate + детейлинг 1:1 |
| Кабинет владельца | Готово | все разделы, роли owner/manager |
| Супер-админка | Готово | `requireSuperAdmin` в actions |
| Рассылка, IMAP, трекинг | Готово | List-Unsubscribe есть |
| Telegram | Готово | один бот, экранирование HTML |
| Лицензии и передача кода | Готово | кроме single-tenant сборки |
| Cron | Готово | 2 в `vercel.json` + pg_cron/внешний планировщик |
| Архитектура `общие/` + блоки | Частично | общий код вынесен, админ/бот вынесены частично |
| Автотесты | Частично | 1313 passed, 4 падения (не связаны с переносом) |
| Строгая типизация | Не готово | `tsc -p tsconfig.strict.json` — 5 ошибок |
| ESLint | Не сделано | конфига нет, `next lint` спрашивает настройку |
| Документация | Частично | много расхождений с кодом |
| Деплой | Блокер | 3 ключа Supabase не заданы в Vercel |

---

## 2. Сделано полностью

- [x] **Миграции 0001–0016**: 21 таблица, RLS, индексы, партиции, pg_cron, retention, аналитика, rate limit, data_requests, партиционирование bookings, демо-тенант GlowDetailing, удаление `ai_assistant`.
- [x] **Публичный сайт** `/{prefix}/{slug}`: услуги, фото, карта (Leaflet lazy), JSON-LD, PWA-манифест, sitemap/robots, 308 со старого slug.
- [x] **Онлайн-запись**: слоты на лету, защита от двойной брони, rate limit, zod, согласие на ПД, уведомления владельцу (email + Telegram).
- [x] **Отмена/перенос по токену**: страницы и короткие ссылки `/booking/...`; ссылки отправляются клиенту (`notifyClientBooking`, `cancelUrl`/`rescheduleUrl`).
- [x] **Кабинет владельца**: брони, услуги, фото (сжатие), тексты, Telegram по коду `BIZ-…`, данные/CSV, настройки, подписка, команда; роли owner/manager.
- [x] **Супер-админка**: воронка, бизнесы, импорт 2GIS, карточка, домен/SSL, входящие, клиенты, лицензии, ящики, шаблоны, ниши, статистика, логи, настройки, бэкап.
- [x] **Права**: `requireSuperAdmin()` в `app/panel/(protected)/actions.ts`; `currentOwner(slug)` в кабинете; cron по `CRON_SECRET`; rate limit.
- [x] **Рассылка**: очередь, ротация ящиков, дневной лимит, трекинг открытий/кликов, `List-Unsubscribe` + `/unsubscribe/[token]` + `/api/unsubscribe/[token]`.
- [x] **Telegram**: единый webhook, `/start BIZ-…`, команды оператора, `escapeTelegramHtml`.
- [x] **Лицензии**: `/api/license/ping`, `revoke`, `/blocked`, передача `.txt`/ZIP с `support_until`.
- [x] **Cron**: 13 маршрутов + `[job]`, `warmup`; `cleanup-prototypes` защищает бывших клиентов (два уровня).
- [x] **Healthcheck**: `/api/health` (200/503, таймаут БД 150 мс).
- [x] **Безопасность**: security headers, RLS, AES-256-GCM для SMTP, noindex превью, open-redirect защита.
- [x] **Бэкап**: GitHub Actions `pg_dump` + JSON-копия 7 таблиц в Storage.
- [x] **Архитектура**: общий код в `общие/` (lib 175, components 13, types 1), шаблон детейлинга в `шаблоны/detailing/`, бот в `телеграмм-бот/`, реестр в `связь/registry.ts`.
- [x] **Единый `.env`** в корне (61 ключ), `.env.local` удалён.
- [x] **Тесты**: 113 файлов, `vitest` — 1313 passed / 7 skipped; `middleware.test.ts` 21/21.
- [x] **`tsc --noEmit`** — exit 0.

---

## 3. Сделано частично (нужна доработка)

- [ ] **Single-tenant сборка**: `SINGLE_TENANT=true` — только плейсхолдер в `общие/lib/transfer.ts`; скрипта `build-single-tenant.ts` нет. `INSTALL.md` описывает ручной путь.
- [ ] **Частые cron**: в `vercel.json` только 2 задачи (`backup`, `cleanup-audit-log`); `send-emails`, `check-replies`, `booking-reminders`, `unconfirmed-reminder` — внешний планировщик (или pg_cron).
- [ ] **PWA**: один глобальный `/sw.js`, а не service worker на каждый сайт.
- [ ] **Сброс пароля владельца**: только через Supabase Dashboard, UI нет.
- [ ] **ESLint**: конфига нет, `pnpm lint` задаёт вопрос и выходит с кодом 1.
- [ ] **Строгая типизация**: `tsc -p tsconfig.strict.json` — 5 ошибок (`общие/lib/license-client.ts` 210–214, `общие/lib/rate-limit.ts` 84/87).
- [ ] **Тесты**: 4 падения — `общие/lib/supabase.test.ts` (3: тест ждёт `:6543`, код намеренно не добавляет порт) и `app/api/cron/[job]/route.test.ts` (`warmup` не входит в `isJobName`).
- [ ] **`warmup`**: маршрут `app/api/cron/warmup/route.ts` есть, но в реестре `общие/lib/schedules.ts` его нет → тест падает.
- [ ] **Архитектура**: `главная/` содержит `components` + `lib`, но `page.tsx`/`layout.tsx`/`actions.ts` админки остаются в `app/panel/**` (требование Next). `телеграмм-бот/` содержит `telegram*.ts`, но webhook-route остаётся в `app/api/telegram/webhook`. `связь/` — только `registry.ts`, без UI/управления ботом.
- [ ] **Шаблоны**: реально вынесен только `detailing/`; остальные 10 ниш остаются на `StudioTemplate`.
- [ ] **`dist/`**: старый артефакт сборки лежит в корне (не влияет на работу, но засоряет).
- [ ] **Документация**: расхождения с кодом (раздел 7) — править.

---

## 4. Не сделано (главное)

| # | Что | Приоритет | Блокирует релиз |
|---|---|---|---|
| 1 | **3 ключа Supabase в Vercel `servis`** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — проект `oryzoexstuzgpbqvpjbr` | P0 | **Да** |
| 2 | Single-tenant сборка `build-single-tenant.ts` (ТЗ §14.5) | P2 | Нет |
| 3 | Пауза 45 с + 3 повтора между письмами (ТЗ §9.1) | P2 | Нет |
| 4 | Service worker на каждый сайт (ТЗ §5.1) | P2 | Нет |
| 5 | Миграция на VPS/Docker/российский хостинг (ТЗ §22) | P3 | Нет |
| 6 | Сброс пароля владельца в UI | P2 | Нет |
| 7 | ESLint-конфиг | P2 | Нет |
| 8 | Юридическое заключение ФЗ-152 и холодная рассылка | P1 | Нет (риск принят) |
| 9 | 5 ошибок strict-typecheck | P1 | Нет |
| 10 | 4 падающих теста (supabase pooler, cron warmup) | P1 | Нет |
| 11 | Документация приведена в соответствие с кодом | P1 | Нет |
| 12 | `pnpm build` не подтверждён в песочнице (EPERM); нужен прогон на машине/CI | P1 | Нет |
| 13 | `dist/` и `tsconfig.tsbuildinfo` (последний удалён) — артефакты | P3 | Нет |
| 14 | `PROJECT_FILES_CATALOG.md` — снимок до рефакторинга, устарел | P3 | Нет |
| 15 | `связь/` — только реестр, нет панели управления шаблонами/ботом | P2 | Нет |
| 16 | `главная/` и `телеграмм-бот/` — вынесена только часть кода (route-файлы в `app/`) | P2 | Нет |

---

## 5. Что можно дописать / доработать

### Код
- [ ] Исправить 5 ошибок strict-typecheck (`license-client.ts`, `rate-limit.ts`).
- [ ] Починить `supabase.test.ts` под фактическое поведение `poolerUrl` (или вернуть `:6543`, если это требование).
- [ ] Добавить `warmup` в `schedules.ts` (или убрать из теста) — сейчас тест красный.
- [ ] Добавить ESLint-конфиг (`next lint` без вопросов).
- [ ] Реализовать `build-single-tenant.ts` и `SINGLE_TENANT`.
- [ ] Добавить паузу/ретраи в отправку писем.
- [ ] Сделать per-site service worker.
- [ ] Добавить UI сброса пароля владельца.
- [ ] Добавить `связь/` UI: список шаблонов, их env, управление ботом.
- [ ] Добавить `template.json` для остальных 10 ниш и валидацию манифестов.
- [ ] Вынести `actions.ts`/`schema.ts` админки в `главная/` (route-файлы оставить в `app/`).
- [ ] Вынести webhook-логику бота в `телеграмм-бот/` (route оставить тонким).
- [ ] Добавить проверку пустых обязательных env при старте (сейчас `checkEnv` есть, но `.env` содержит пустые ключи).
- [ ] Удалить `dist/` и настроить `NEXT_DIST_DIR` вне корня.

### Документация
- [ ] Привести `README.md`, `PROGRESS.md`, `TESTING.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `CHANGELOG.md`, `DEPLOY.md`, `INSTALL.md`, `CONTRIBUTING.md`, `FAQ`, `troubleshooting`, `email-setup`, `DEMO`, `detailing-*`, `design-spec` к факту (раздел 7).
- [ ] Обновить `PROJECT_FILES_CATALOG.md` или удалить как устаревший снимок.
- [ ] Исправить битые ссылки в `README` (`PROGRESS.md#...`, `DEPLOY.md#...`) и в `служебное/docs` (`../README.md`, `../PROGRESS.md`, `docs/...`).

---

## 6. Оптимизация

- [ ] Удалить `dist/` (566 файлов) и не держать артефакты в корне.
- [ ] `NEXT_DIST_DIR` вне проекта для сборки в песочнице.
- [ ] Убрать неиспользуемый `pino` из зависимостей (в коде не используется; в `serverComponentsExternalPackages` его нет).
- [ ] Проверить bundle: `optimizePackageImports` уже включён для phosphor/leaflet.
- [ ] Использовать существующие индексы 0005 и партиции 0014 (уже в миграциях).
- [ ] Перевести частые cron в pg_cron (0008 уже есть) вместо внешнего планировщика, если тариф позволяет.
- [ ] Добавить unit-тесты для чистых функций (`slots`, `phone`, `import2gis`, `slug`) — сейчас покрытие частичное.
- [ ] Добавить E2E Playwright в CI.
- [ ] Добавить `loading.tsx`/`error.tsx` там, где их нет (частично есть).
- [ ] Кэширование: `revalidate=3600` на сайте, `staleTimes` уже настроены.

---

## 7. Расхождения документации с кодом (править)

| Документ | Написано | Факт |
|---|---|---|
| `README.md` | Node `24.x` | `engines.node = 22.x` |
| `README.md` | миграции `0001…0005` | 16 миграций `0001–0016` |
| `README.md` | «ссылка на отмену/перенос не отправляется» | отправляется (`notifyClientBooking`, `cancelUrl`/`rescheduleUrl`) |
| `README.md` | «server actions не проверяют isSuperAdmin» | `requireSuperAdmin` в `app/panel/(protected)/actions.ts` |
| `README.md` | «cleanup-prototypes удаляет бывших клиентов» | защита двухуровневая, бывшие клиенты не удаляются |
| `README.md` | ссылки `[PROGRESS.md](PROGRESS.md#...)`, `[DEPLOY.md](DEPLOY.md#...)` | файлы в `служебное/docs/` — ссылки битые |
| `PROGRESS.md` | миграции `0001–0014` | 16 (`0001–0016`) |
| `PROGRESS.md` | тесты 1296 / 85 файлов | 1313 passed / 87 файлов, 4 падения |
| `PROGRESS.md` | `0005_indexes.sql` «не закоммичено» | файл в репозитории |
| `PROGRESS.md` | `INSTALL.md` нет | файл есть |
| `TESTING.md` | «Автотестов нет» | 113 тестовых файлов, vitest работает |
| `TESTING.md` | `/api/health` — WARN, «эндпоинта нет» | `app/api/health/route.ts` есть |
| `ARCHITECTURE.md` | миграции `0001–0005` | `0001–0016` |
| `ARCHITECTURE.md` | 10 cron в `vercel.json` | 2 (`backup`, `cleanup-audit-log`) |
| `ARCHITECTURE.md` | `/api/health` нет | есть |
| `ARCHITECTURE.md` | server actions без `isSuperAdmin` | `requireSuperAdmin` используется |
| `ARCHITECTURE.md` | `cleanup-prototypes` удаляет бывших клиентов | защищено |
| `ARCHITECTURE.md` | ветка `main` | `master` |
| `DECISIONS.md` | «Автотестов нет» | есть |
| `DECISIONS.md` | `List-Unsubscribe` нет | реализовано (`outreach.ts`, `/unsubscribe/[token]`) |
| `DECISIONS.md` | `/api/health` нет | есть |
| `DECISIONS.md` | 10 cron | 2 |
| `DECISIONS.md` | Node `24.x` | `22.x` |
| `CHANGELOG.md` | Unreleased: server actions, cancel link, cleanup, 10 cron, `pino` | всё устарело |
| `DEPLOY.md` | `/api/health` — WARN | есть; smoke-test нужно обновить |
| `DEPLOY.md` | `lib/site.ts` | `общие/lib/site.ts` |
| `INSTALL.md` | миграции `0001–0005`/`0013` | `0001–0016` |
| `INSTALL.md` | `lib/site.ts` | `общие/lib/site.ts` |
| `CONTRIBUTING.md` | «не добавлять кириллицу в имена папок» | папки `общие`, `главная`, `шаблоны`, `телеграмм-бот`, `связь`, `служебное` |
| `CONTRIBUTING.md` | `lib/...`, `components/...`, `scripts\check.ps1` | `общие/lib`, `общие/components`, `служебное\scripts` |
| `FAQ.md` | ссылка отмены не отправляется | отправляется |
| `FAQ.md` | cleanup удаляет бывших клиентов | защищено |
| `FAQ.md` | тестов нет | есть |
| `FAQ.md` | миграции `0001–0005` | `0001–0016` |
| `FAQ.md` | Telegram `parse_mode` ломает `<>&` | экранирование есть |
| `FAQ.md` | ссылки `../README.md`, `../PROGRESS.md` | из `служебное/docs` ведут в `служебное/` — битые |
| `troubleshooting.md` | 10 cron | 2 |
| `troubleshooting.md` | лимит из `/panel/settings` не влияет | читается из `settings.rate_limits` |
| `troubleshooting.md` | cleanup удаляет бывших клиентов | защищено |
| `troubleshooting.md` | алерты лицензий ботом бизнесов | бот оператора |
| `email-setup.md` | `List-Unsubscribe` нет | есть |
| `DEMO.md` | ссылка отмены не отправляется | отправляется |
| `DEMO.md` | `docs/telegram-setup.md`, `scripts/smoke-test.sh` | `служебное/docs/...`, `служебное/scripts/...` |
| `detailing-template-port.md` | `components/templates/DetailingSite.tsx`, `app/.../DetailingBookingFlow.tsx`, `lib/detailing-tenant.ts` | `шаблоны/detailing/DetailingSite.tsx`, `.../DetailingBookingFlow.tsx`, `.../tenant.ts` |
| `detailing-template-port.md` | FAB-кнопка есть | удалена |
| `glowdetailing-demo.md` | `lib/business.ts`, `lib/availability.ts` | `общие/lib/...` |
| `design-spec.md` | `components/ui` | `общие/components` |
| `PROJECT_FILES_CATALOG.md` | снимок до рефакторинга | устарел |

---

## 8. Фактические результаты проверок

| Проверка | Результат |
|---|---|
| `tsc --noEmit` | exit 0 |
| `tsc --noEmit -p tsconfig.strict.json` | exit 2, 5 ошибок (`license-client.ts` 210–214, `rate-limit.ts` 84/87) |
| `vitest run` (vitest.config.ts) | 1313 passed, 4 failed, 7 skipped, 87 файлов |
| `middleware.test.ts` | 21/21 passed |
| `next lint` | exit 1 (конфига нет, интерактивный вопрос) |
| `next build` | не проверен: EPERM на `.next_audit/trace` (ограничение песочницы) |
| Миграции | 16 файлов `0001–0016` |
| `vercel.json` cron | 2: `backup`, `cleanup-audit-log` |
| Маршруты `app/api/cron` | 13 + `[job]` |
| `.env` | 61 ключ; 3 ключа Supabase пустые |
| `engines.node` | `22.x` |
| `version` | `0.1.0` |
| ESLint | конфига нет |
| `pino` | в коде не используется |
| `List-Unsubscribe` | реализовано |
| `/api/health` | реализовано |
| `requireSuperAdmin` | используется |
| `cleanup-prototypes` | защищает бывших клиентов |
| `notifyClientBooking` | отправляет cancel/reschedule |

---

## 9. Перепроверка (3 прохода)

### Проход 1 — документы ↔ код (фактические проверки)
- `app/api/health/route.ts` — **есть** (документы говорят «нет»).
- `app/unsubscribe/[token]` — **есть**; `List-Unsubscribe` — **есть** в `общие/lib/outreach.ts`.
- `requireSuperAdmin` в `app/panel/(protected)/actions.ts` — **7 ссылок** (документы говорят «нет проверки»).
- `vercel.json` — **2 cron** (документы говорят 10).
- `engines.node` — **22.x** (README/ARCHITECTURE/DECISIONS говорят 24.x).
- `SINGLE_TENANT` — **1 плейсхолдер** в `общие/lib/transfer.ts`, скрипта сборки нет.
- `cleanup-prototypes` — **3 ссылки** на `findFormerClientIds` (защита бывших клиентов).
- `notifyClientBooking` в `app/api/bookings/route.ts` — **2 ссылки** (ссылки отмены/переноса отправляются).
- `escapeTelegramHtml` в `общие/lib/notify.ts` — **2 ссылки** (проблема 28 закрыта).
- `warmup` в `общие/lib/schedules.ts` — **0** (маршрут есть, в реестре нет → тест падает).
- Итог: 12+ расхождений (раздел 7); код в этих местах корректнее документов.

### Проход 2 — инструментальные проверки (фактические)
- `tsc --noEmit` — **exit 0**.
- `tsc --noEmit -p tsconfig.strict.json` — **5 ошибок** (`license-client.ts` 210–214, `rate-limit.ts` 84/87).
- `vitest run --config vitest.config.ts` — **1313 passed, 4 failed, 7 skipped, 87 файлов**.
- `next lint` — **exit 1** (конфига нет).
- `next build` — **EPERM** на `.next_audit/trace` (ограничение песочницы, не вывод о коде).
- Миграции — **16**; cron — **2** в Vercel + **13** маршрутов + `[job]`.
- Итог: зелёные обычный typecheck и основная масса тестов; strict/lint/4 теста — красные.

### Проход 3 — контроль чек-листа (фактические цифры)
- Миграции: **16**; тестовых файлов: **113**; ключей в `.env`: **61**.
- Каталогов `app/api/cron`: **14** (`[job]` + 13); документов в `служебное/docs`: **20**.
- Чек-лист: **240 строк**; все пункты «Не сделано»/«Сделано» сверены с кодом повторно.
- Подтверждено: единственный релиз-блокер — 3 ключа Supabase в Vercel; strict-typecheck и 4 теста — техдолг; документация — главный источник противоречий.
- Исправлений в чек-лист по итогам прохода не потребовалось (цифры тестов обновлены на 1313/87).

---

## 10. Вывод

**Ядро продукта готово** (сайт, запись, кабинет, супер-админка, рассылка, Telegram, лицензии, cron, бэкап). **Релиз блокирует только отсутствие 3 ключей Supabase в Vercel.** Основные работы перед продакшном: синхронизировать документацию, закрыть strict-typecheck и 4 теста, настроить ESLint, решить single-tenant и юридические вопросы. Архитектура `общие/` + блоки внедрена частично: общий код и шаблон детейлинга вынесены, админка и бот — частично (route-файлы остаются в `app/` по требованию Next).
