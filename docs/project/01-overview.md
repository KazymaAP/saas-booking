# Том 01. Назначение проекта, бизнес-модель, роли, жизненный цикл

Источники: `README.md`, `ARCHITECTURE.md`, `PROGRESS.md`, `KP.md`, `DEMO.md`, `app/page.tsx`, `supabase/migrations/0001_init.sql`, `общие/lib/*`.

## 1. Что это

`saas-booking` — мультитенантная платформа готовых сайтов с онлайн-записью для малого бизнеса (шиномонтаж, барбершоп, маникюр, сауна и ещё 7 ниш). Один Next.js-проект и одна база Supabase обслуживают все бизнесы. Каждый бизнес — запись в таблице `businesses` со своим сайтом, кабинетом и бронированием.

Продукт продаётся предпринимателям как готовый сайт-визитка с онлайн-записью. Состояние подписки в коде — поля `businesses.plan` (по умолчанию `basic`), `plan_type`, `subscription_price`, `subscription_active`, `subscription_until`, `subscription_started_at`, `support_until`; справочник тарифов — таблица `pricing_plans`. Арендаторы = предприниматели, которые сами наполняют и ведут свой бизнес на витрине.

## 2. Две задачи платформы

Из `README.md`:

1. **Продажа.** Оператор импортирует выгрузку 2GIS, генерирует демо-сайты (прототипы), рассылает письма со ссылкой на демо и ведёт клиентов по воронке до оплаты.
2. **Работа клиента.** После оплаты у бизнеса есть публичный сайт с онлайн-записью, кабинет владельца и уведомления в Telegram и на email.

## 3. Зона ответственности владельца платформы

Только работоспособность ПЛАТФОРМЫ: аптайм, биллинг/подписки, модерация, поддержка, шаблоны, интеграции, безопасность, аудит. Владелец платформы НЕ управляет бизнесами арендаторов (их клиентами, записями, услугами, выручкой как таковой). Супер-админка нужна для эксплуатации платформы, а не для операционки чужих бизнесов.

Следствие для приоритетов разработки: платформенные фичи (health/мониторинг, биллинг, модерация, поддержка, шаблоны, интеграции, настройки, аудит) первичны; глубокие CRM-возможности конкретного арендатора вторичны.

## 4. Роли и где они работают

| Роль | Где работает | Источник прав | Что делает |
|---|---|---|---|
| Оператор (супер-админ) | `/panel/*` и `/admin` | `SUPERADMIN_EMAILS` + Supabase Auth + `admin-session.ts` | Импорт, воронка, рассылка, клиенты, лицензии, бэкап, настройки платформы |
| Владелец бизнеса | `/{prefix}/{slug}/panel` | `admin_users.role = 'owner'` | Брони, услуги, фото, тексты, настройки, оформление, подписка, команда, данные |
| Менеджер бизнеса | `/{prefix}/{slug}/panel` | `admin_users.role = 'manager'` | Брони, услуги, фото, тексты, уведомления, главная. Без настроек/подписки/команды/оформления/данных |
| Партнёр | `/partner` | Таблица `partners`, scrypt-пароль, HMAC-cookie `partner_session` | Лиды, счета, начисления, готовые сервисы, реферальная программа, материалы |
| Клиент бизнеса | `/{prefix}/{slug}` или кастомный домен | Без регистрации | Выбор услуги/времени, создание брони, отмена/перенос по токену |
| Неавторизованный посетитель | `/`, `/auth`, `/oferta`, `/privacy`, `/dogovor-porucheniya`, `/data-request`, `/blocked` | — | Лендинг, вход/регистрация, юридические страницы |

Проверки доступа:
- `app/panel/(protected)/layout.tsx` — `await isSuperAdmin()` иначе `redirect('/panel/login')`. Server actions дополнительно проверяют права сами через `главная/lib/guard.ts`.
- `app/[prefix]/[slug]/panel/(protected)/layout.tsx` — `currentOwner(slug)` (membership в `admin_users`, бизнес в статусе `client`), иначе `redirect(`${base}/login`)`. Для server actions — `requireOwnerAction(slug, roles)` с проверкой Origin.
- `app/partner/page.tsx` — `readPartnerSession()` + `getPartnerById()`, иначе `redirect('/partner/login')` (который редиректит на `/auth`).
- `app/admin/page.tsx` — `isSuperAdmin()`.

## 5. Жизненный цикл бизнеса (статусы `businesses.status`)

Из `0001_init.sql`, `0002_lifecycle.sql`, `PROGRESS.md`:

```
new → in_progress → preview_ready → approved → sent → viewed → replied → client
                                                              ↓
                        refused / no_contact / archived / pending_deletion / deleted
```

Дополнительные статусы: `transferred_out` (выкуп кода), `pending_deletion`, `deleted`.

| Статус | Смысл |
|---|---|
| `new` | Кандидат из выгрузки 2GIS или ручного добавления |
| `in_progress` | Взят в работу (шаг 1 воронки) |
| `preview_ready` | Сгенерирован прототип `/preview/{slug}?token=` |
| `approved` | Прототип одобрен оператором, готов к рассылке |
| `sent` | Письмо с демо отправлено |
| `viewed` | Клиент открыл письмо/ссылку (трекинг) |
| `replied` | Клиент ответил (IMAP) |
| `client` | Оплатил: сайт опубликован, кабинет доступен |
| `refused` | Отказ; через 30 дней → `archived` (cron `archive-refused`) |
| `no_contact` | Недозвон/нет контакта |
| `archived` | Архив; прототипы старше 90 дней → архив, архив старше 30 дней → удаление (`cleanup-prototypes`) |
| `transferred_out` | Код передан клиенту (выкуп) |
| `pending_deletion` | Запланировано удаление (`deletion_scheduled_at`) |
| `deleted` | Удалено |

Публичный сайт отдаётся только при `status = 'client'` (проверка в `общие/lib/business.ts` → `resolveBusiness`). Неоплаченный сайт скрыт.

## 6. Воронка продаж (супер-админка)

Шаги реализованы в `app/panel/(protected)/funnel/actions.ts` и `app/panel/(protected)/actions.ts`:

1. `moveToInProgress` — перевод выделенных бизнесов в работу.
2. `generateOne` / `generateForSelected` / `generateBatch` — генерация прототипов (`общие/lib/generate.ts`, `generate-store.ts`, `generate-og.ts`).
3. `approveSelected` / `sendBackForRework` — модерация прототипов.
4. `queueOutreach` — постановка писем в очередь (`общие/lib/outreach.ts`, `email-queue.ts`).
5. Далее: трекинг открытий/кликов (`email-tracking.ts`), входящие ответы по IMAP (`inbox-sync.ts`), отметка оплат (`payments`).

`generationProgress` — прогресс пакетной генерации.

## 7. Тарифы и деньги

- `KP.md` и лендинг `app/page.tsx`: запуск 5 000 ₽ (разово) либо подписка 5 000 ₽/мес; выкуп кода 5 000 ₽. Партнёрские модели на лендинге: подписка (партнёр получает 1 000 ₽/мес), продажа кода (1 000 ₽ разово), своя цена (партнёр 25%, платформа 75%).
- `pricing_plans` — таблица тарифов (`price_monthly`, `price_yearly`, `features`, `is_active`).
- `promo_codes` — промокоды (`discount_type`, `discount_value`, `max_uses`, `used_count`, `valid_until`).
- `payments` — платежи бизнесов (`type in ('initial_5000','subscription','code_buyout','other')`, `amount`, периоды, `receipt_url`).
- `receipts` — чеки.
- `businesses.plan`, `plan_type`, `subscription_price`, `subscription_active`, `subscription_until`, `subscription_started_at`, `support_until`, `paid_initial_at` — состояние подписки.
- Партнёрские деньги: `partner_checkouts` (счета), `partner_earnings` (начисления), `partner_payouts` (выплаты/корректировки), `referral_percent` в `settings` (по умолчанию 10%).
- ЮKassa: `общие/lib/yookassa.ts`, webhook `app/api/yookassa/webhook/route.ts`.

## 8. Ниши и URL-префиксы

Из `supabase/migrations/0003_seed.sql` (11 ниш) и `README.md`:

| Префикс | Slug шаблона | Название |
|---|---|---|
| `t` | `tire-service` | Шиномонтаж |
| `d` | `detailing` | Детейлинг |
| `m` | `manicure` | Маникюр |
| `sa` | `sauna` | Сауна / баня |
| `b` | `barbershop` | Барбершоп |
| `av` | `auto-service` | Автосервис |
| `p` | `photographer` | Фотограф |
| `r` | `tutor` | Репетитор |
| `c` | `cleaning` | Клининг |
| `st` | `dentistry` | Стоматология |
| `v` | `vet` | Ветклиника |

Каждая ниша в `vertical_templates` содержит `fields`, `default_services`, `default_texts`, `default_colors`, `blocks` (jsonb), `show_demo_mode`, `is_active`.

Отдельно в коде `шаблоны/` — 10 визуальных пресетов: `detailing`, `beauty`, `dentist`, `fitness`, `tutor`, `photographer`, `lawyer`, `vet`, `cleaning`, `repair`. Каждый — папка с `template.json`, `theme.ts`, `README.md`. Реестр — `шаблоны/_shared/themes.ts` (`ALL_NICHE_THEMES`, `getNicheTheme(prefix)`, `getNicheThemeBySlug(slug)`). Это визуальные темы, не то же самое, что 11 ниш БД.

## 9. Ключевые сценарии end-to-end

**Запись клиента:** `/{prefix}/{slug}` → `BookingForm` (react-hook-form + zod `bookingFormSchema`) → `GET /api/bookings/slots?prefix&slug&serviceId&date` (слоты из `общие/lib/slots.ts`) → `POST /api/bookings` (CSRF → rate limit 5/10 мин/IP → zod → `availability.ts` → уникальный индекс `bookings_slot_unique`) → уведомления владельцу (email + Telegram) → письмо клиенту с токенами отмены/переноса.

**Отмена/перенос:** `/booking/cancel/{token}`, `/booking/reschedule/{token}` (короткие ссылки) и дублирующие `/{prefix}/{slug}/booking/cancel/{token}`, `/{prefix}/{slug}/booking/reschedule/{token}`; API `POST /api/bookings/[token]/cancel`, `POST /api/bookings/[token]/reschedule`.

**Кастомный домен:** DNS клиента → Vercel → `middleware.ts` (host не из `MAIN_HOSTS`) → либо `/api/resolve-domain` (ставит подписанную cookie `domain_map`, 307), либо `/domain-site/by-domain?domain=...` для главной без cookie → `findBusinessByDomain()` → `BusinessPage`. Подпути с cookie переписываются в `/{prefix}/{slug}/...`.

**Регистрация:** `/auth` → `registerAction`: партнёр — `createPartner()` + партнёрская cookie + `/partner`; предприниматель — `createEntrepreneurRequest()` (заявка, `status='new'`) + пользователь Supabase Auth → сообщение «заявка отправлена». Вход `loginAction` проверяет сначала `partners`, затем Supabase Auth (супер-админ → `/admin`, владелец → `/{prefix}/{slug}/panel`).

**Партнёрская продажа:** партнёр берёт готовый сервис (`ready_services`) → пишет предпринимателю → создаёт счёт (`partner_checkouts`, варианты `subscription_5000` / `code_5000` / `custom`) → ссылка на оплату ЮKassa (`/pay/{id}`) → webhook → `markCheckoutPaid()` → `partner_earnings` + бонус наставнику (`referral_bonus`).

## 10. Границы ответственности кода

- `app/` — маршруты, страницы, server actions, route handlers.
- `общие/lib/` — рабочая бизнес-логика (через алиас `@/lib`).
- `корневой lib/` — дублирующее дерево, которое НЕ импортируется напрямую из `app/` (см. том 03).
- `главная/` — супер-админ-студия `SuperAdmin.tsx` (4688 строк), её компоненты и утилиты.
- `шаблоны/` — визуальные темы ниш и общий движок `NicheSite`.
- `components/` и `общие/components/` — дубли публичных компонентов.
- `телеграмм-бот/`, `служебное/`, `связь/` — отдельные деревья (см. том 03).
- `supabase/migrations/` — схема БД.
- `scripts/`, `служебное/scripts/` — миграции, проверки, сиды, скриншоты.
- `tests/`, `служебное/tests/` — e2e-спеки Playwright и unit-тесты.
