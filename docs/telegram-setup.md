# Telegram: один бот и webhook

Инструкция для оператора: создать бота, получить токен и chat id, задать переменные окружения,
зарегистрировать webhook и проверить, что уведомления доходят. Время — 15 минут.

В примерах домен сервиса — `zapishisya.ru`. Замените на свой.

## Оглавление

1. [Зачем один бот](#зачем-один-бот)
2. [Создание бота в @BotFather](#шаг-1-создание-бота-в-botfather)
3. [Токен и chat id оператора](#шаг-2-токен-и-chat-id-оператора)
4. [Секрет webhook](#шаг-3-секрет-webhook)
5. [Переменные окружения](#шаг-4-переменные-окружения)
6. [Регистрация webhook](#шаг-5-регистрация-webhook)
7. [Проверка](#шаг-6-проверка)
8. [Подключение владельца](#подключение-владельца)
9. [Что приходит оператору](#что-приходит-оператору)
10. [Копия клиента](#копия-клиента)
11. [Смена токена и отключение](#смена-токена-и-отключение)
12. [Частые ошибки](#частые-ошибки)

## Зачем один бот

Один бот обслуживает обе роли через единый webhook `/api/telegram/webhook`:

| Роль | Кто пишет боту | Webhook | Токен | Секрет webhook | Код |
|---|---|---|---|---|---|
| Оператор + владельцы бизнесов | только вы (команды) и владельцы (`/start BIZ-…`) | `/api/telegram/webhook` | `TELEGRAM_BOT_TOKEN` | `TELEGRAM_WEBHOOK_SECRET` | `lib/notify.ts`, `lib/telegram-admin.ts`, `app/api/telegram/webhook/route.ts` |

Команды оператора (`/stats`, `/ping`, `/health`) обрабатываются **только** из чата `TELEGRAM_CHAT_ID`.
`/start BIZ-xxxxxx` от владельца привязывает его чат к бизнесу — уведомления этого бизнеса идут только
в его чат (`businesses.telegram_chat_id`).

Имя секрета в коде — `TELEGRAM_WEBHOOK_SECRET`, с фолбэком на `TELEGRAM_BIZ_SECRET` (из ТЗ §18.1).
Используйте имя из кода.

> **Опционально:** можно задать `TELEGRAM_BUSINESS_BOT_TOKEN` + `TELEGRAM_BUSINESS_BOT_USERNAME`, тогда
> бизнес-уведомления отправляются отдельным ботом, а операторские команды — основным. Webhook регистрируется
> на один и тот же адрес `/api/telegram/webhook` для обоих ботов (с одним и тем же `TELEGRAM_WEBHOOK_SECRET`).
> По умолчанию (один бот) этот шаг не нужен — уведомления идут от того же бота.

## Шаг 1. Создание бота в @BotFather

Откройте <https://t.me/BotFather> и:

1. `/newbot`.
2. Отображаемое имя, например `Запишися — бот`.
3. Username, оканчивающийся на `bot`, например `zapishisya_bot`.
4. BotFather пришлёт токен вида `123456789:AA…`. Это секрет: не публикуйте его и не коммитьте.

Рекомендуемые настройки:

| Команда BotFather | Значение |
|---|---|
| `/setdescription` | «Уведомления о новых записях, отменах и переносах. Подключение — код из кабинета.» |
| `/setcommands` | `start - Подключить уведомления` + `stats - Сводка по бизнесам` + `stop - Отключить уведомления` + `help - Помощь` |
| `/setjoingroups` | `Enable` (по умолчанию) — владелец может подключить общий чат сотрудников |

## Шаг 2. Токен и chat id оператора

`TELEGRAM_CHAT_ID` — числовой id вашего личного чата с ботом. На него уходят все служебные уведомления,
и только этому чату бот отвечает на `/stats`, `/ping`, `/health`.

Получение chat id — до регистрации webhook (пока webhook включён, `getUpdates` не работает):

1. Напишите боту любое сообщение, например `/start`.
2. Выполните:

   ```bash
   export TELEGRAM_BOT_TOKEN='<токен бота>'
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*'
   # "chat":{"id":123456789
   ```

3. Число после `"id":` — это `TELEGRAM_CHAT_ID`.

Если webhook уже зарегистрирован, сначала снимите его: `curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"`,
получите id, затем зарегистрируйте webhook заново (шаг 5).

Важно: уведомления о лицензиях (`/api/license/ping`) отправляются в `TELEGRAM_CHAT_ID`. Чтобы они доходили,
нажмите **Start** у бота — иначе Telegram не даст боту написать вам первым.

## Шаг 3. Секрет webhook

Telegram передаёт секрет в заголовке `X-Telegram-Bot-Api-Secret-Token` при каждом запросе. Код сравнивает его
с переменной окружения и при несовпадении или пустой переменной отвечает `403`. Допустимые символы — `A-Z`, `a-z`,
`0-9`, `_`, `-`, длина до 256. Сгенерируйте одно значение:

```bash
openssl rand -hex 32   # TELEGRAM_WEBHOOK_SECRET
```

## Шаг 4. Переменные окружения

**Vercel → Project → Settings → Environment Variables**, окружение **Production** (и **Preview**, если проверяете
на превью). Локально — в `.env.local`.

| Переменная | Пример | Где взять | Без неё |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123456789:AA…` | BotFather | нет уведомлений и команд оператора (`/stats` молчит) |
| `TELEGRAM_CHAT_ID` | `123456789` | шаг 2 | то же |
| `TELEGRAM_WEBHOOK_SECRET` | 64 hex-символа | шаг 3 | webhook отвечает `403`, код `BIZ-…` не привязывается |
| `TELEGRAM_BUSINESS_BOT_TOKEN` | `987654321:BB…` | BotFather (опц.) | уведомления бизнесам идут от того же бота (фолбэк на `TELEGRAM_BOT_TOKEN`) |
| `TELEGRAM_BUSINESS_BOT_USERNAME` | `zapishisya_notify_bot` (без `@`) | BotFather (опц.) | в кабинете вместо имени бота написано «бот» |

После изменения переменных — **Deployments → ⋯ → Redeploy**: Vercel применяет переменные только к новому деплою.

Проверить, что переменные видны приложению: `/panel/settings` → блок **Интеграции (из окружения)** показывает,
заданы ли `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.

## Шаг 5. Регистрация webhook

Выполняется один раз после деплоя и повторно — при смене домена, токена или секрета. Адрес должен быть HTTPS.

```bash
export SITE=https://zapishisya.ru
export TELEGRAM_BOT_TOKEN='<токен бота>'
export TELEGRAM_WEBHOOK_SECRET='<секрет из шага 3>'

# Один бот — один webhook
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=$SITE/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message"]' \
  -d "drop_pending_updates=true"
```

Ожидаемый ответ:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

Обработчик читает только `update.message`, поэтому `allowed_updates=["message"]` убирает лишние вызовы.
`drop_pending_updates=true` отбрасывает сообщения, накопившиеся до регистрации.

Не регистрируйте webhook на адрес превью Vercel (`*.vercel.app` с хешем): после следующего деплоя он станет
недоступен или защищён Vercel Authentication.

> Если используете отдельный бизнес-бот (`TELEGRAM_BUSINESS_BOT_TOKEN`), зарегистрируйте его webhook на тот же
> адрес `$SITE/api/telegram/webhook` с тем же `TELEGRAM_WEBHOOK_SECRET`.

## Шаг 6. Проверка

1. Состояние webhook:

   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```

   В ответе `url` — ваш адрес, `pending_update_count` близок к `0`, поля `last_error_message` нет.

2. Защита webhook — без секрета `403`:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SITE/api/telegram/webhook" -d '{}'        # 403
   ```

3. Бот: отправьте `/stats` из чата `TELEGRAM_CHAT_ID` → ответ вида

   ```text
   Бизнесов: 120
   Клиентов: 3
   Отправлено писем: 45
   ```

   «Отправлено писем» — число бизнесов в статусе `sent`, а не число писем.

4. Отправка от имени приложения (проверяет токен и chat id без участия webhook):

   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
     -d "chat_id=$TELEGRAM_CHAT_ID" -d "text=Проверка saas-booking"
   # {"ok":true,"result":{...}}
   ```

5. Подключение владельца — сценарий из раздела [Подключение владельца](#подключение-владельца) на демо-бизнесе.

## Подключение владельца

Как владелец подключает уведомления — **тот же бот**, что и у оператора:

1. Кабинет `/{prefix}/{slug}/panel/notifications` → **Создать код**. В таблицу `business_telegram_codes`
   записывается код вида `BIZ-a1b2c3` (6 hex-символов).
2. Кабинет показывает: «Ваш код: BIZ-a1b2c3 — отправьте боту @<username>: `/start BIZ-a1b2c3`».
3. Владелец открывает бота, отправляет `/start BIZ-a1b2c3`.
4. Бот отвечает «Готово. Уведомления о записях будут приходить сюда.», в `businesses` заполняются
   `telegram_chat_id` и `telegram_connected_at`, код помечается `used_at`.
5. Кабинет показывает «Telegram подключён» и кнопку **Отключить**.

Ответы бота:

| Сообщение владельца | Ответ |
|---|---|
| `/start` без кода или с кодом не того формата | «Чтобы подключить уведомления, откройте кабинет и скопируйте код вида BIZ-xxxxxx.» |
| `/start BIZ-…` с неизвестным или использованным кодом | «Код не найден или уже использован. Создайте новый в кабинете.» |
| любой текст не с `/start` | ответа нет |

Код одноразовый. Срок жизни кода (15 минут по ТЗ §18.3) в коде не проверяется: неиспользованный код действует
до использования. Ссылку `https://t.me/<username>?start=BIZ-a1b2c3` бот тоже примет — Telegram превращает её
в команду `/start BIZ-a1b2c3`.

Что приходит владельцу в Telegram:

| Событие | Текст | Откуда |
|---|---|---|
| Новая бронь | `🎉 Новая запись`, название бизнеса, услуга и время (МСК), имя и телефон клиента | `api/bookings` |
| Отмена клиентом | `❌ Запись отменена клиентом` | `api/bookings/{token}/cancel`, страница отмены |
| Перенос | `🔄 Запись перенесена` | `api/bookings/{token}/reschedule` |
| Бронь за 24 часа | `Скоро запись: Напоминаем: …` | cron `booking-reminders` |
| Бронь `new` старше 24 часов | `Бронь ждёт подтверждения: …` | cron `unconfirmed-reminder` |

Те же события, кроме напоминания за 24 часа, дублируются письмом на первый адрес из `businesses.emails`.
Два последних события приходят, только если внешний планировщик вызывает cron-задачи
([DEPLOY.md, шаг 9](../DEPLOY.md#шаг-9-частые-cron-задачи)).

Несколько чатов на один бизнес не поддерживаются: новый `/start` с новым кодом заменяет `telegram_chat_id`.
Чтобы уведомления видели несколько сотрудников, владелец создаёт группу, добавляет в неё бота и отправляет
в группе `/start BIZ-…` — привязывается чат группы.

## Что приходит оператору

Из чата `TELEGRAM_CHAT_ID` бот принимает команды `/stats`, `/ping`, `/health` и присылает служебные уведомления:

| Событие | Текст | Откуда |
|---|---|---|
| Каждая новая бронь любого бизнеса | `🎉 Бронь: <бизнес>, <имя клиента>, <время ISO>` | `api/bookings` |
| Оплата | `💰 Оплата 5000 ₽: бизнес <id>` | `/panel/clients` → оплата |
| Письмо рассылки не отправлено | `❌ SMTP error: письмо не отправлено` | cron `send-emails` |
| Запрос на удаление данных бизнеса | `🗑 Запрос на удаление: <бизнес> (<slug>), очистка <дата>` | кабинет → «Данные» |
| Домены не прошли проверку | `⚠️ Домены не проверены: …` | cron `check-domains` |
| Лицензия на чужом домене | `⚠️ Запуск на другом домене: …` | `api/license/ping` |
| Неизвестная лицензия | `🚨 Неизвестный запуск: …` | `api/license/ping` |

При большом числе клиентов уведомления о каждой брони становятся шумом. Отключить их можно только правкой кода
(`app/api/bookings/route.ts`, вызов `notifyAdmin`); в интерфейсе настройки нет.

Ответы оператору на входящие письма в Telegram не дублируются — смотрите `/panel/inbox`.

## Копия клиента

В копии, переданной по выкупу кода ([INSTALL.md](../INSTALL.md)), клиент использует собственный бот:

1. Шаг 1 — один бот.
2. Переменные: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
   (и опц. `TELEGRAM_BUSINESS_BOT_TOKEN` / `TELEGRAM_BUSINESS_BOT_USERNAME`).
3. Шаг 5: webhook на `https://<домен-клиента>/api/telegram/webhook`.
4. В кабинете **Уведомления → Создать код** → `/start BIZ-…`.

Бот оператора в копии клиента необязателен. Если `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` не заданы, служебные
уведомления просто не отправляются, ошибок нет.

## Смена токена и отключение

| Задача | Действия |
|---|---|
| Токен утёк | BotFather → `/revoke` → бот → новый токен в Vercel → Redeploy → шаг 5 заново |
| Смена домена сервиса | шаг 5 с новым `SITE` |
| Смена секрета webhook | новый секрет в Vercel → Redeploy → шаг 5 с новым секретом (до этого webhook отвечает `403`) |
| Временно отключить бота | `curl -s "https://api.telegram.org/bot<токен>/deleteWebhook"` |
| Владелец отключает уведомления | кабинет → **Уведомления → Отключить** (`telegram_chat_id = null`) |

Привязки владельцев (`telegram_chat_id`) не зависят от токена: после `/revoke` у того же бота чаты продолжают
работать. Если создан **новый** бот, все владельцы должны подключиться заново — новый бот не может писать
в чаты, где его не запускали.

## Частые ошибки

| Симптом | Причина | Решение |
|---|---|---|
| `getWebhookInfo`: `Wrong response from the webhook: 403 Unauthorized` | секрет в `setWebhook` не совпадает с переменной или переменная не задана | проверить переменную, Redeploy, повторить шаг 5 |
| `getWebhookInfo`: `404 Not Found` | неверный путь или домен не указывает на Vercel | путь `/api/telegram/webhook`, проверить DNS |
| `getWebhookInfo`: `SSL error` | сертификат ещё не выпущен | дождаться SSL в Vercel → Domains |
| `getWebhookInfo`: `Connection timed out` | домен не отвечает | `bash scripts/smoke-test.sh $SITE` |
| `getUpdates`: `Conflict: can't use getUpdates method while webhook is active` | webhook уже зарегистрирован | `deleteWebhook`, получить chat id, шаг 5 |
| `/stats` молчит, webhook без ошибок | `TELEGRAM_CHAT_ID` не совпадает с вашим чатом | шаг 2, Redeploy |
| Владелец отправил код, бот молчит | не задан `TELEGRAM_BOT_TOKEN` (бот принимает, но не может ответить) или webhook не зарегистрирован | шаг 4, шаг 5 |
| Кабинет показывает «Telegram подключён», уведомлений нет | владелец заблокировал бота | владелец разблокирует бота или отключает и подключает заново |
| Алерты лицензий не приходят | вы не запускали бота | нажать **Start** у бота |
| Уведомление о брони не пришло при спецсимволах в названии | бот шлёт с `parse_mode: HTML`; `<`, `>`, `&` в названии или имени клиента ломают разметку, Telegram отвечает `400` | убрать символы из названия бизнеса; email-уведомление при этом уходит |

Подробнее — [troubleshooting.md](troubleshooting.md#telegram-не-работает).

## Ссылки

- @BotFather — <https://t.me/BotFather>
- Bot API: `setWebhook` — <https://core.telegram.org/bots/api#setwebhook>
- Bot API: `getWebhookInfo` — <https://core.telegram.org/bots/api#getwebhookinfo>
- Bot API: `sendMessage` — <https://core.telegram.org/bots/api#sendmessage>
