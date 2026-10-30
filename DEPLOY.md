# DEPLOY — пошаговый деплой saas-booking

Чек-лист первого запуска на Vercel + Supabase. Каждый шаг заканчивается проверкой: не переходите дальше, пока
проверка не прошла. Время на всё — 2–3 часа, из них большая часть уходит на DNS.

В примерах домен сервиса — `zapishisya.ru`. Замените на свой (о смене домена — [шаг 6](#шаг-6-домен)).

## Оглавление

0. [Что нужно заранее](#шаг-0-что-нужно-заранее)
1. [Supabase: проект](#шаг-1-supabase-проект)
2. [Supabase: миграции в SQL Editor](#шаг-2-supabase-миграции-в-sql-editor)
3. [Supabase: Auth и первый супер-админ](#шаг-3-supabase-auth-и-первый-супер-админ)
4. [Переменные окружения](#шаг-4-переменные-окружения)
5. [Vercel: проект и первый деплой](#шаг-5-vercel-проект-и-первый-деплой)
6. [Домен](#шаг-6-домен)
7. [Yandex 360: почтовые ящики](#шаг-7-yandex-360-почтовые-ящики)
8. [Telegram-боты](#шаг-8-telegram-боты)
9. [Частые cron-задачи](#шаг-9-частые-cron-задачи)
10. [Резервные копии](#шаг-10-резервные-копии)
11. [Импорт 2GIS](#шаг-11-импорт-2gis)
12. [Финальная проверка](#шаг-12-финальная-проверка)
13. [Что делать, если упало](#что-делать-если-упало)
14. [Повторный деплой](#повторный-деплой)

## Шаг 0. Что нужно заранее

| Что | Зачем |
|---|---|
| Аккаунт GitHub с доступом к репозиторию `KazymaAP/saas-booking` | Vercel собирает из git |
| Аккаунт Vercel (Hobby или Pro) | хостинг, Cron, домены |
| Аккаунт Supabase (Free или Pro) | Postgres, Auth, Storage |
| Домен с доступом к DNS | основной адрес сервиса |
| Yandex 360 для бизнеса с ящиками на домене | рассылка, уведомления, входящие |
| Telegram | два бота: оператора и бизнесов |
| Node 20+ и pnpm 10 локально | генерация ключей, импорт 2GIS из консоли |

Тариф Vercel влияет на cron: на Hobby разрешены только ежедневные задачи, поэтому частые задачи вынесены во внешний
планировщик ([шаг 9](#шаг-9-частые-cron-задачи)). На Pro их можно добавить в `vercel.json`.

## Шаг 1. Supabase: проект

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Регион: `West EU (London)` — `eu-west-2`, рядом с регионом Vercel `lhr1` из `vercel.json`.
3. Сохраните пароль БД в менеджере паролей — он нужен для `SUPABASE_DB_URL` (бэкап).
4. **Project Settings → API**: скопируйте
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`;
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (секрет, только на сервер).

**Проверка:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<project-ref>.supabase.co/rest/v1/" -H "apikey: <anon key>"
# 200
```

## Шаг 2. Supabase: миграции в SQL Editor

Откройте **SQL Editor → New query**. Выполните файлы строго по порядку, каждый — отдельным запросом
(скопировать содержимое файла → **Run**):

| № | Файл | Что создаёт |
|---|---|---|
| 1 | `supabase/migrations/0001_init.sql` | 21 таблица, `is_business_member()`, RLS и политики |
| 2 | `supabase/migrations/0002_lifecycle.sql` | `businesses.refused_at`, FK журнала рассылки, bucket `backups` |
| 3 | `supabase/migrations/0003_seed.sql` | 11 ниш в `vertical_templates`, buckets `photos` и `logos` |
| 4 | `supabase/migrations/0004_features.sql` | `ssl_status`, версии шаблонов, `legacy_redirects`, ключи `settings` |
| 5 | `supabase/migrations/0005_indexes.sql` | составные индексы |
| 6 | `supabase/migrations/0006_partitions.sql` | партиции по месяцам: `audit_log`, `license_pings`, `app_logs`, `analytics_events` |
| 7 | `supabase/migrations/0007_rls_audit.sql` | RLS и политики, юридические таблицы (`unsubscribes`, `data_requests`, `cookie_consents`), хелперы |
| 8 | `supabase/migrations/0008_pg_cron.sql` | задачи `pg_cron` |
| 9 | `supabase/migrations/0009_retention.sql` | сроки хранения данных |
| 10 | `supabase/migrations/0010_partitions.sql` | обслуживание партиций |
| 11 | `supabase/migrations/0011_analytics.sql` | аналитика: ограничения событий, хэши, агрегаты |
| 12 | `supabase/migrations/0012_rate_limit_hit.sql` | атомарный rate limit (`rate_limit_hit`) |
| 13 | `supabase/migrations/0013_data_requests_types.sql` | типы запросов ПД: `withdraw`, `unsubscribe` |

Миграции задуманы как идемпотентные (`if not exists`, `on conflict do nothing`), но при повторном запуске смотрите вывод на ошибки: `pg_cron`-задачи и сторонние расширения при повторе могут ругаться не всегда безвредно.

Вариант через CLI вместо SQL Editor (нужен `psql` и строка подключения из **Project Settings → Database**):

```bash
for f in $(ls supabase/migrations/*.sql | sort); do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f" || break; done
```

**Проверка** (в SQL Editor):

```sql
select count(*) as tables from information_schema.tables where table_schema = 'public';   -- 22
select count(*) as verticals from vertical_templates;                                      -- 11
select id, public from storage.buckets order by id;          -- backups false, logos true, photos true
select relname from pg_class where relname = 'bookings_slot_unique';                       -- 1 строка
select key from settings order by key;  -- default_price, feature_flags, rate_limits, tariffs
```

## Шаг 3. Supabase: Auth и первый супер-админ

Супер-админ — это пользователь Supabase Auth, чей email указан в `SUPERADMIN_EMAILS`. Регистрации через интерфейс нет.

1. **Authentication → Providers → Email**: включён. Подтверждение email для созданных вручную пользователей не нужно.
2. **Authentication → Users → Add user → Create new user**: email оператора, надёжный пароль,
   флажок **Auto Confirm User** включён.
3. Запишите этот email в `SUPERADMIN_EMAILS` (несколько адресов — через запятую, без пробелов внутри адресов).

**Проверка** — после деплоя ([шаг 5](#шаг-5-vercel-проект-и-первый-деплой)): вход на `/panel/login` открывает
`/panel/funnel`. При отказе в логах Vercel будет строка `[login] <email>: нет в SUPERADMIN_EMAILS` или
`отказ Supabase Auth`.

## Шаг 4. Переменные окружения

Сгенерируйте секреты локально:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"        # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"  # CRON_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"        # TELEGRAM_WEBHOOK_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"        # TELEGRAM_ADMIN_WEBHOOK_SECRET
```

| Переменная | Обязательна | Пример / где взять | Если не задать |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | да | `https://zapishisya.ru` | ссылки в письмах, sitemap и трекинг пойдут на `https://zapishisya.ru` |
| `NEXT_PUBLIC_SUPABASE_URL` | да | шаг 1 | сайт не работает |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | да | шаг 1 | не работает вход |
| `SUPABASE_SERVICE_ROLE_KEY` | да | шаг 1 | сайт не работает |
| `ENCRYPTION_KEY` | да | 64 hex-символа | нельзя добавить почтовый ящик |
| `CRON_SECRET` | да | случайная строка | все `/api/cron/*` отвечают 401 |
| `SUPERADMIN_EMAILS` | да | `owner@zapishisya.ru` | вход в `/panel` невозможен |
| `SMTP_HOST`, `SMTP_PORT` | нет | `smtp.yandex.ru`, `465` | запасные значения, если у ящика не указан хост |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | нет | [docs/telegram-setup.md](docs/telegram-setup.md) | нет уведомлений оператору |
| `TELEGRAM_ADMIN_WEBHOOK_SECRET` | нет | случайная строка | команда `/stats` не работает |
| `TELEGRAM_BUSINESS_BOT_TOKEN`, `TELEGRAM_BUSINESS_BOT_USERNAME` | нет | [docs/telegram-setup.md](docs/telegram-setup.md) | бизнесы не подключат Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | нет | случайная строка | привязка `/start BIZ-…` не работает |
| `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | нет | шаг 6 | кастомные домены добавляются вручную |
| `LICENSE_ID`, `LICENSE_SERVER_URL` | нет | только в копии клиента, см. [INSTALL.md](INSTALL.md) | лицензия не проверяется |
| `APP_VERSION` | нет | `0.1.0` | в ping лицензии уходит `0.1.0` |

Переменные `IMAP_HOST`, `IMAP_PORT`, `LEGAL_MODE`, `HOSTING_PROVIDER`, `DB_PROVIDER`, `STORAGE_PROVIDER`,
`EMAIL_PROVIDER`, `PAYMENT_METHOD` есть в `.env.example`, но кодом не читаются: IMAP берётся из настроек ящика,
остальное — заготовки под миграцию (ТЗ §22). Задавать их не нужно.

## Шаг 5. Vercel: проект и первый деплой

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → `saas-booking`.
2. **Framework Preset**: Next.js. **Install Command**: `pnpm install`. **Build Command**: `pnpm build`
   (определяются автоматически по `pnpm-lock.yaml`). Если сборка падает на установке с
   `packages field missing or empty`, Vercel выбрал pnpm 9: укажите **Install Command**
   `npx pnpm@10 install --frozen-lockfile`.
3. **Settings → General → Node.js Version**: `24.x` (совпадает с `engines.node` в `package.json`).
4. **Settings → Environment Variables**: добавьте переменные шага 4 для окружения **Production**
   (и **Preview**, если нужны превью-деплои).
5. **Deploy**. Регион функций `lhr1` и 10 cron-задач подтягиваются из `vercel.json`.

**Проверка:**

```bash
bash scripts/smoke-test.sh https://<project>.vercel.app
```

- Ожидаемо: все проверки `OK`, кроме `/api/health` (`WARN` — эндпоинта нет в коде) и публичного сайта
  (`SKIP` — клиентов пока нет).
- **Vercel → Settings → Cron Jobs**: 10 задач.
- Вход на `https://<project>.vercel.app/panel/login` работает (хост `*.vercel.app` считается основным).

## Шаг 6. Домен

### Основной домен сервиса

1. **Vercel → Settings → Domains → Add**: `zapishisya.ru` и `www.zapishisya.ru`.
2. В DNS регистратора — записи, которые покажет Vercel (обычно `A @ 76.76.21.21` и `CNAME www cname.vercel-dns.com`).
3. Дождитесь статуса **Valid Configuration** и выданного сертификата.
4. Убедитесь, что `NEXT_PUBLIC_SITE_URL` = `https://zapishisya.ru`, и сделайте **Redeploy**.

Если домен другой, кроме `NEXT_PUBLIC_SITE_URL` нужно изменить список `MAIN_HOSTS` в `lib/site.ts`
(сейчас там `zapishisya.ru`, `www.zapishisya.ru`, `localhost:3000`). Без этого middleware примет основной домен за
домен клиента и вместо лендинга покажет 404. Это правка кода — делается коммитом до деплоя.

**Проверка:**

```bash
curl -sI https://zapishisya.ru | head -1                    # HTTP/2 200
curl -s https://zapishisya.ru/robots.txt | grep Sitemap     # Sitemap: https://zapishisya.ru/sitemap.xml
```

### Кастомные домены клиентов (тариф 2500 ₽)

Нужны `VERCEL_API_TOKEN` (**Account Settings → Tokens**, scope — команда проекта), `VERCEL_PROJECT_ID`
(**Project Settings → General → Project ID**) и `VERCEL_TEAM_ID` (только для team-аккаунта, **Team Settings → General**).

1. Оператор вводит домен в `/panel/businesses/{id}` → домен добавляется в проект Vercel через API.
2. Клиент ставит DNS-записи на Vercel (как для основного домена).
3. Кнопка **Проверить SSL** или ночной cron `check-domains` меняет `ssl_status` на `active`.

**Проверка:** `curl -sI https://<домен-клиента>` → 200, страница — сайт бизнеса; `https://<домен-клиента>/panel` —
вход в кабинет этого бизнеса.

## Шаг 7. Yandex 360: почтовые ящики

Подробно — [docs/email-setup.md](docs/email-setup.md). Кратко:

1. Подключите домен в Yandex 360, добавьте MX, SPF, DKIM, DMARC.
2. Создайте ящики (ТЗ: до 10 штук, по 50 писем в день на ящик).
3. Для каждого ящика: **Безопасность → Пароли приложений → Почта** — пароль приложения.
4. В `/panel/email-accounts` добавьте каждый ящик: адрес, пароль приложения, `smtp.yandex.ru:465`,
   `imap.yandex.ru:993`, лимит `50`. Пароль шифруется ключом `ENCRYPTION_KEY`.

**Проверка:** в `/panel/email-accounts` кнопки **Тест подключения** → `Подключение …: OK` и **Тестовое письмо**
→ письмо пришло, в заголовках `spf=pass`, `dkim=pass`.

## Шаг 8. Telegram-боты

Подробно — [docs/telegram-setup.md](docs/telegram-setup.md). Кратко: два бота в @BotFather, токены в переменные,
`setWebhook` с `secret_token`:

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BUSINESS_BOT_TOKEN/setWebhook" \
  -d "url=https://zapishisya.ru/api/telegram/webhook" -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://zapishisya.ru/api/telegram/admin-webhook" -d "secret_token=$TELEGRAM_ADMIN_WEBHOOK_SECRET"
```

**Проверка:** боту оператора `/stats` → сводка; `getWebhookInfo` без `last_error_message`.

## Шаг 9. Частые cron-задачи

`vercel.json` содержит только ежедневные задачи. Эти четыре нужно вызывать внешним планировщиком
(например, cron-job.org, GitHub Actions или cron на любом сервере):

| Задача | URL | Частота | Без неё |
|---|---|---|---|
| send-emails | `https://zapishisya.ru/api/cron/send-emails` | каждую минуту | рассылка стоит в очереди |
| check-replies | `https://zapishisya.ru/api/cron/check-replies` | каждые 5 минут | ответы не попадают во входящие |
| booking-reminders | `https://zapishisya.ru/api/cron/booking-reminders` | каждый час | нет напоминаний за 24 ч и 2 ч |
| unconfirmed-reminder | `https://zapishisya.ru/api/cron/unconfirmed-reminder` | каждый час | бизнес не узнаёт о висящих бронях |

Каждый запрос — `GET` с заголовком `Authorization: Bearer <CRON_SECRET>`. Пример строки crontab:

```bash
* * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://zapishisya.ru/api/cron/send-emails >/dev/null
```

`booking-reminders` ищет брони в окне «через 23–24 часа» и «через 1–2 часа». Если запускать реже раза в час,
часть напоминаний будет пропущена.

Вариант с GitHub Actions для часовых задач (минимальный интервал GitHub — 5 минут, запуски могут опаздывать,
поэтому `send-emails` раз в минуту лучше вызывать через cron-job.org или crontab). Файл
`.github/workflows/cron-hourly.yml` создаёт разработчик, секреты `SITE_URL` и `CRON_SECRET` — в
**Settings → Secrets and variables → Actions**:

```yaml
name: cron-hourly
on:
  schedule:
    - cron: '5 * * * *'          # каждый час в :05 UTC
  workflow_dispatch:
jobs:
  call:
    runs-on: ubuntu-latest
    steps:
      - name: Вызов задач
        env:
          SITE_URL: ${{ secrets.SITE_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          for job in booking-reminders unconfirmed-reminder; do
            curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$SITE_URL/api/cron/$job"; echo
          done
```

**Проверка:**

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://zapishisya.ru/api/cron/send-emails
# {"ok":true,"sent":0}
curl -s -o /dev/null -w '%{http_code}\n' https://zapishisya.ru/api/cron/send-emails
# 401 — без секрета доступа нет
```

## Шаг 10. Резервные копии

Два независимых механизма:

1. **pg_dump раз в неделю** (`.github/workflows/backup.yml`, воскресенье 00:00 UTC). В GitHub:
   **Settings → Secrets and variables → Actions → New repository secret** `SUPABASE_DB_URL` — строка
   **Session pooler** (порт 5432) из **Supabase → Project Settings → Database → Connection string**.
   Дамп хранится как artifact 60 дней.
2. **JSON-копия 7 таблиц** в bucket `backups`: кнопка **Сделать копию сейчас** в `/panel/backup`
   (вызывает `/api/cron/backup`). Восстановление — там же, с подтверждением словом `ВОССТАНОВИТЬ`.

**Проверка:** **Actions → weekly-backup → Run workflow** → зелёный запуск и artifact `db-backup-<id>`;
в `/panel/backup` появился файл `backup-YYYY-MM-DD.json`.

## Шаг 11. Импорт 2GIS

Выгрузка 2GIS в `.xlsx` с колонками `Наименование`, `Рубрики`, `Адрес`, `Город`, `Телефон…`, `E-mail…`,
`Веб-сайт…`, `Рейтинг`, `Количество отзывов`, `Часы работы`, `2GIS URL`.

Через интерфейс: `/panel/businesses` → форма импорта → файл до 10 МБ, фильтр по рубрике (по умолчанию `шин`),
сначала с флажком **Только проверить**, затем без него.

Через консоль (нужен `.env.local` с ключами Supabase):

```bash
npx tsx scripts/import-excel.ts ./scripts/import/2gis.xlsx --filter=шин --dry-run
npx tsx scripts/import-excel.ts ./scripts/import/2gis.xlsx --filter=шин
```

Правила импорта: ниша определяется по рубрике; телефоны нормализуются в `+7XXXXXXXXXX`; без email — статус
`no_contact`, с email — `new`; повторный импорт того же `2GIS URL` обновляет только рейтинг, отзывы, часы,
телефоны, email, сайты и соцсети.

**Проверка:** в `/panel/funnel` в шаге 1 появились бизнесы; в SQL Editor
`select status, count(*) from businesses group by status;`.

## Шаг 12. Финальная проверка

```bash
bash scripts/smoke-test.sh https://zapishisya.ru t/<slug-клиента>
```

Ручной сквозной сценарий — [TESTING.md](TESTING.md#сквозной-сценарий): импорт → прототип → письмо → оплата →
доступ → бронь → отмена.

## Что делать, если упало

| Симптом | Причина | Решение |
|---|---|---|
| Build: `Type error` | расхождение типов | локально `pnpm typecheck`, исправить, запушить |
| Install: `packages field missing or empty` | pnpm 9 не принимает `pnpm-workspace.yaml` без поля `packages` | pnpm 10: локально `npm i -g pnpm@10`, на Vercel Install Command `npx pnpm@10 install --frozen-lockfile` |
| Все страницы 500, в логах `supabaseUrl is required` | не заданы ключи Supabase | шаг 4, затем Redeploy |
| Лендинг на своём домене отдаёт 404 | домена нет в `MAIN_HOSTS` | шаг 6, правка `lib/site.ts` |
| `/panel/login` → «Неверная почта или пароль» | email не в `SUPERADMIN_EMAILS` или пользователь не подтверждён | шаг 3 |
| `/api/cron/*` → 401 | нет `CRON_SECRET` или неверный заголовок | шаг 4, шаг 9 |
| Миграция: `relation already exists` | нет, миграции идемпотентны | если ошибка другая — запускайте файлы по одному и по порядку |
| Миграция 0003: `relation "storage.buckets" does not exist` | SQL выполняется не в Supabase | запускайте в Supabase SQL Editor |
| Письма не уходят | нет ящиков, лимит исчерпан, неверный пароль приложения | [docs/troubleshooting.md](docs/troubleshooting.md#smtp-не-работает) |

Подробный разбор сбоев — [docs/troubleshooting.md](docs/troubleshooting.md).

Откат: **Vercel → Deployments → предыдущий деплой → Promote to Production**. Миграции только добавляют объекты,
откатывать схему при откате кода не нужно.

## Повторный деплой

1. `pnpm typecheck && pnpm build` локально.
2. Новые миграции — в SQL Editor до пуша кода, который их использует.
3. `git push origin main` → Vercel собирает автоматически.
4. `bash scripts/smoke-test.sh https://zapishisya.ru`.
5. Запись в [CHANGELOG.md](CHANGELOG.md).
