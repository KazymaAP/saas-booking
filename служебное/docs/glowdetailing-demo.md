# Демо-тенант детейлинга «GlowDetailing»

Интеграция из отдельного проекта `D:\Clode\Детейленг` (Vite-PWA) в эту SaaS-платформу.
Исходная папка **не изменялась и не удалялась** — данные и фото скопированы.

## Что перенесено

| Данные | Источник (`Детейленг`) | Куда в SaaS |
|---|---|---|
| Бренд, контакты, адрес, рейтинг | `src/instance.ts` (tenant `demo`) | строка `businesses` со `slug='glowdetailing'` |
| 5 услуг с ценами и длительностью | `src/instance.ts` → `services[]` | таблица `services` |
| График работы (пн–пт 9–21, сб 10–20, вс 10–18) | `workHours` | `businesses.working_hours` |
| Правила брони (окно 30 дней, отмена за 24 ч, авто-подтверждение) | `booking` | `slot_step_minutes`, `max_days_ahead`, `cancel_hours_before`, `min_hours_before`, `auto_confirm` |
| Тексты hero / «О нас» | `tagline`, `description` | `businesses.custom_texts` |
| 3 фотографии (hero + 2 работы) | `public/media/demo/*.jpg` | `public/media/glowdetailing/*.jpg` + строки `photos` |

## Адрес сайта

После применения миграции сайт открывается по адресу:

```
/d/glowdetailing
```

(`d` — `url_prefix` шаблона «Детейлинг» из `0003_seed.sql`.)

Публичный доступ требует `status='client'` **и** `subscription_active=true` — см.
`resolveBusiness()` в `lib/business.ts`. Миграция выставляет оба условия.

## Как применить

Миграция идемпотентна (`on conflict (slug) do nothing`, вставка услуг/фото — только если их нет).

```bash
# вариант 1: раннер по каталогу (накатит только новую 0015)
MIGRATION_DB_URL="postgresql://..." node служебное/scripts/apply-migrations.cjs

# вариант 2: Management API (без прямого порта к БД)
SUPABASE_MANAGEMENT_TOKEN=... SUPABASE_PROJECT_REF=oryzoexstuzgpbqvpjbr \
  node служебное/scripts/apply-migrations-api.cjs
```

## Что намеренно НЕ копировалось

- **CSS других ниш** (`public/assets/studio.css`, `studio-site.css`) — они используются шаблоном `StudioTemplate` для остальных 10 ниш; перезапись сломала бы их. Для детейлинга используется точный скомпилированный CSS «Детейленг» — `public/assets/detailing-scoped.css` (+ `detailing-fonts.css`).
- **Движок доступности/токены/валидация** — в SaaS свои реализации (`lib/availability.ts`, `lib/booking-*`, `lib/slots.ts`); дублирование кода не нужно.
- **PWA-манифесты и иконки** — SaaS генерирует их на маршруте `app/[prefix]/[slug]/manifest.webmanifest`.
- **Node-модули, `dist`, `.git`** — артефакты, не переносятся.

## Связанные файлы

- `supabase/migrations/0015_glowdetailing_demo.sql` — сид тенанта.
- `public/media/glowdetailing/` — 3 фотографии.
- `detailing-reference.md` — справочник по нише (таксономия услуг, FAQ, UX-паттерны), импортирован из `Детейленг`.
