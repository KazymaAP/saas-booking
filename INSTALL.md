# INSTALL — установка копии для одного бизнеса

Инструкция для клиента, который выкупил код (тариф «Выкуп кода», 5000 ₽), и для оператора, который готовит передачу.
Результат: собственная копия сайта онлайн-записи на домене клиента, в аккаунтах Vercel и Supabase клиента.

Отдельной single-tenant сборки (`SINGLE_TENANT=true`, ТЗ §14.5) в коде нет. Копия клиента — тот же проект, в котором
работает один бизнес на его домене. Супер-админка на домене клиента недоступна: middleware переводит `/panel` в кабинет
бизнеса.

## Оглавление

1. [Что получает клиент](#что-получает-клиент)
2. [Сроки и поддержка](#сроки-и-поддержка)
3. [Подготовка передачи (оператор)](#подготовка-передачи-оператор)
4. [Установка (клиент)](#установка-клиент)
5. [Перенос данных бизнеса](#перенос-данных-бизнеса)
6. [Настройка](#настройка)
7. [Проверка](#проверка)
8. [Лицензия](#лицензия)
9. [Обновления](#обновления)

## Что получает клиент

| Файл | Откуда | Содержимое |
|---|---|---|
| `transfer-<slug>-<дата>.zip` | `/api/transfer/{id}`, кнопка «Передать код» в `/panel/clients` | `README.md` — лицензия и срок поддержки; `INSTALL.md` и `MIGRATIONS.md` — краткая памятка; `.env.example` с заполненным `LICENSE_ID` |
| `saas-booking-src.zip` | архив репозитория, готовит оператор | исходный код, миграции `0001–0005`, эта инструкция |
| `business-<slug>.json` | SQL-выгрузка, готовит оператор | бизнес, услуги, фото, будущие брони |

Памятка в ZIP перечисляет только миграции `0001` и `0002`. Выполнять нужно все пять — по этой инструкции.

## Сроки и поддержка

| День | Что происходит |
|---|---|
| 0 | оператор нажимает «Передать код»: `code_transferred_at = сегодня`, `support_until = сегодня + 30` |
| 0–30 | сайт работает на инфраструктуре оператора; клиент разворачивает копию и переключает DNS |
| 31 | cron `process-transfers`: на стороне оператора подписка отключается |
| 38 | cron `process-transfers`: статус бизнеса у оператора — `transferred_out` |

## Подготовка передачи (оператор)

1. Бизнес в статусе `client`, домен клиента записан в карточке `/panel/businesses/{id}` (поле домена).
   Домен попадает в лицензию как разрешённый.
2. `/panel/clients` → «Передать код» → скачать ZIP.
3. Архив исходного кода без секретов и истории:

   ```bash
   git archive --format=zip -o saas-booking-src.zip main
   ```

   `.env.local` в git не хранится и в архив не попадает.

4. Выгрузка данных бизнеса — в Supabase SQL Editor основного проекта (подставьте `id` бизнеса):

   ```sql
   select json_build_object(
     'vertical_slug', (select v.slug from vertical_templates v join businesses b on b.vertical_template_id = v.id
                       where b.id = '<BUSINESS_ID>'),
     'business', (select row_to_json(b) from businesses b where b.id = '<BUSINESS_ID>'),
     'services', (select coalesce(json_agg(s), '[]') from services s where s.business_id = '<BUSINESS_ID>'),
     'photos',   (select coalesce(json_agg(p), '[]') from photos p where p.business_id = '<BUSINESS_ID>'),
     'bookings', (select coalesce(json_agg(x), '[]') from bookings x
                  where x.business_id = '<BUSINESS_ID>' and x.scheduled_at > now()
                    and x.status in ('new', 'confirmed'))
   ) as export;
   ```

   Результат (одна ячейка JSON) сохраните в `business-<slug>.json` и передайте клиенту вместе с архивами.

## Установка (клиент)

Нужны аккаунты GitHub, Vercel, Supabase, домен с доступом к DNS, Node 20+ и pnpm 10.

### 1. Код

```bash
unzip saas-booking-src.zip -d saas-booking && cd saas-booking
git init && git add . && git commit -m "Initial import"
git remote add origin https://github.com/<ваш-аккаунт>/saas-booking.git
git push -u origin main
pnpm install
pnpm typecheck
```

### 2. Supabase

Создайте проект и выполните в SQL Editor по порядку `0001_init.sql` … `0013_data_requests_types.sql` из
`supabase/migrations/`. Подробно с проверочными запросами — [DEPLOY.md, шаг 2](DEPLOY.md#шаг-2-supabase-миграции-в-sql-editor).

### 3. Переменные окружения

Возьмите `.env.example` из репозитория, добавьте `LICENSE_ID` из `.env.example` в ZIP:

| Переменная | Значение в копии клиента |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<домен-клиента>` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | ключи нового проекта Supabase |
| `ENCRYPTION_KEY`, `CRON_SECRET` | новые случайные значения (команды — [DEPLOY.md, шаг 4](DEPLOY.md#шаг-4-переменные-окружения)) |
| `SUPERADMIN_EMAILS` | email технического администратора клиента: нужен один раз, чтобы добавить почтовый ящик |
| `LICENSE_ID` | из ZIP |
| `LICENSE_SERVER_URL` | адрес сервиса оператора, например `https://zapishisya.ru` |
| `TELEGRAM_BUSINESS_BOT_TOKEN`, `TELEGRAM_BUSINESS_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | свой бот уведомлений, [docs/telegram-setup.md](docs/telegram-setup.md) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `VERCEL_*` | не нужны |

### 4. Vercel

Импорт репозитория, переменные из шага 3, деплой — [DEPLOY.md, шаг 5](DEPLOY.md#шаг-5-vercel-проект-и-первый-деплой).
Затем **Settings → Domains** → домен клиента и DNS-записи у регистратора.

Домен клиента не входит в `MAIN_HOSTS` (`lib/site.ts`), поэтому middleware обрабатывает его как кастомный домен:
сайт ищется по `businesses.custom_domain`. Менять `lib/site.ts` не нужно.

## Перенос данных бизнеса

В SQL Editor нового проекта. Вставьте содержимое `business-<slug>.json` вместо `<JSON>`:

```sql
create temp table d as select '<JSON>'::jsonb as j;

insert into businesses
select * from jsonb_populate_record(null::businesses,
  (select j->'business' from d)
  || jsonb_build_object(
       'vertical_template_id', (select id from vertical_templates where slug = (select j->>'vertical_slug' from d)),
       'custom_domain', '<домен-клиента>',
       'status', 'client'));

insert into services select * from jsonb_populate_recordset(null::services, (select j->'services' from d));
insert into photos   select * from jsonb_populate_recordset(null::photos,   (select j->'photos' from d));
insert into bookings select * from jsonb_populate_recordset(null::bookings, (select j->'bookings' from d));
```

Выполняйте весь блок одним запросом: временная таблица `d` живёт до конца сессии SQL Editor.
Схема обоих проектов создана одними миграциями, поэтому набор колонок совпадает. `vertical_template_id`
подменяется на id ниши в новом проекте (id ниш генерируются при seed и в разных проектах различаются).

Фото продолжают открываться из Storage оператора, пока его проект существует. Загрузите их заново в кабинете
(**Фото**), чтобы файлы лежали в вашем Supabase.

**Проверка:**

```sql
select slug, status, custom_domain from businesses;      -- одна строка, status = client
select count(*) from services;                           -- как в исходном бизнесе
```

## Настройка

### Владелец

1. **Supabase → Authentication → Users → Add user**: email владельца, пароль, **Auto Confirm User**.
2. Привязка к бизнесу:

   ```sql
   insert into admin_users (business_id, email, role, auth_user_id)
   select b.id, u.email, 'owner', u.id
   from businesses b, auth.users u
   where u.email = '<email-владельца>';
   ```

3. Вход: `https://<домен-клиента>/panel` (middleware переводит на `/{prefix}/{slug}/panel/login`).

### Почта

Ящик Yandex 360 на домене клиента — по [docs/email-setup.md](docs/email-setup.md). Добавить его можно только через
форму `/panel/email-accounts` (пароль шифруется ключом `ENCRYPTION_KEY`). Откройте форму по адресу проекта
`https://<project>.vercel.app/panel/login` под email из `SUPERADMIN_EMAILS` — на домене клиента супер-админки нет.
После добавления ящика можно очистить `SUPERADMIN_EMAILS` и сделать Redeploy.

### Cron

Ежедневные задачи приходят из `vercel.json`. Напоминания клиентам (`booking-reminders`, раз в час) и
`unconfirmed-reminder` нужно вызывать внешним планировщиком — [DEPLOY.md, шаг 9](DEPLOY.md#шаг-9-частые-cron-задачи).
`send-emails` и `check-replies` для одного бизнеса не нужны: это рассылка оператора.

### Telegram

Свой бот уведомлений: токен, username и webhook на `https://<домен-клиента>/api/telegram/webhook`
([docs/telegram-setup.md](docs/telegram-setup.md#бот-бизнесов)). В кабинете: **Уведомления → Создать код**.

## Проверка

```bash
bash scripts/smoke-test.sh https://<домен-клиента>
```

На домене клиента `/` — это сайт бизнеса, а `/panel/login` — вход в кабинет, поэтому обе проверки дают 200.
Затем вручную: запись с телефона, письмо и Telegram владельцу, отмена по ссылке.

## Лицензия

- Middleware раз в сутки отправляет `POST {LICENSE_SERVER_URL}/api/license/ping` с `license_id`, доменом и версией.
  Результат кешируется в cookie `license_status` на 24 часа.
- `active` — домен в лицензии; `unverified` — другой домен (оператор получает сигнал, сайт работает);
  `unknown` — лицензия не найдена или сервер недоступен (сайт работает); `blocked` — лицензия отозвана вручную,
  все страницы показывают `/blocked`.
- Автоматической блокировки нет (ТЗ §0.4). Новый домен оператор добавляет в `/panel/licenses` → «Разрешить домен».
- Без `LICENSE_ID` проверка не выполняется.

## Обновления

Копия клиента не обновляется автоматически. Новые версии оператор передаёт архивом; список изменений —
[CHANGELOG.md](CHANGELOG.md). Перед обновлением выполните новые миграции в SQL Editor, затем `git push`.
