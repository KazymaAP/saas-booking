# Troubleshooting — что делать при сбоях

Пошаговая диагностика для оператора. Каждый раздел: симптомы → как проверить → что делать.
Частые вопросы без сбоя — в [faq.md](faq.md).

В примерах домен сервиса — `zapishisya.ru`. Переменные для команд:

```bash
export SITE=https://zapishisya.ru
export CRON_SECRET='<значение из Vercel>'
```

## Оглавление

1. [Первые 5 минут](#первые-5-минут)
2. [Где смотреть логи](#где-смотреть-логи)
3. [Supabase упал](#supabase-упал)
4. [Vercel упал](#vercel-упал)
5. [SMTP не работает](#smtp-не-работает)
6. [IMAP: ответы не приходят](#imap-ответы-не-приходят)
7. [Telegram не работает](#telegram-не-работает)
8. [Cron не работает](#cron-не-работает)
9. [Бронирование](#бронирование)
10. [Кастомный домен](#кастомный-домен)
11. [Вход в кабинет и супер-админку](#вход-в-кабинет-и-супер-админку)
12. [Лицензия и /blocked](#лицензия-и-blocked)
13. [Резервная копия и восстановление](#резервная-копия-и-восстановление)
14. [Сообщить о сбое клиентам](#сообщить-о-сбое-клиентам)

## Первые 5 минут

1. Прогоните smoke-test — он за 30 секунд показывает, какой слой сломан:

   ```bash
   bash scripts/smoke-test.sh "$SITE" t/<slug-клиента>
   ```

2. Сопоставьте результат:

| Результат smoke-test | Вероятная причина | Раздел |
|---|---|---|
| Все проверки `FAIL`, `000` (нет соединения) | DNS, домен, Vercel | [Vercel упал](#vercel-упал) |
| `/`, `/panel/login`, `/sitemap.xml` — `OK`, публичный сайт — `FAIL` 404 | нет связи с Supabase или неверные ключи (запросы возвращают пустой результат без ошибки) | [Supabase упал](#supabase-упал) |
| всё `FAIL` 500, в Vercel → Logs `supabaseUrl is required` | не заданы переменные Supabase | [Vercel упал](#vercel-упал) |
| `/` — `404` на своём домене | домена нет в `MAIN_HOSTS` | [DEPLOY.md, шаг 6](../DEPLOY.md#шаг-6-домен) |
| `cron без секрета` — `FAIL` (не 401) | маршрут cron отвечает без проверки секрета — изменён код или middleware | откатить деплой, [Cron не работает](#cron-не-работает) |
| `cron с секретом` — `FAIL` 401 | неверный `CRON_SECRET` в команде или в Vercel | [Cron не работает](#cron-не-работает) |
| Всё `OK`, но жалобы на письма или Telegram | внешний сервис | [SMTP](#smtp-не-работает), [Telegram](#telegram-не-работает) |

3. Проверьте страницы статуса внешних сервисов:

| Сервис | Статус |
|---|---|
| Vercel | <https://www.vercel-status.com/> |
| Supabase | <https://status.supabase.com/> |
| Telegram Bot API | официальной страницы нет; проверка — `curl -s https://api.telegram.org/bot<токен>/getMe` |
| Yandex 360 | официальной страницы нет; проверка — вход в <https://mail.yandex.ru/> и «Проверить подключение» в `/panel/email-accounts` |

## Где смотреть логи

| Где | Что там | Как открыть |
|---|---|---|
| `/panel/logs` → «Ошибки» | записи `error:email`, `error:generate`, `error:vercel`, `error:booking`, `error:import`, `error:cron` из `audit_log` | супер-админка |
| `/panel/logs` → «Аудит» | действия оператора: оплаты, доступы, ящики, лицензии | супер-админка |
| Vercel → Logs | ответы всех запросов, исключения, таймауты функций | **Project → Logs**, фильтр по пути, например `/api/cron` |
| Vercel → Cron Jobs | последние запуски 10 задач из `vercel.json` | **Settings → Cron Jobs → View Logs** |
| Supabase → Logs | Postgres, Auth, Storage, API | **Project → Logs → Explorer** |
| Telegram | `getWebhookInfo` → `last_error_message` | [telegram-setup.md, шаг 6](telegram-setup.md#шаг-6-проверка) |

`/panel/logs` пишется в ту же базу Supabase. Если Supabase недоступен, смотрите Vercel → Logs.

Последние ошибки через SQL Editor:

```sql
select created_at, action, payload->>'message' as message
from audit_log where action like 'error:%'
order by created_at desc limit 50;
```

## Supabase упал

**Симптомы:** сайты клиентов отдают 404, хотя бизнесы оплачены; форма записи — «Ошибка» или «Не удалось сохранить запись»; вход в кабинет
и супер-админку не проходит («Неверная почта или пароль»); `/sitemap.xml` содержит только 3 адреса без сайтов
клиентов. Лендинг `/`, `/oferta`, `/privacy` открываются.

Supabase JS при сетевой ошибке не бросает исключение, а возвращает `data: null` и `error: TypeError: fetch failed`
(проверено на `@supabase/supabase-js` 2.45.4). Код в основном проверяет только `data`, поэтому сбой БД выглядит
как «бизнес не найден», а не как 500. Массовые 404 на работающих сайтах — первым делом проверьте Supabase.

**Проверка:**

```bash
curl -s "$SITE/sitemap.xml" | grep -c '<url>'                          # 3 — сайтов клиентов в карте нет
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<project-ref>.supabase.co/rest/v1/" -H "apikey: <anon key>" # 200 — Supabase отвечает
```

| Ответ Supabase | Причина | Что делать |
|---|---|---|
| нет ответа / 5xx, на status.supabase.com инцидент | сбой у Supabase | ждать; сообщить клиентам ([шаблон](#сообщить-о-сбое-клиентам)); после восстановления — smoke-test |
| `Project is paused` / 540 | проект Free приостановлен после 7 дней без активности | **Dashboard → Restore project**; для продакшена — тариф Pro |
| 401 `Invalid API key` | ключи в Vercel не от этого проекта или ротированы | **Settings → API** → ключи в Vercel → Redeploy |
| 200, но сайты всё равно 404 | ключ `SUPABASE_SERVICE_ROLE_KEY` от другого проекта, или не выполнена миграция | сверить ключи в **Settings → API**; в SQL Editor `select count(*) from businesses where status = 'client';` |
| `remaining connection slots are reserved` | исчерпаны подключения | Supabase → **Reports → Database**; подождать завершения cron с `maxDuration` 300 с; при повторах — тариф выше |
| `Database size exceeded` / запись запрещена | превышен лимит места | **Reports → Database** → размер; `cleanup-audit-log` удаляет только записи старше года — почистите `emails_outgoing`, `emails_incoming` вручную |

**Что теряется во время сбоя:** новые брони (форма вернёт ошибку, клиент может позвонить), трекинг открытий,
входящие письма (подхватятся следующим `check-replies` — он читает непрочитанные за 7 дней), cron-задачи этого
окна (ежедневные выполнятся на следующий день; напоминания за 24 и 2 часа в окне сбоя не уйдут).

## Vercel упал

**Симптомы:** весь сервис недоступен или отдаёт ошибки Vercel (`502`, `504`, `FUNCTION_INVOCATION_FAILED`,
`DEPLOYMENT_NOT_FOUND`).

**Проверка:**

```bash
curl -sI "$SITE" | head -5
curl -sI "https://<project>.vercel.app" | head -5   # если работает — проблема в домене, не в Vercel
```

| Симптом | Причина | Что делать |
|---|---|---|
| инцидент на vercel-status.com | сбой Vercel | ждать; сообщить клиентам |
| сломалось сразу после деплоя | ошибка в новом коде | **Deployments → предыдущий рабочий → ⋯ → Promote to Production** (откат за минуту) |
| `DEPLOYMENT_NOT_FOUND`, `404: NOT_FOUND` от Vercel | домен отвязан от проекта | **Settings → Domains**: домен в проекте, статус **Valid Configuration** |
| `*.vercel.app` работает, домен — нет | DNS или сертификат | `curl -s "https://dns.google/resolve?name=zapishisya.ru&type=A"` → `76.76.21.21`; Domains → статус SSL |
| `504 FUNCTION_INVOCATION_TIMEOUT` на `/api/cron/*` или импорте | функция дольше лимита | Hobby — до 60 с, `maxDuration` 300 работает только на Pro; разбить импорт на части, проверить тариф |
| `500` на всех динамических страницах, в логах `supabaseUrl is required` | пропали переменные окружения | **Settings → Environment Variables** → восстановить → Redeploy |
| сборка падает | ошибка типов или pnpm | Deployments → Build Logs; [DEPLOY.md, что делать, если упало](../DEPLOY.md#что-делать-если-упало) |
| `402` / проект приостановлен | превышены лимиты тарифа Hobby | **Usage**; перейти на Pro |

После любого восстановления: `bash scripts/smoke-test.sh "$SITE"`.

## SMTP не работает

**Симптомы:** письма рассылки не уходят, владельцы не получают письма о бронях, в Telegram оператору
`❌ SMTP error: письмо не отправлено`, в `/panel/logs` — `error:email`.

**Проверка по шагам:**

1. `/panel/email-accounts`: строка «Отправлено сегодня: N из M».
   - `N = M` — исчерпан дневной лимит всех ящиков. Письма ждут сброса в 00:00 МСК
     (`reset-email-limits`). Срочно: «Сбросить лимит» у ящика (риск блокировки Яндексом) или добавить ящик.
   - `M = 0` — нет активных ящиков: «Включить» или добавить ящик.
2. У каждого ящика «Проверить подключение».
   - `OK` — SMTP работает, смотрите шаг 3.
   - `ошибка SMTP` — текст ошибки в `/panel/logs`:

| Текст ошибки | Причина | Что делать |
|---|---|---|
| `Invalid login`, `535 5.7.8` | неверный пароль приложения или он отозван | новый пароль приложения, пересохранить ящик ([email-setup.md, шаг 6](email-setup.md#шаг-6-ящики-и-пароли-приложений)) |
| `This user does not have access rights to this service` | в ящике не разрешены почтовые программы | Почта → Все настройки → Почтовые программы → включить IMAP и пароли приложений |
| `ETIMEDOUT`, `ECONNREFUSED` | неверный хост или порт | `smtp.yandex.ru`, `465` |
| `554 5.7.1 Message rejected under suspicion of SPAM` | Яндекс счёл письмо спамом | снизить `daily_limit`, изменить шаблон, [прогрев](email-setup.md#прогрев-и-лимиты) |
| `Ящик заблокирован` / `account is blocked` | блокировка за рассылку | выключить ящик, обратиться в поддержку Yandex 360 |
| `ENCRYPTION_KEY должен быть 64 hex-символа` | ключ не задан или изменён | задать прежний ключ; если он утерян — удалить и добавить ящики заново |
| `Unsupported state or unable to authenticate data` | `ENCRYPTION_KEY` сменили после сохранения паролей | удалить и добавить ящики заново |

3. «Отправить тест» на свой адрес. Письмо не пришло или в спаме — проверить заголовки
   `Authentication-Results` и DNS ([email-setup.md, шаг 8](email-setup.md#шаг-8-проверка-через-mxtoolbox)).
4. Рассылка конкретно: очередь не двигается при рабочем SMTP — не вызывается `send-emails`
   ([Cron не работает](#cron-не-работает)).

Состояние очереди и ящиков через SQL:

```sql
select status, count(*) from outreach_log group by status;
select email, active, sent_today, daily_limit, last_reset from email_accounts order by email;
```

Письма о бронях при сбое SMTP не повторяются: `sendMail` возвращает `false`, повторной отправки нет.
Попросите владельцев проверить брони в кабинете или подключить Telegram.

## IMAP: ответы не приходят

**Симптомы:** `/panel/inbox` пуст, хотя бизнесы отвечают; статус `replied` не появляется.

1. Вызывается ли `check-replies`:

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/check-replies"
   # {"ok":true,"stored":0}
   ```

2. Ответ есть, `stored` 0, а письма в ящике лежат:
   - письма уже прочитаны в веб-интерфейсе — `check-replies` берёт только **непрочитанные** за 7 дней;
     отметьте их непрочитанными в Яндекс Почте;
   - у ящика пустой `imap_host` или нет пароля — пересохранить ящик;
   - ошибка подключения одного ящика молча пропускается — проверьте вход по IMAP с тем же паролем
     в почтовой программе.
3. Ответ ушёл на другой адрес — нет MX на домене ([email-setup.md, шаг 2](email-setup.md#шаг-2-mx)).
4. Письмо сохранено, но без бизнеса (`business_id` пуст) — адрес отправителя не совпадает с `businesses.emails`,
   а домен — с `businesses.websites`. Привяжите вручную по `/panel/businesses/{id}`.

## Telegram не работает

**Симптомы:** владельцы не получают уведомления о бронях; код `BIZ-…` не подключается; бот оператора молчит.

1. Состояние webhook:

   ```bash
   curl -s "https://api.telegram.org/bot<токен>/getWebhookInfo"
   ```

| Что в ответе | Причина | Что делать |
|---|---|---|
| `"url":""` | webhook не зарегистрирован или снят | [telegram-setup.md, шаг 5](telegram-setup.md#шаг-5-регистрация-webhook) |
| `401 Unauthorized` в `last_error_message` | секрет не совпадает с переменной | новый `setWebhook` с секретом из Vercel |
| `404 Not Found` | старый домен или неверный путь | `setWebhook` с актуальным `$SITE` |
| `SSL error`, `Connection timed out` | домен не отвечает | [Vercel упал](#vercel-упал) |
| большой `pending_update_count` | обработчик падает | Vercel → Logs → `/api/telegram/webhook` |
| `{"ok":false,"error_code":401}` на сам `getWebhookInfo` | токен отозван | новый токен в BotFather → Vercel → Redeploy → `setWebhook` |

2. Отправка работает? Проверка токена без webhook:

   ```bash
   curl -s "https://api.telegram.org/bot<токен бота бизнесов>/sendMessage" \
     -d "chat_id=<telegram_chat_id бизнеса>" -d "text=Проверка"
   ```

| Ответ | Причина | Что делать |
|---|---|---|
| `"ok":true` | токен и чат в порядке, сбой в событии | смотрите шаг 3 |
| `403 Forbidden: bot was blocked by the user` | владелец заблокировал бота | владелец разблокирует бота |
| `400 Bad Request: chat not found` | чат удалён или бот другой | владелец переподключает: «Отключить» → новый код |
| `400 can't parse entities` | спецсимволы `<`, `>`, `&` в названии бизнеса или имени клиента (бот бизнесов шлёт с `parse_mode: HTML`) | убрать символы из названия; правка кода — [PROGRESS.md, проблема 28](../PROGRESS.md#известные-проблемы) |
| `429 Too Many Requests` | лимит Telegram | подождать `retry_after` секунд |

`chat_id` бизнеса:

```sql
select name, telegram_chat_id, telegram_connected_at from businesses where slug = '<slug>';
```

3. Бот оператора молчит при рабочем токене — `TELEGRAM_CHAT_ID` не ваш чат
   ([telegram-setup.md, шаг 2](telegram-setup.md#шаг-2-токены-и-chat-id-оператора)). Алерты лицензий идут через
   бот бизнесов — запустите его тоже.

Telegram-уведомления при сбое не повторяются. Email-копия уведомления о брони уходит независимо.

## Cron не работает

Два источника вызовов: Vercel Cron (10 ежедневных задач из `vercel.json`) и внешний планировщик
(`send-emails`, `check-replies`, `booking-reminders`, `unconfirmed-reminder`). Все задачи требуют
`Authorization: Bearer <CRON_SECRET>`.

**Проверка вручную:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/cron/cleanup-slots"                                  # 401
curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/cleanup-slots"                            # {"ok":true,...}
curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/booking-reminders"
curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/unknown-job"                              # 404 {"ok":false,"reason":"unknown_job"}
```

| Симптом | Причина | Что делать |
|---|---|---|
| ручной вызов с секретом → 401 | `CRON_SECRET` в Vercel отличается или не задан; переменная добавлена без Redeploy | проверить переменную, Redeploy |
| ручной вызов работает, Vercel Cron — 401 | Vercel Cron отправляет `Authorization: Bearer $CRON_SECRET` только если переменная называется именно `CRON_SECRET` и задана в Production | проверить имя и окружение переменной |
| в **Settings → Cron Jobs** нет задач | `vercel.json` не попал в деплой или проект на другой ветке | Redeploy из `main` |
| ежедневные задачи работают, письма рассылки и напоминания — нет | не настроен внешний планировщик | [DEPLOY.md, шаг 9](../DEPLOY.md#шаг-9-частые-cron-задачи) |
| внешний планировщик показывает ошибки 401 | в задаче нет заголовка или старый секрет | обновить заголовок в планировщике |
| `504` на `check-replies` | много ящиков или писем, лимит 60 с | меньше ящиков на вызов невозможно без правки кода; вызывать чаще, чтобы непрочитанных было меньше |
| `send-emails` → `{"ok":true,"sent":0,"reason":"no_capacity"}` | нет ящика с остатком лимита или ошибка SMTP | [SMTP не работает](#smtp-не-работает) |
| `send-emails` → `{"ok":true,"sent":0}` | очередь пуста | поставить бизнесы в очередь в `/panel/funnel` |

`booking-reminders` ищет брони в окне «через 23–24 часа» и «через 1–2 часа». Пропущенный час — пропущенные
напоминания: повторного поиска за прошлые окна нет. Планировщик должен вызывать задачу каждый час.

Расписание Vercel Cron — в UTC. `reset-email-limits` в 21:00 UTC = 00:00 МСК.

## Бронирование

| Жалоба | Проверка | Решение |
|---|---|---|
| «Нет свободного времени» | `GET $SITE/api/bookings/slots?prefix=t&slug=<slug>&serviceId=<id>&date=YYYY-MM-DD` | пустой список — часы работы на этот день не заданы, услуга длиннее интервала, `min_hours_before` / `max_days_ahead` отсекают дату; поправить в «Настройках» |
| время на сайте сдвинуто на 3 часа | слоты API — в UTC, сайт показывает в МСК | норма; часовой пояс всех бизнесов — UTC+3 |
| «Это время уже занято» | двойная бронь отклонена (409 `slot_taken`) | норма; клиент выбирает другое время |
| «Слишком много попыток» | 429 `rate_limited`, 5 броней за 10 минут с одного IP | подождать 10 минут; лимит задан в коде (`app/api/bookings/route.ts`), поле в `/panel/settings` на него не влияет |
| сайт бизнеса 404 | статус бизнеса не `client` или slug изменён | `select slug, status, slug_history from businesses where slug = '<slug>';` |
| бронь есть в базе, уведомления нет | SMTP или Telegram | [SMTP](#smtp-не-работает), [Telegram](#telegram-не-работает) |
| бизнес пропал из `/panel/businesses` вместе с бронями | ночью сработал `process-deletions` (`pending_deletion`) или `cleanup-prototypes` (любой `archived` с `created_at` старше 120 дней, [проблема 30](../PROGRESS.md#известные-проблемы)) | `select action, created_at from audit_log where entity_id = '<id>' order by created_at desc;` покажет последние ручные действия (cron в журнал не пишет); восстановить из [резервной копии](#резервная-копия-и-восстановление). JSON-копия содержит `businesses`, `services`, `bookings`, `admin_users`, но не `photos` — фото восстанавливаются только из `pg_dump` |

## Кастомный домен

| Симптом | Причина | Что делать |
|---|---|---|
| `ssl_status = pending` больше суток | клиент не поменял DNS | `curl -s "https://dns.google/resolve?name=<домен>&type=A"` → должно быть `76.76.21.21`; отправить клиенту инструкцию ещё раз |
| `ssl_status = error` | домен не добавлен в проект Vercel | `/panel/businesses/{id}` → сохранить домен ещё раз; проверить `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` |
| домен открывает чужой сайт или 404 | `custom_domain` не совпадает с доменом в Vercel | `select slug, custom_domain from businesses where custom_domain = '<домен>';` |
| `www.<домен>` не работает | в Vercel добавлен только корневой домен | добавить `www` в Vercel → Domains и CNAME у регистратора |
| в Telegram `⚠️ Домены не проверены` | ночной `check-domains` получил ошибку Vercel API | список доменов в сообщении; проверить токен Vercel |

## Вход в кабинет и супер-админку

| Симптом | Причина | Что делать |
|---|---|---|
| `/panel/login` → «Неверная почта или пароль» при верном пароле | email не в `SUPERADMIN_EMAILS` | добавить, Redeploy |
| кабинет владельца → «Неверная почта или пароль» | нет строки в `admin_users` для этого бизнеса | `select * from admin_users where email = '<email>';`; привязка — [INSTALL.md](../INSTALL.md#владелец) |
| владелец забыл пароль | сброса в интерфейсе нет | Supabase → **Authentication → Users** → новый пароль |
| после входа снова форма входа | cookie не сохраняется: вход по `http://` или чужой домен | входить по `https://` основного домена или домена клиента |

## Лицензия и /blocked

Только для копий, переданных клиенту (задан `LICENSE_ID`).

| Симптом | Причина | Что делать |
|---|---|---|
| все страницы показывают `/blocked` | лицензия отозвана в `/panel/licenses` | оператор восстанавливает лицензию; клиент удаляет cookie `license_status` или ждёт 24 часа |
| у оператора `⚠️ Запуск на другом домене` | клиент переехал на новый домен | `/panel/licenses` → «Разрешить домен» |
| у оператора `🚨 Неизвестный запуск` | `LICENSE_ID` не найден | сверить `LICENSE_ID` у клиента с `/panel/licenses` |
| сервер лицензий недоступен | статус `unknown` | сайт продолжает работать; блокировки по недоступности нет |

## Резервная копия и восстановление

| Симптом | Что делать |
|---|---|
| GitHub Actions `weekly-backup` красный: `connection refused` | `SUPABASE_DB_URL` — строка **Session pooler**, порт 5432, пароль БД без спецсимволов или URL-кодированный |
| `pg_dump: server version mismatch` | в workflow ставится `postgresql-client` из Ubuntu; версия Supabase новее — нужна правка workflow (установка клиента нужной версии из репозитория PostgreSQL) |
| в `/panel/backup` нет новых файлов | кнопка вызывает `/api/cron/backup` с `CRON_SECRET` и `NEXT_PUBLIC_SITE_URL` — проверить обе переменные |
| восстановление → `confirm` | в поле подтверждения нужно слово `ВОССТАНОВИТЬ` |

Восстановление из JSON (`/panel/backup`) — upsert по `id` в 7 таблиц: удалённые после копии записи не удаляются,
изменённые возвращаются к состоянию копии. Полный откат БД — из `pg_dump`:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$SUPABASE_DB_URL" backup.dump
```

Перед `pg_restore` в рабочую базу сделайте свежий дамп текущего состояния.

## Сообщить о сбое клиентам

Шаблон письма владельцам бизнесов (через `/panel/inbox` или обычную почту, если сервис недоступен):

```text
Тема: Временные перебои в работе онлайн-записи

Здравствуйте!

С <время> по МСК онлайн-запись на вашем сайте может работать с перебоями из-за сбоя у хостинг-провайдера.
Записи, сделанные до сбоя, сохранены. Пожалуйста, проверьте кабинет после восстановления
и принимайте записи по телефону, пока мы не сообщим, что всё работает.

Мы напишем, как только работа восстановится.
```

После восстановления:

1. `bash scripts/smoke-test.sh "$SITE"` — все `OK`.
2. Тестовая бронь на демо-бизнесе ([TESTING.md, сквозной сценарий](../TESTING.md#сквозной-сценарий)).
3. Письмо клиентам о восстановлении.
4. Запись в [CHANGELOG.md](../CHANGELOG.md), если понадобилась правка кода или конфигурации.
