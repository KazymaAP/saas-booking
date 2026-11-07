# Шаблон детейлинга 1:1 с «Детейленг»

Порт публичного сайта детейлинга из `D:\Clode\Детейленг` в Next.js SaaS. Цель — **визуально 1:1**.
Достигается не «похожей вёрсткой», а двумя вещами:

1. **Точный скомпилированный CSS** оригинала (`dist/assets/index-Cks6VxPO.css`, 68 КБ) — тот же файл, что использует «Детейленг».
2. **Точная разметка и те же className**, что в `TenantLayout.tsx` / `Home.tsx` / `BookingFlow.tsx`.

Исходная папка `Детейленг` не изменялась (только чтение/копирование).

## Файлы

| Файл | Роль |
|---|---|
| `public/assets/detailing-scoped.css` | Точный CSS «Детейленг», прогнанный через PostCSS: каждый селектор под `.detailing-root` (чтобы не конфликтовать с `globals.css` SaaS: светлый `body`, свои `.btn-primary`/`.input`). |
| `public/assets/detailing-fonts.css` | `@font-face` Inter на локальные woff2 (в оригинале Inter грузится из Google Fonts). |
| `components/templates/DetailingSite.tsx` | Клиентский шаблон: точная разметка `TenantLayout` + `Home`, модалка `sheet` (BookingSheet). |
| `app/[prefix]/[slug]/DetailingBookingFlow.tsx` | 4-шаговый визард с точными классами `BookingFlow` (step-bar, day-chip, time-chip, service-row, input, btn-*). |
| `lib/detailing-tenant.ts` | Адаптер SaaS → форма `TenantConfig`: бизнес/услуги/фото → поля `Детейленг`; `getStudioStatus` и форматтеры перенесены 1:1. |
| `app/[prefix]/[slug]/page.tsx` | Ветвление: ниша `detailing` (`prefix='d'`) → `DetailingSite`, иначе прежний `StudioTemplate`. |

## Почему CSS скоуплен

`app/globals.css` SaaS задаёт светлый `body` и свои `.btn-primary` / `.input` / `.label`. Если подключить CSS «Детейленг» как есть, результат зависит от порядка загрузки. Поэтому селекторы обёрнуты в `.detailing-root` (специфичность `.detailing-root .btn-primary` = 0,2,0 выше, чем `.btn-primary` = 0,1,0), а `html`/`body`/`:root` заменены на `.detailing-root`. Плюс на время страницы выставляются `background:#000` и `color-scheme:dark` на `html/body`.

## Что идентично

- Палитра и токены (`--color-bg/surface/elevated/border/text/muted/subtle/accent/...`), Inter, тёмная тема.
- Все кастомные классы: `pill-glass`, `hero-frame`, `bottom-nav`, `service-row-flat`, `icon-badge-neutral`, `dot-matrix`, `footer-bar`, `step-bar`, `day-chip`, `time-chip`, `sheet`, `sheet-backdrop`, `press`, `safe-area-*`.
- Разметка главной: топбар, hero 16/10 (3.72/1 desktop), заголовок, 3 карточки статистики, список услуг, галерея, 3 инфо-карточки, карточка записи, адрес/график, установка, футер, нижняя навигация.
- Визард: прогресс-бар, чипы дней, **полная сетка времени** (занятые — серые, `disabled`), поля, сводка, «Готово».
- Модалка записи (`sheet`) и FAB-кнопка — те же классы и позиционирование.

## Что отличается по поведению (не по внешнему виду)

- **Успех записи** остаётся в модалке (шаг «Готово»), а не переходит на отдельную страницу «Моя запись».
- **Чат-ассистент** не используется — удалён из проекта по требованию.
- **Ресурсы/боксы** — 2 бокса статикой (в SaaS нет таблицы ресурсов), поэтому статистика «боксы в работе» = 2.
- **Инфо-карточки** — 3 карточки демо-студии (в SaaS нет `infoCards` у бизнеса).
- **Отдельные страницы** `/services`, `/account`, `/install` не создавались: навигация — якоря на одной странице.
- **`liquid-gl`** (WebGL-стекло кнопки) не подключён — используется CSS `backdrop-blur` из того же CSS.

## Как посмотреть

Нужны реальные ключи Supabase и применённая миграция `0015_glowdetailing_demo.sql`. Адрес:

```
/d/glowdetailing
```

Без ключей `resolveBusiness` вернёт 404, поэтому визуальная проверка возможна только на стенде с БД.
