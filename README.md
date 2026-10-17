# saas-booking

Мультитенантная платформа сайтов онлайн-записи для малого бизнеса: шиномонтаж, барбершоп, маникюр, сауна и ещё 7 ниш.
Один Next.js-проект и одна база обслуживают все бизнесы. Каждый бизнес — запись в БД со своим сайтом, кабинетом и бронированием.

Версия: `0.1.0` · Пакетный менеджер: `pnpm` · Хостинг: Vercel + Supabase

## Что это

Платформа решает две задачи:

1. **Продажа.** Оператор импортирует выгрузку 2GIS, генерирует демо-сайты (прототипы), рассылает письма со ссылкой
   на демо и ведёт клиентов по воронке до оплаты.
2. **Работа клиента.** После оплаты у бизнеса есть публичный сайт с онлайн-записью, кабинет владельца и уведомления
   в Telegram и на email.

| Кто | Где работает | Что делает |
|---|---|---|
| Оператор (супер-админ) | `/panel` | Импорт, воронка, рассылка, клиенты, лицензии, бэкап |
| Владелец бизнеса | `/{prefix}/{slug}/panel` | Брони, услуги, фото, тексты, настройки, команда |
| Менеджер бизнеса | `/{prefix}/{slug}/panel` | Брони и просмотр (без настроек, подписки и команды) |
| Клиент бизнеса | `/{prefix}/{slug}` или свой домен | Онлайн-запись без регистрации |

Ниши и префиксы URL: `t` шиномонтаж, `d` детейлинг, `m` маникюр, `sa` сауна, `b` барбершоп, `av` автосервис,
`p` фотограф, `r` репетитор, `c` клининг, `st` стоматология, `v` ветклиника.

## Возможности

- Публичный сайт бизнеса: услуги и цены, фото, карта (Leaflet + OpenStreetMap), JSON-LD `LocalBusiness`, PWA.
- Онлайн-запись: свободные слоты считаются на лету, защита от двойной брони уникальным индексом, rate limit.
- Страницы отмены и переноса по токену (ссылка клиенту пока не отправляется — см. «Статус проекта»), напоминания
  клиенту на email за 24 и 2 часа.
- Кастомный домен клиента через Vercel API, проверка SSL раз в сутки.
- Кабинет владельца: брони, услуги, фото со сжатием в браузере, тексты, Telegram-уведомления, подписка, команда, выгрузка CSV.
- Супер-админка: импорт 2GIS, воронка из 5 шагов, генератор прототипов, рассылка с ротацией ящиков Yandex 360,
  трекинг открытий и кликов, входящие по IMAP, клиенты и оплаты, лицензии, шаблоны, ниши, статистика, логи, бэкап.
- Передача кода (выкуп) с лицензией и пингом лицензии.
- Шифрование SMTP-паролей AES-256-GCM, RLS на всех таблицах, заголовки безопасности.

## Стек

| Компонент | Технология | Версия |
|---|---|---|
| Фреймворк | Next.js App Router | 14.2.15 |
| UI | React | 18.3.1 |
| Язык | TypeScript | 5.6.2 |
| Стили | Tailwind CSS (без shadcn/ui) | 3.4.13 |
| БД, Auth, Storage | Supabase (`@supabase/supabase-js`) | 2.45.4 |
| Формы и валидация | react-hook-form, zod | 7.53.0, 3.23.8 |
| Email | nodemailer (SMTP), imapflow (IMAP) | 6.9.15, 1.0.164 |
| Excel | xlsx (SheetJS) | 0.18.5 |
| Карта | Leaflet | 1.9.4 |
| ZIP | archiver | 7.0.1 |
| Хостинг | Vercel, регион `lhr1` | — |
| Node | `engines.node` | 24.x |

## Быстрый старт

Нужны: Node 20+ (Vercel использует 24.x), pnpm 10 (pnpm 9 не принимает текущий `pnpm-workspace.yaml`), проект Supabase.

```bash
git clone https://github.com/KazymaAP/saas-booking.git
cd saas-booking
pnpm install
cp .env.example .env.local
```

Заполните в `.env.local` минимум:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
ENCRYPTION_KEY=<64 hex-символа>
CRON_SECRET=<случайная строка>
SUPERADMIN_EMAILS=you@example.com
```

Сгенерировать ключи:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # CRON_SECRET
```

Выполните миграции `supabase/migrations/0001…0005` в Supabase SQL Editor по порядку (подробно — [DEPLOY.md](DEPLOY.md)),
создайте пользователя в Supabase Auth с адресом из `SUPERADMIN_EMAILS` и запустите:

```bash
pnpm dev          # http://localhost:3000, вход в супер-админку: /panel/login
```

Проверка перед коммитом:

```bash
pnpm typecheck && pnpm build
```

## Команды

| Команда | Назначение |
|---|---|
| `pnpm dev` | Сервер разработки |
| `pnpm build` | Production-сборка |
| `pnpm start` | Запуск собранного проекта |
| `pnpm typecheck` | Проверка типов `tsc --noEmit` |
| `pnpm lint` | `next lint` — ESLint ещё не настроен, команда задаёт интерактивный вопрос |
| `npx tsx scripts/import-excel.ts file.xlsx --filter=шин --dry-run` | Импорт 2GIS из консоли |
| `npx tsx scripts/migrate-legacy.ts legacy.csv --dry-run` | Перенос legacy-клиентов из CSV |
| `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` | install + typecheck + build в `check-log.txt` (Windows) |
| `bash scripts/smoke-test.sh https://<домен>` | Проверка после деплоя |

## Структура

```
saas-booking/
├── app/
│   ├── page.tsx                     лендинг сервиса
│   ├── [prefix]/[slug]/             сайт бизнеса, бронь, отмена, перенос, manifest
│   │   └── panel/                   кабинет владельца и менеджера
│   ├── panel/                       супер-админка
│   ├── preview/[slug]/              прототип по токену (noindex)
│   ├── domain-site/by-domain/       сайт на кастомном домене
│   ├── api/                         route handlers: брони, cron, трекинг, лицензии, Telegram, импорт, экспорт
│   ├── robots.ts, sitemap.ts, sw.js/
│   └── blocked/, oferta/, privacy/
├── components/                      Hero, карта, шаблон сайта StudioTemplate
├── lib/                             Supabase, уведомления, слоты, шифрование, rate limit, импорт, генератор
├── supabase/migrations/             SQL-миграции 0001–0005
├── scripts/                         импорт Excel, миграция legacy, проверка, smoke-test
├── public/assets/                   стили шаблона и шрифты
├── docs/                            design-spec, email, Telegram, FAQ, troubleshooting
├── .github/workflows/backup.yml     еженедельный pg_dump
├── middleware.ts                    кастомные домены, лицензия, заголовки безопасности
└── vercel.json                      регион и cron-задачи
```

Подробная карта и поток данных — [ARCHITECTURE.md](ARCHITECTURE.md).

## Статус проекта

Версия `0.1.0` — рабочий MVP: `pnpm typecheck` и `pnpm build` проходят, миграции идемпотентны.
Перед продакшн-запуском закройте проблемы высокого приоритета из [PROGRESS.md](PROGRESS.md#известные-проблемы):

- server actions супер-админки не проверяют `isSuperAdmin()` сами (защита только в layout);
- ссылка на отмену и перенос брони клиенту не отправляется;
- ночная задача `cleanup-prototypes` удаляет любой бизнес в статусе `archived`, созданный больше 120 дней назад,
  включая бывших клиентов, архивированных за неуплату;
- частые cron-задачи (`send-emails`, `check-replies`, `booking-reminders`, `unconfirmed-reminder`) нужно вызывать
  внешним планировщиком — [DEPLOY.md, шаг 9](DEPLOY.md#шаг-9-частые-cron-задачи).

## Документация

| Документ | Для кого | О чём |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | разработчик | Карта проекта, поток данных, роли, схема БД |
| [DEPLOY.md](DEPLOY.md) | оператор | Пошаговый деплой Supabase + Vercel + домен + почта |
| [INSTALL.md](INSTALL.md) | клиент, выкупивший код | Установка single-tenant копии |
| [TESTING.md](TESTING.md) | разработчик | Проверки, smoke-test, ручные сценарии |
| [CONTRIBUTING.md](CONTRIBUTING.md) | разработчик | Ветки, стиль кода, коммиты |
| [CHANGELOG.md](CHANGELOG.md) | все | История версий |
| [DECISIONS.md](DECISIONS.md) | разработчик | Принятые решения и отклонения от ТЗ |
| [PROGRESS.md](PROGRESS.md) | все | Что готово и что осталось |
| [KP.md](KP.md) | продажи | Коммерческое предложение |
| [DEMO.md](DEMO.md) | продажи | Сценарий демо на 15 минут |
| [docs/email-setup.md](docs/email-setup.md) | оператор | Yandex 360, SPF, DKIM, DMARC |
| [docs/telegram-setup.md](docs/telegram-setup.md) | оператор | Два бота и webhook |
| [docs/faq.md](docs/faq.md) | все | Частые вопросы |
| [docs/troubleshooting.md](docs/troubleshooting.md) | оператор | Что делать при сбоях |
| [docs/design-spec.md](docs/design-spec.md) | дизайнер | ТЗ на редизайн панелей |

## Безопасность

- `.env.local` и любые `.env.*` (кроме `.env.example`) в git не попадают.
- `SUPABASE_SERVICE_ROLE_KEY` используется только на сервере (`lib/supabase.ts → adminClient`).
- Пароли SMTP хранятся в `email_accounts.smtp_pass_encrypted` (AES-256-GCM, ключ `ENCRYPTION_KEY`).
  Смена `ENCRYPTION_KEY` делает сохранённые пароли нечитаемыми — ящики придётся добавить заново.
- Cron-эндпоинты требуют `Authorization: Bearer <CRON_SECRET>`.

## Лицензия

Проприетарное ПО. Все права принадлежат владельцу проекта. `package.json` содержит `"private": true`, публикация
в npm и распространение без письменного согласия владельца запрещены. Клиент, выкупивший код, получает право
использовать копию для одного бизнеса на доменах из своей лицензии (`LICENSE_ID`), см. [INSTALL.md](INSTALL.md).
