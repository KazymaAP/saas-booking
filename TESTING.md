# TESTING — проверки saas-booking

Автотестов (unit, e2e) в проекте нет: ТЗ §0.4 — «Тесты — не пишем (вне MVP)». Качество держится на четырёх уровнях:

| Уровень | Инструмент | Когда | Время |
|---|---|---|---|
| 1. Типы | `pnpm typecheck` | перед каждым коммитом | ~30 с |
| 2. Сборка | `pnpm build` | перед пушем в `main` | 1–3 мин |
| 3. Smoke-test | `scripts/smoke-test.sh` | после каждого деплоя | ~10 с |
| 4. Ручные сценарии | этот документ | перед релизом и после изменений в брони, почте, оплате | 20–40 мин |

## Оглавление

1. [Быстрый запуск](#быстрый-запуск)
2. [Типы и сборка](#типы-и-сборка)
3. [Smoke-test](#smoke-test)
4. [Проверка API через curl](#проверка-api-через-curl)
5. [Проверка БД](#проверка-бд)
6. [Сквозной сценарий](#сквозной-сценарий)
7. [Ручные сценарии по разделам](#ручные-сценарии-по-разделам)
8. [Что покрыто](#что-покрыто)
9. [Как добавить проверку](#как-добавить-проверку)

## Быстрый запуск

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm build
bash scripts/smoke-test.sh https://zapishisya.ru
```

Windows: `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` — install, typecheck и build одной командой,
результат в `check-log.txt` (блок `=== summary ===`).

## Типы и сборка

| Команда | Что проверяет | Ожидаемый результат |
|---|---|---|
| `pnpm typecheck` | `tsc --noEmit`, strict | exit 0, без вывода ошибок |
| `pnpm build` | компиляция Next.js, генерация 31 статической страницы | exit 0, таблица маршрутов (`ƒ` — динамические, `○` — статические) и строка `ƒ Middleware` |
| `pnpm lint` | — | не настроен: нет `.eslintrc`, `next lint` задаёт интерактивный вопрос и завершается с кодом 1 |

`pnpm build` не обращается к Supabase, но читает переменные окружения. Для локальной сборки без реального проекта
достаточно фиктивных значений:

```bash
cat > .env.local <<'EOF'
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
SUPABASE_SERVICE_ROLE_KEY=dummy
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
CRON_SECRET=local-secret
EOF
pnpm build
```

Сборке нужно около 2 ГБ свободной памяти. На машине с 1 ГБ она уходит в своп и не завершается.

## Smoke-test

```bash
bash scripts/smoke-test.sh <BASE_URL> [<prefix>/<slug>]
```

| Аргумент / переменная | Назначение |
|---|---|
| `BASE_URL` | адрес деплоя, обязателен: `https://zapishisya.ru`, `https://<project>.vercel.app`, `http://localhost:3000` |
| `<prefix>/<slug>` | публичный сайт бизнеса со статусом `client`, например `t/shinomontazh-koleso` |
| `SMOKE_SITE` | то же, что второй аргумент |
| `CRON_SECRET` | если задан — дополнительно проверяется `GET /api/cron/cleanup-slots` с секретом (200) |
| `SMOKE_TIMEOUT` | таймаут одного запроса, секунд (по умолчанию 15) |
| `SMOKE_STRICT=1` | `WARN` считается ошибкой |

Что проверяется:

| № | Проверка | Ожидание | Если нет |
|---|---|---|---|
| 1 | `GET /api/health` | 200 | `WARN`: эндпоинта нет в коде (ТЗ §3.2), не ошибка |
| 2 | `GET /` | 200, есть `<html` | `FAIL` |
| 3 | `GET /panel/login` | 200, есть форма с `password` | `FAIL` |
| 4 | `GET /sitemap.xml` | 200, есть `<urlset` | `FAIL` (часто — нет связи с Supabase) |
| 5 | `GET /robots.txt` | 200, есть `Disallow: /preview/` и `Sitemap:` | `FAIL` |
| 6 | заголовки `/` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` | `FAIL` |
| 7 | `GET /api/cron/send-emails` без секрета | 401 | `FAIL`: cron открыт |
| 8 | `GET /preview/smoke-test-nonexistent` | 404 | `FAIL`: прототипы открыты без токена |
| 9 | `GET /{prefix}/{slug}` | 200, есть `application/ld+json` | `FAIL`; без аргумента — `SKIP` |
| 10 | `GET /api/cron/cleanup-slots` с `CRON_SECRET` | 200, `"ok":true` | `FAIL`; без переменной — `SKIP` |

Код выхода: `0` — нет `FAIL`; `1` — есть хотя бы один `FAIL`; `2` — неверные аргументы или нет `curl`.

Пример вывода на свежем деплое:

```
saas-booking smoke-test → https://zapishisya.ru
WARN  /api/health                 404 (эндпоинт не реализован, см. TESTING.md)
OK    /                           200
OK    /panel/login                200
OK    /sitemap.xml                200
OK    /robots.txt                 200
OK    security headers            X-Frame-Options, X-Content-Type-Options
OK    cron без секрета            401
OK    preview без токена          404
SKIP  публичный сайт              не указан <prefix>/<slug>
SKIP  cron с секретом             CRON_SECRET не задан
Итог: 7 OK, 1 WARN, 0 FAIL, 2 SKIP
```

## Проверка API через curl

Подставьте свои значения: `BASE=https://zapishisya.ru`, `PREFIX=t`, `SLUG=<slug>`, `SERVICE=<uuid услуги>`.

Свободные слоты:

```bash
curl -s "$BASE/api/bookings/slots?prefix=$PREFIX&slug=$SLUG&serviceId=$SERVICE&date=2026-10-20"
# {"ok":true,"slots":["2026-10-20T07:00:00.000Z", ...]}   время в UTC, бизнес — UTC+3
```

Создание брони (возьмите `startsAt` из ответа выше):

```bash
curl -s -X POST "$BASE/api/bookings" -H 'Content-Type: application/json' -d '{
  "prefix":"'$PREFIX'","slug":"'$SLUG'","serviceId":"'$SERVICE'",
  "date":"2026-10-20","startsAt":"2026-10-20T07:00:00.000Z",
  "name":"Тест Смоук","phone":"+7 (900) 000-00-00","privacyAccepted":true}'
# 201 {"ok":true,"bookingId":"…","cancelToken":"…","status":"new"}
```

Повтор того же запроса → `409 {"ok":false,"reason":"slot_taken"}`. Шестой запрос с одного IP за 10 минут →
`429 rate_limited`.

Отмена:

```bash
curl -s -X POST "$BASE/api/bookings/<cancelToken>/cancel"
# {"ok":true,"status":"cancelled"}; повтор — тот же ответ (идемпотентно)
```

Ответы с ошибкой:

| Код | `reason` | Когда |
|---|---|---|
| 400 | `validation` | не прошла zod-схема или телефон |
| 400 | `service_not_found` | услуга не принадлежит бизнесу или выключена |
| 404 | `not_found` | бизнес не `client`, неверный префикс или токен |
| 409 | `slot_taken` | слот занят или вне расписания |
| 409 | `too_late` | до записи меньше `cancel_hours_before` часов (в ответе `phone` бизнеса) |
| 429 | `rate_limited` | превышен лимит по IP |

Cron вручную:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/booking-reminders"   # {"ok":true,"sent":N}
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/follow-up"           # {"ok":true,"job":"follow-up","result":{…}}
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/unknown"             # 404 unknown_job
```

Webhook Telegram без секрета → 401:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/telegram/webhook" -d '{}'
```

## Проверка БД

После миграций и при подозрении на расхождение схемы — в Supabase SQL Editor:

```sql
-- RLS включён везде (ожидается 0 строк)
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;

-- Защита от двойной брони на месте
select indexdef from pg_indexes where indexname = 'bookings_slot_unique';

-- 11 ниш с префиксами
select url_prefix, slug from vertical_templates order by url_prefix;

-- Воронка
select status, count(*) from businesses group by status order by 2 desc;

-- Ящики и лимиты
select email, active, sent_today, daily_limit, last_reset from email_accounts;

-- Последние ошибки
select created_at, action, payload from audit_log where action like 'error:%' order by created_at desc limit 20;

-- Кандидаты на ночное удаление cleanup-prototypes (проблема 30 в PROGRESS.md): должны быть только ненужные
select id, name, created_at from businesses
where status = 'archived' and created_at < now() - interval '120 days'
  and (subscription_until is not null or code_transferred_at is not null);
```

Последний запрос показывает бывших клиентов, которых удалит ближайший запуск `cleanup-prototypes` (02:00 UTC).
Пустой результат — норма. Если строки есть, а бизнес нужен, — переведите его из `archived` в `in_progress`
(`/panel/businesses` → массовая смена статуса) до запуска задачи.

## Сквозной сценарий

Выполняется на стенде или проде с тестовым бизнесом. Отмечайте каждый шаг.

| № | Действие | Ожидание |
|---|---|---|
| 1 | `/panel/businesses` → импорт xlsx 2GIS, сначала «Только проверить» | статистика: всего, по фильтру, с email; в БД ничего не появилось |
| 2 | импорт без флажка | «создано N»; бизнесы в шаге 1 воронки |
| 3 | `/panel/funnel` шаг 1: отметить тестовый бизнес → «В работу» | бизнес в шаге 2 |
| 4 | шаг 2: генерация | прогресс-бар; бизнес в шаге 3 со ссылкой «Открыть» |
| 5 | открыть прототип | сайт с услугами ниши, плашка демо; без `?token=` — 404 |
| 6 | шаг 3: «Одобрить» | бизнес в шаге 4, предпросмотр письма с подставленным `{name}` и ссылкой |
| 7 | шаг 4: «Отправить всем одобренным» + вызвать `send-emails` | письмо пришло; статус `sent`; в шаге 5 «Отправлено» +1 |
| 8 | открыть письмо, кликнуть ссылку | «Открыто» и «Клик» +1; редирект на прототип |
| 9 | ответить на письмо + вызвать `check-replies` | письмо в `/panel/inbox`; статус бизнеса `replied` |
| 10 | `/panel/clients` → «Оплата» | статус `client`, подписка до +30 дней; Telegram оператору «💰 Оплата» |
| 11 | «Создать доступ» с email владельца | пароль показан один раз; повторное открытие страницы — пароля нет |
| 12 | `/{prefix}/{slug}/panel/login` под владельцем | дашборд с чек-листом готовности |
| 13 | кабинет → «Настройки»: часы `10:00-19:00` на будни | сохранено, сайт показывает часы |
| 14 | кабинет → «Уведомления» → «Создать код» → `/start BIZ-xxxxxx` боту | «Готово»; кабинет показывает «Telegram подключён» |
| 15 | публичный сайт → запись с телефона | 201; Telegram бизнесу «🎉 Новая запись»; письмо на email бизнеса |
| 16 | та же запись повторно | «Слот занят» |
| 17 | кабинет → «Брони» → «Подтвердить» | статус `confirmed`; письмо клиенту, если он указал email |
| 18 | ссылка отмены из ответа брони | «Запись отменена»; Telegram бизнесу «❌ Запись отменена клиентом» |
| 19 | кабинет → «Данные» → «Скачать CSV» | файл `bookings-<slug>-<дата>.csv` открывается в Excel с кириллицей |
| 20 | `/panel/clients` → «Передать код» | ZIP скачан; в `/panel/licenses` появилась лицензия |

## Ручные сценарии по разделам

### Бронирование

- Запись за `min_hours_before` часов до начала не предлагается; дальше `max_days_ahead` — тоже.
- Выходной (пустая строка часов) — слотов нет.
- Услуга 90 минут при закрытии в 19:00 — последний слот 17:30 при шаге 30 минут.
- Перенос на занятое время → `slot_taken`; на свободное — бронь переносится, бизнес получает «🔄 Запись перенесена».
- Отмена позже `cancel_hours_before` → `too_late` и телефон бизнеса.

### Кабинет

- Менеджер не видит «Настройки», «Подписка», «Команда»; прямой URL `…/panel/settings` не даёт сохранить
  (сообщение «Только владелец может менять настройки»).
- Фото больше 5 МБ или не jpg/png/webp не загружается.
- Владелец чужого бизнеса по URL `/{prefix}/{чужой-slug}/panel` попадает на страницу входа.

### Супер-админка

- Без входа любой `/panel/*` → `/panel/login`.
- `/panel/email-accounts` → «Тест подключения» и «Тестовое письмо» для каждого ящика.
- `/panel/backup` → «Сделать копию сейчас» → файл в списке, «Скачать» работает 5 минут.
- `/panel/licenses` → блокировка лицензии → копия клиента после следующего ping показывает `/blocked`.

### Кастомный домен

- `https://<домен>/` — сайт бизнеса; `/panel` — вход в кабинет; `/sitemap.xml` — карта основного сайта.
- Неизвестный домен, направленный на проект, → 404.

## Что покрыто

| Область | typecheck | build | smoke | curl | ручные |
|---|---|---|---|---|---|
| Типы, импорты, сигнатуры server actions | да | да | — | — | — |
| Доступность страниц и SEO | — | — | да | — | да |
| Security headers, закрытые cron и превью | — | — | да | да | — |
| Слоты, бронь, отмена, перенос | — | — | частично | да | да |
| Rate limit | — | — | — | да | — |
| Рассылка, трекинг, IMAP | — | — | — | частично | да |
| Telegram | — | — | — | частично | да |
| Оплата, доступы, передача кода, лицензии | — | — | — | — | да |
| Миграции и RLS | — | — | — | — | SQL-запросы |

Не покрыто ничем автоматическим: расчёт слотов (`lib/slots.ts`), разбор 2GIS (`lib/import2gis.ts`), транслит
(`lib/slug.ts`), телефон (`lib/phone.ts`), шифрование (`lib/crypto.ts`). Это чистые функции — первые кандидаты на
unit-тесты, если команда решит их добавить.

## Как добавить проверку

### В smoke-test

Проверки — вызовы функции `check` в `scripts/smoke-test.sh`:

```bash
# check <название> <путь> <ожидаемый HTTP-код> [<подстрока в теле>]
check "оферта" "/oferta" 200 "<html"
```

Правила: только `GET` без побочных эффектов; не создавать брони и не слать письма; одна проверка — одна строка
вывода. После правки запустите скрипт против `http://localhost:3000` и против прода.

### Unit-тесты (если будут добавлены)

ТЗ не требует тестов. Если решение изменится, рекомендуемый минимальный путь без новых конфигов:

1. `pnpm add -D vitest`.
2. Скрипт `"test": "vitest run"` в `package.json`.
3. Файлы рядом с модулем: `lib/slots.test.ts`, `lib/phone.test.ts`.
4. Запись решения в [DECISIONS.md](DECISIONS.md) и строка в [CHANGELOG.md](CHANGELOG.md).

Пример первого теста для `lib/phone.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('приводит 8-900 к +7', () => expect(normalizePhone('8 (900) 123-45-67')).toBe('+79001234567'));
  it('отклоняет короткий номер', () => expect(normalizePhone('12345')).toBeNull());
});
```

### Ручной сценарий

Добавьте строку в таблицу [сквозного сценария](#сквозной-сценарий) или пункт в раздел по области: действие и
наблюдаемый результат, без «проверить, что работает».
