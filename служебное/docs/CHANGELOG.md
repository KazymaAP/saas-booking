# CHANGELOG — saas-booking

Формат — [Keep a Changelog 1.1](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer 2.0](https://semver.org/lang/ru/).
Версия проекта берётся из `package.json` (`"version"`). Пока версия `0.x`, любой минорный релиз может содержать
ломающие изменения — они помечаются **BREAKING**.

Разделы записи: «Добавлено», «Изменено», «Исправлено», «Удалено», «Безопасность», «Известные проблемы».
Как писать коммиты, чтобы их было удобно переносить сюда, — [CONTRIBUTING.md](CONTRIBUTING.md#коммиты).

## [Unreleased]

Изменения в рабочей копии после последнего коммита в `main` (2026-10-13). Не задеплоены.

### Добавлено

- Миграция `0005_indexes.sql`: составные индексы под запросы кабинета, публичного сайта, проверки прав
  (`admin_users`: `business_id` + `auth_user_id`) и журнала аудита. Идемпотентна.
- `components/MapLazy.tsx`: карта Leaflet загружается только в браузере (`next/dynamic`, `ssr: false`) с заглушкой.
- `photos/PhotoUploaderLazy.tsx`: ленивая загрузка `browser-image-compression` в разделе «Фото» кабинета.
- `docs/design-spec.md`: ТЗ на редизайн панелей (черновик).
- Документация: `README.md`, `ARCHITECTURE.md`, `DEPLOY.md`, `INSTALL.md`, `TESTING.md`, `KP.md`, `DEMO.md`,
  `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/email-setup.md`, `docs/telegram-setup.md`, `docs/faq.md`,
  `docs/troubleshooting.md`.
- `scripts/smoke-test.sh`: проверка деплоя (главная, вход, sitemap, robots, заголовки безопасности, закрытость cron
  и прототипов, публичный сайт), коды выхода `0 / 1 / 2`.

### Изменено

- `next.config.mjs`: `experimental.staleTimes` (`dynamic: 30`, `static: 180`) — мгновенный возврат назад в панелях;
  `serverComponentsExternalPackages` для `imapflow`, `nodemailer`, `pino`; `poweredByHeader: false`.
- `components/templates/StudioTemplate.tsx`: карта через `MapLazy`.
- `.gitignore`: добавлены `check-log.txt`, `tsconfig.tsbuildinfo`, `scripts/import/`.
- `DECISIONS.md`: переписан по разделам, устаревшие решения (Vercel Pro, Node 20, «tsc не запускался») перенесены
  в «Отменённые решения».
- `PROGRESS.md`: сводка по областям, «Частично», «Не сделано», таблица известных проблем с приоритетами.
- `docs/design-spec.md`: пометка о том, что `components/ui` появится в рамках редизайна.

### Известные проблемы

Перечислены в [PROGRESS.md](PROGRESS.md#известные-проблемы). Главные:

- Server actions супер-админки не проверяют `isSuperAdmin()` сами.
- Частые cron-задачи (`send-emails`, `check-replies`, `booking-reminders`, `unconfirmed-reminder`) не в `vercel.json`.
- Ссылка на отмену и перенос брони клиенту не отправляется.
- `cleanup-prototypes` удаляет любой `archived` бизнес с `created_at` старше 120 дней, включая бывших клиентов.

## [0.1.0] — 2026-10-13

Первая рабочая версия MVP на Vercel + Supabase. Состояние ветки `main` на 2026-10-13.
`pnpm typecheck` и `pnpm build` проходят (`check-log.txt`).

### Добавлено

**База данных** (`supabase/migrations/`)

- `0001_init.sql`: 21 таблица, функция `is_business_member()`, RLS на всех таблицах, политики для `anon` и
  `authenticated`, частичный уникальный индекс `bookings_slot_unique` против двойной брони.
- `0002_lifecycle.sql`: `businesses.refused_at`, сохранение журнала рассылки при удалении бизнеса, bucket `backups`.
- `0003_seed.sql`: 11 ниш с префиксами URL, услугами, текстами и цветами по умолчанию; buckets `photos`, `logos`.
- `0004_features.sql`: `ssl_status` кастомного домена, версии шаблонов писем, таблица `legacy_redirects`,
  ключи `settings` (`tariffs`, `default_price`, `rate_limits`, `feature_flags`).

**Публичный сайт бизнеса**

- `/{prefix}/{slug}`: услуги и цены, фото, «О нас», карта, JSON-LD `LocalBusiness`, PWA-манифест и service worker.
- Онлайн-запись: свободные слоты на лету (`lib/slots.ts`, UTC+3), повторная проверка слота при создании,
  rate limit 5 запросов за 10 минут с IP, отдельное согласие на обработку ПД.
- Отмена и перенос по токену `cancel_token`: `/{prefix}/{slug}/booking/cancel|reschedule/{token}` и короткие
  ссылки `/booking/...`.
- 308-редирект со старого slug (`slug_history`) и со старых доменов (`legacy_redirects`).
- Кастомный домен: middleware → `/domain-site/by-domain`, `/api/resolve-domain`.
- `/oferta`, `/privacy`, `/blocked`, `robots.txt`, `sitemap.xml`.

**Кабинет владельца** (`/{prefix}/{slug}/panel`)

- Вход по email и паролю (Supabase Auth), роли `owner` и `manager`.
- Разделы: главная с чек-листом готовности, брони (подтвердить, выполнено, не пришёл, отменить), услуги,
  фото со сжатием в браузере до 2 МБ, тексты, Telegram-уведомления по коду `BIZ-xxxxxx`, данные (CSV, запрос
  удаления), настройки и часы работы, подписка, команда.

**Супер-админка** (`/panel`)

- Воронка из 5 шагов: выбор, генерация прототипов, одобрение, рассылка, дашборд.
- Бизнесы: импорт выгрузки 2GIS (xlsx до 10 МБ), ручное добавление, массовая смена статуса, карточка, кастомный
  домен через Vercel API, проверка SSL.
- Входящие (IMAP), клиенты (оплата 5 000 ₽, продление, доступ владельцу, напоминание, отказ), лицензии, почтовые
  ящики с шифрованием паролей AES-256-GCM, шаблоны писем с версиями, ниши, статистика (MRR), логи, настройки
  платформы, бэкап и восстановление.
- Экспорт бизнесов в CSV и XLSX.

**Рассылка и уведомления**

- Очередь в `outreach_log`, отправка по одному письму с ротацией ящиков Yandex 360 и дневным лимитом.
- Трекинг открытий (пиксель) и кликов (редирект только на `SITE_URL`).
- Чтение ответов по IMAP с привязкой к бизнесу по email или домену.
- Telegram: бот бизнеса (новые записи, отмены, переносы) и бот оператора (`notifyAdmin`, команда `/stats`).
- Напоминания клиенту за 24 и 2 часа, письмо при подтверждении брони.

**Cron** (`/api/cron/*`, `Authorization: Bearer <CRON_SECRET>`)

- 15 задач: рассылка, ответы, напоминания, неподтверждённые брони, follow-up, сброс лимитов, напоминания о подписке,
  архивация отказов и прототипов, очистка аудита, удаления, передачи кода, проверка доменов, бэкап.

**Выкуп кода и лицензии**

- `/api/transfer/{id}`: ZIP с памяткой и `.env.example` с `LICENSE_ID`, `support_until = +30 дней`.
- `/api/license/ping`, `/api/license/revoke`; middleware при `blocked` переводит на `/blocked`.

**Инфраструктура**

- `vercel.json`: регион `lhr1`, 10 ежедневных cron-задач.
- `.github/workflows/backup.yml`: еженедельный `pg_dump` в artifact на 60 дней (секрет `SUPABASE_DB_URL`).
- `middleware.ts`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Robots-Tag: noindex` для `/preview/*`.
- Скрипты: `scripts/import-excel.ts`, `scripts/migrate-legacy.ts`, `scripts/check.ps1`.

### Изменено

- **BREAKING** для деплоя: частые cron-задачи (`send-emails`, `check-replies`, `booking-reminders`,
  `unconfirmed-reminder`) убраны из `vercel.json` — тариф Vercel Hobby разрешает только ежедневные задачи.
  Их нужно вызывать внешним планировщиком: [DEPLOY.md](DEPLOY.md#шаг-9-частые-cron-задачи).
- `engines.node` — `24.x` (среда сборки Vercel).
- `tsx` удалён из `devDependencies`; скрипты запускаются через `npx tsx`.
- Шаблон сайта бизнеса — единый `StudioTemplate` со стилями `public/assets/studio.css` и локальными шрифтами
  Inter и IBM Plex Sans (без Google Fonts).
- Сессии и проверки прав кэшируются на время запроса (`React.cache`), запросы бизнеса и ниши — параллельно.

### Безопасность

- Пароли SMTP — AES-256-GCM, ключ `ENCRYPTION_KEY`.
- Ключ `service_role` используется только на сервере.
- Прототипы доступны только по `preview_token`, закрыты от индексации.

[Unreleased]: https://github.com/KazymaAP/saas-booking/compare/main...HEAD
[0.1.0]: https://github.com/KazymaAP/saas-booking/tree/main
