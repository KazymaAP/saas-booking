# Том 04. Все маршруты App Router

Источник: полный обход `app/` (список файлов `page.tsx`, `layout.tsx`, `route.ts`, `actions.ts`, `loading/error/not-found.tsx`), `middleware.ts`, `app/panel/(protected)/layout.tsx`, `app/[prefix]/[slug]/panel/(protected)/_lib/sections.ts`.

Ниже перечислены **все** маршруты проекта. Для страниц указаны файл и назначение. Для `/api/**` — том 06.

## 1. Корень `app/`

| Путь | Файл | Назначение |
|---|---|---|
| `/` | `app/page.tsx` | Лендинг платформы. `revalidate = 86400`. Секции: «Как это работает», «Клиентам — предпринимателям», «Партнёрам — заработок на клиентах», «Тарифы», «Шаблоны под 10 ниш», «Готовы запустить сайт?». Кнопки/ссылки: `Хочу сайт`, `Стать партнёром`, `Войти`, `Я партнёр`, `Кабинет партнёра`, `Открыть кабинет партнёра`, `Посмотреть тарифы`, `Стать партнёром`, `Оставить заявку`, `Обсудить`, `Записаться`, `Превью сайта`, `Выкуп кода`, `Запрос о персональных данных`, `Запишись`. Якоря `#clients #partners #pricing #templates`. Ссылки `/auth`, `/auth?mode=register&role=partner`, `/data-request`, `/dev/templates/{key}` |
| — | `app/layout.tsx` | Корневой макет: `<html lang="ru">`, metadata (`metadataBase` из `SITE_URL`, title «Онлайн-запись»), viewport, preconnect/dns-prefetch к Supabase |
| — | `app/globals.css` | Глобальные стили, CSS-переменные оформления |
| — | `app/error.tsx` | Граница ошибок приложения (клиентская) |
| — | `app/global-error.tsx` | Глобальная граница ошибок |
| `/*` | `app/not-found.tsx` | 404 (в т.ч. старые ссылки на сайты бизнесов) |
| `/robots.txt` | `app/robots.ts` | Robots |
| `/sitemap.xml` | `app/sitemap.ts` | Карта сайта |
| `/icon.svg` | `app/icon.svg` | Фавикон |
| `/sw.js` | `app/sw.js/route.ts` | Service worker (текст из `общие/lib/sw-source.ts`) |
| `/blocked` | `app/blocked/page.tsx` | Заглушка «Сайт временно недоступен» при `license_status=blocked` или истёкшем сроке поддержки |
| `/oferta` | `app/oferta/page.tsx` | Публичная оферта, реквизиты и цены из `settings` |
| `/privacy` | `app/privacy/page.tsx` | Политика обработки ПД |
| `/dogovor-porucheniya` | `app/dogovor-porucheniya/page.tsx` | Договор поручения на обработку ПД |
| `/data-request` | `app/data-request/page.tsx` + `actions.ts` | Запрос субъекта ПД: доступ/исправление/удаление/отзыв согласия/отказ от писем |
| `/auth` | `app/auth/page.tsx` + `AuthCard.tsx` + `actions.ts` | Единая страница входа/регистрации. `?mode=register`, `?role=partner`, `?ref=CODE` |
| `/magic-link` | `app/magic-link/page.tsx` + `actions.ts` | Вход по одноразовой ссылке; без `token` — форма запроса письма |
| `/reset-password` | `app/reset-password/page.tsx` + `actions.ts` | Новый пароль по ссылке (GET не гасит токен) |
| `/invite/[token]` | `app/invite/[token]/page.tsx` + `actions.ts` | Приглашение в кабинет бизнеса |
| `/unsubscribe/[token]` | `app/unsubscribe/[token]/page.tsx` + `actions.ts` | Отписка по ссылке из письма |
| `/pay/[id]` | `app/pay/[id]/page.tsx` + `app/pay/actions.ts` | Оплата партнёрского счёта (ЮKassa / тестовый режим); «Оплата прошла» |
| `/preview/[slug]` | `app/preview/[slug]/page.tsx` | Прототип сайта по токену, `noindex` |
| `/booking/cancel/[token]` | `app/booking/cancel/[token]/page.tsx` + `actions.ts` | Короткая ссылка отмены брони |
| `/booking/reschedule/[token]` | `app/booking/reschedule/[token]/page.tsx` + `actions.ts` | Короткая ссылка переноса брони |
| `/dev/super-admin` | `app/dev/super-admin/page.tsx` | Dev-страница |
| `/dev/templates/[key]` | `app/dev/templates/[key]/page.tsx` | Превью визуальной темы ниши |
| `/demo` | `app/demo/page.tsx` | Лаунчер демо-кабинетов в оболочке настоящей панели |
| `/demo/business` | `app/demo/business/page.tsx` | Редирект на `/api/demo/owner` |
| `/domain-site/by-domain/[[...rest]]` | `page.tsx` | Главная сайта на кастомном домене без cookie: `findBusinessByDomain()` + `BusinessPage` |

## 2. Публичный сайт бизнеса `app/[prefix]/[slug]/`

| Путь | Файл | Назначение |
|---|---|---|
| `/{prefix}/{slug}` | `page.tsx` | `BusinessPage`: `resolveBusiness()` → 308 при старом slug / 404; параллельно `activeServices()` и фото; `generateMetadata` (title = имя бизнеса, og, manifest), `generateViewport` (themeColor = brand_color); `revalidate = 3600`. Рендер: нишевый `NicheSite` при совпадении темы, иначе `StudioTemplate`; оверрайд стиля из `custom_texts[SITE_THEME_KEY]`; JSON-LD `LocalBusiness` через `jsonLdSafe` |
| `/{prefix}/{slug}/manifest.webmanifest` | `manifest.webmanifest/route.ts` | PWA-манифест бизнеса |
| `/{prefix}/{slug}/booking/cancel/[token]` | `page.tsx` + `actions.ts` | Отмена брони на сайте бизнеса |
| `/{prefix}/{slug}/booking/reschedule/[token]` | `page.tsx` | Перенос брони |
| — | `BookingForm.tsx` | Форма: услуга → дата → слот → имя/телефон/email/комментарий → согласие. react-hook-form + zod, useOptimistic, useSlots, a11y |
| — | `booking-ui.tsx` | `DateStrip`, `SlotPicker`, `FieldError`, `fieldStyles` |
| — | `use-booking-submit.ts` | Отправка брони в `/api/bookings` |
| — | `SwRegister.tsx` | Регистрация `/sw.js` в production |
| — | `booking/booking-page-ui.tsx`, `booking/error.tsx` | UI страниц отмены/переноса |

## 3. Кабинет владельца `app/[prefix]/[slug]/panel/`

| Путь | Файл | Назначение |
|---|---|---|
| `/panel/login` | `login/page.tsx` | Вход владельца/менеджера. На кастомном домене middleware переписывает `/panel/login` сюда |
| `/panel/export` | `export/route.ts` + `csv.ts` | Выгрузка броней в CSV |
| `/panel/(protected)` | `layout.tsx` | Проверка `currentOwner`, `PanelNav`, toast, оформление панели по нише/`PANEL_THEME_KEY`, бейдж подписки |
| | `page.tsx` | Главная: «Добро пожаловать!», «Платежи платформе», онбординг |
| | `loading.tsx`, `error.tsx`, `not-found.tsx` | Состояния |
| `/bookings` | `bookings/page.tsx` + `actions.ts` + `BookingList.tsx` + `rows.ts` + `status.ts` + `tel.ts` + `view.ts` + `loading.tsx` | Список броней, фильтры, смена статуса, ручная запись |
| `/services` | `services/page.tsx` + `actions.ts` + `ServiceForm.tsx` + `ServiceList.tsx` + `schema.ts` | Услуги: добавить, изменить, активность |
| `/photos` | `photos/page.tsx` + `actions.ts` + `PhotoGallery.tsx` + `PhotoUploader*.tsx` + `rules.ts` + `upload-client.ts` + `usePhotoUploads.ts` | Фото работ, сжатие в браузере, подписанная загрузка в Storage |
| `/texts` | `texts/page.tsx` + `actions.ts` + `TextsForm.tsx` + `schema.ts` | Тексты сайта |
| `/settings` | `settings/page.tsx` + `actions.ts` + `SettingsForm.tsx` + `schema.ts` | Контакты, адрес, часы работы, слоты, автоподтверждение (только owner) |
| `/appearance` | `appearance/page.tsx` + `AppearancePicker.tsx` + `appearance-actions.ts` | 10 стилей оформления кабинета и сайта (только owner) |
| `/subscription` | `subscription/page.tsx` + `actions.ts` + `PaidReport.tsx` + `schema.ts` | Подписка, продление, «Уже оплатили?» (только owner) |
| `/team` | `team/page.tsx` + `actions.ts` + `TeamManager.tsx` + `InviteForm.tsx` + `CredentialsCard.tsx` + `schema.ts` | Команда, приглашение менеджера (только owner) |
| `/notifications` | `notifications/page.tsx` + `actions.ts` + `TelegramConnect.tsx` + `telegram-state.ts` + `telegram-view.ts` | Привязка Telegram кодом `BIZ-…`, статус, отключение |
| `/data` | `data/page.tsx` + `actions.ts` + `DeleteAccount.tsx` + `rules.ts` | Выгрузка броней, удаление аккаунта (только owner) |

Разделы и видимость по ролям — `'_lib/sections.ts'`:
`home` (Главная), `bookings` (Брони), `services` (Услуги), `photos` (Фото), `texts` (Тексты), `notifications` (Уведомления) — доступны owner и manager; `settings` (Настройки), `appearance` (Оформление), `subscription` (Подписка), `team` (Команда), `data` (Данные) — `ownerOnly: true`. `eagerPrefetch` только у `home` и `bookings`. Вспомогательные модули `_lib/`: `access.ts`, `busy.ts`, `client-action.ts`, `color.ts`, `form.ts`, `onboarding.ts`, `result.ts`, `subscription.ts`, `time.ts`, `tips.ts`, `useUnsavedGuard.ts`; компоненты `_components/`: `ConfirmDialog`, `CopyButton`, `Field`, `OnboardingTip`, `PanelNav`, `Skeleton`, `Toast`.

## 4. Супер-админка `app/panel/`

| Путь | Файл | Назначение |
|---|---|---|
| `/panel` | `page.tsx` | `redirect('/admin')` |
| `/panel/login` | `login/page.tsx` | Вход супер-админа, код ошибки в `?error=` |
| `/panel/forgot-password` | `forgot-password/page.tsx` | Запрос сброса пароля, область по `?next=` |
| `/panel/(protected)` | `layout.tsx` | `isSuperAdmin()` + NAV из 13 пунктов |
| `/funnel` | `funnel/page.tsx` + `actions.ts` | Воронка: 5 шагов, генерация, модерация, рассылка |
| `/businesses` | `businesses/page.tsx` + `actions.ts` | Список бизнесов, фильтры, «Импорт выгрузки 2GIS», «Добавить вручную», массовая смена статуса, экспорт |
| `/businesses/[id]` | `businesses/[id]/page.tsx` + `actions.ts` | Карточка бизнеса: заметка, домен, проверка SSL, смена slug/статуса |
| `/clients` | `clients/page.tsx` + `actions.ts` | Клиенты и кандидаты, оплата, доступ, продление |
| `/inbox` | `inbox/page.tsx` + `actions.ts` | Входящие письма, «Прочитано», ответ |
| `/templates` | `templates/page.tsx` + `actions.ts` | Шаблоны писем, предпросмотр, версии |
| `/verticals` | `verticals/page.tsx` + `actions.ts` + `schema.ts` + `VerticalForms.tsx` | Ниши: JSON, импорт, активность |
| `/email-accounts` | `email-accounts/page.tsx` + `actions.ts` | Ящики рассылки: сохранить, вкл/выкл, сброс лимита, удалить, тест, тестовое письмо |
| `/licenses` | `licenses/page.tsx` + `actions.ts` | Выдать лицензию, отзыв, разрешить домен, игнорировать сигнал |
| `/stats` | `stats/page.tsx` + `actions.ts` | Статистика, главные показатели, пересчёт |
| `/logs` | `logs/page.tsx` | Логи/журнал |
| `/settings` | `settings/page.tsx` + `actions.ts` | Реквизиты, тарифы, цены, ограничения, флаги, настройки платформы |
| `/backup` | `backup/page.tsx` + `actions.ts` | Резервные копии, восстановление, чек-лист |
| — | `(protected)/actions.ts` | `moveToInProgress`, `generateOne`, `generateForSelected`, `approveSelected`, `sendBackForRework`, `queueOutreach` |
| — | `loading.tsx`, `error.tsx` | Состояния |

NAV (`app/panel/(protected)/layout.tsx`): Воронка, Бизнесы, Клиенты, Входящие, Шаблоны, Ниши, Ящики, Лицензии, Статистика, Логи, Настройки, Бэкап, Админ-студия (`/admin`).

## 5. Админ-студия `app/admin/`

| Путь | Файл | Назначение |
|---|---|---|
| `/admin` | `page.tsx` | `isSuperAdmin()` → `<SuperAdmin />` из `главная/SuperAdmin.tsx` (4688 строк) |
| `/admin/preview/tenant` | `preview/tenant/page.tsx` + `TenantPreview.tsx` | Предпросмотр кабинета предпринимателя |
| — | `chat-actions.ts`, `data-actions.ts`, `platform-actions.ts` | Server actions студии (том 06) |

`SuperAdmin.tsx` — клиентский компонент с 7 группами меню (см. том 05), собственными вкладками настроек (Платформа, Биллинг, Безопасность, Уведомления, API), палитрой команд (⌘K-подобная: «Добавить бизнес», «Отправить рассылку», «Сгенерировать API-ключ», «Включить/выключить шаблон», «Сменить пароль админа»), demо-режимом `saas_admin_demo` в localStorage.

## 6. Партнёрский кабинет `app/partner/`

| Путь | Файл | Назначение |
|---|---|---|
| `/partner` | `page.tsx` | `readPartnerSession()` → данные → `PartnerShell` + `demo={isDemoPartner(...)}` |
| `/partner/login` | `login/page.tsx` | `redirect('/auth')` |
| `/partner/demo` | `demo/page.tsx` | `redirect('/api/demo/partner')` |
| — | `layout.tsx` | `force-dynamic`, без обёртки |
| — | `PartnerShell.tsx` | Клиентская оболочка: 8 разделов (том 05) |
| — | `components.tsx` | `LeadsManager`, `PartnerWorkspace` (лиды, сайты-визитки, новый счёт) |
| — | `ready-panel.tsx` | `PartnerReadyPanel` (готовые сервисы, фото, итоги) |
| — | `actions.ts`, `admin-actions.ts`, `ready-actions.ts` | Server actions (том 06) |

## 7. Демо `app/demo/`

| Путь | Поведение |
|---|---|
| `/demo` | Лаунчер: тёмный сайдбар, шапка «Демо-кабинеты», 2 карточки «Кабинет партнёра» / «Кабинет предпринимателя» |
| `/demo/business` | `redirect('/api/demo/owner')` |
| `/partner/demo` | `redirect('/api/demo/partner')` |
| `/api/demo/partner` | Создаёт демо-партнёра (идемпотентно), ставит `partner_session`, редиректит `/partner` |
| `/api/demo/owner` | Создаёт демо-бизнес + владельца, `passwordSignIn`, `startSession('owner')`, редиректит `/m/demo/panel` |

## 8. Middleware-маршрутизация (`middleware.ts`)

`matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js).*)']`.

Порядок обработки каждого запроса:

1. `isForeignOrigin(req, host)` — для POST/PUT/PATCH/DELETE с чужим `Origin` → `403 { ok:false, reason:'bad_origin' }`. Без `Origin` (webhook, cron, сервер лицензий) — пропуск.
2. `licenseBlocked()` — если задан `LICENSE_ID`: фоном `pingLicense()` (не чаще суток, при `unknown` — час), блокировка по `license_status=blocked` cookie → `rewrite('/blocked')` + `X-Robots-Tag: noindex`.
3. Если `!isMainHost(host) && !isSystemPath(path)` → `customDomain()`:
   - есть валидная подписанная cookie `domain_map` → убрать маркер (307) либо `rewrite` в `/{prefix}/{slug}{path}` (+ noindex для не-client и служебных путей);
   - `path === '/'` без cookie → `rewrite('/domain-site/by-domain?domain=<host>')`;
   - остальные подпути без cookie → `rewrite('/api/resolve-domain')` с заголовками `x-resolve-host`, `x-resolve-next`, `x-resolve-retry`.
4. На основном хосте `path.startsWith('/domain-site')` → 404.
5. Иначе `NextResponse.next()` + `X-Robots-Tag: noindex, nofollow` для `/preview/`, `/panel`, `/admin`, `/dev`, `/partner`, `/{prefix}/{slug}/panel`, всех `/api/`.

`isMainHost` (`общие/lib/site.ts`): `MAIN_HOSTS` = `[apex, www.apex, 'localhost', '127.0.0.1']` из `NEXT_PUBLIC_SITE_URL` + `NEXT_PUBLIC_MAIN_HOSTS`; любой `*.vercel.app` тоже основной. Пустой/некорректный host считается основным.

`/api/resolve-domain` (два режима): JSON `?host=` с кэшем 60 с в памяти (лимит 1000 записей, отрицательные результаты тоже кэшируются) и rate limit 60/мин на IP через Postgres (fail open), либо redirect-режим из middleware с подписанной cookie `domain_map` (TTL из `domain-map.ts`) и 307.

## 9. Редиректы, заложенные в страницах

| Откуда | Куда | Условие |
|---|---|---|
| `/panel` | `/admin` | всегда |
| `/partner/login` | `/auth` | всегда |
| `/partner/demo` | `/api/demo/partner` | всегда |
| `/demo/business` | `/api/demo/owner` | всегда |
| `/panel/*` | `/panel/login` | не супер-админ |
| `/{prefix}/{slug}/panel/*` | `…/panel/login` | нет membership/рефреш сессии |
| `/partner` | `/partner/login` | нет партнёрской сессии |
| `/{prefix}/{slug}` | новый URL | `resolveBusiness` вернул `redirect` (slug_history) → `permanentRedirect` (308) |
| `/{prefix}/{slug}` | 404 | `notfound` |
| `/api/health` | 503 | БД недоступна / env не настроены |
| Cron без Bearer | 401 | `requireCron` |
| Неизвестный cron-джоб | 404 | `handleCronRequest` |
