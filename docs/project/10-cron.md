# Том 10. Фоновые задачи и cron

Источники: `общие/lib/schedules.ts`, `общие/lib/cron.ts`, `общие/lib/cron-jobs/index.ts`, `supabase/migrations/0008_pg_cron.sql`, `0009_retention.sql`, `0011_analytics.sql`, `vercel.json`, `app/api/cron/**`, `.github/workflows/backup.yml`, `служебное/scripts/configure-cron.sql`, `PROGRESS.md`.

## 1. Единый реестр расписаний

`общие/lib/schedules.ts` — «единственный источник правды»; с ним сверяются `vercel.json`, миграции 0006–0008, `scripts/cron-check.sh` и crontab VPS в тесте `schedules.test.ts`. Все выражения в UTC (МСК = UTC+3).

Типы раннеров: `vercel` (Vercel Cron), `pg_cron_http` (pg_cron → `cron_http_call(name)` → `net.http_get` на `/api/cron/<name>`, fire-and-forget), `pg_cron_sql` (SQL-функция внутри БД). Политика повтора: `next_run` (недоделанную работу подхватит следующий запуск, задачи идемпотентны) или `none` (сбой виден в журнале). Владельцы зон в реестре: `agent-2-cron`, `agent-8-email`.

`VERCEL_HOBBY_MAX_CRONS = 2`; `toVercelCrons()` генерирует секцию `crons` для `vercel.json`; `toCrontab(baseUrl, envFile)` — строки `/etc/cron.d/servis-jade` для VPS; `isValidCronExpression` / `runsMoreThanDaily` — проверки выражений.

## 2. Полный список `SCHEDULES`

### Vercel Cron (2 задачи, `vercel.json`)
| Задача | Расписание | Описание |
|---|---|---|
| `backup` | `0 3 * * 0` | Воскресенье: JSON-выгрузка ключевых таблиц в bucket `backups`, удаление копий старше 30 дней |
| `cleanup-audit-log` | `0 6 * * *` | Страховка retention: чистит журналы по тем же правилам, если pg_cron не сработал |

### pg_cron → HTTP (частые)
| Задача | Расписание | Описание |
|---|---|---|
| `send-emails` | `* * * * *` | Одно письмо из очереди `email_queue`, 60 с таймаут |
| `check-replies` | `*/5 * * * *` | IMAP: входящие ответы |
| `booking-reminders` | `0 * * * *` | Напоминания клиентам за 24 ч и 2 ч |
| `unconfirmed-reminder` | `0 * * * *` | Письмо бизнесу о брони `new` дольше 24 ч |

### pg_cron → HTTP (ежедневные UTC)
| Задача | Расписание | МСК | Описание |
|---|---|---|---|
| `follow-up` | `0 8 * * *` | 11:00 | Повтор молчунам через 30/60 дней, архив через 90 |
| `subscription-reminders` | `0 7 * * *` | 10:00 | Подписка: за 3 дня, в день, +7 дней заглушка, +30 архив |
| `reset-email-limits` | `0 21 * * *` | 00:00 | Сброс `sent_today` у ящиков |
| `archive-refused` | `0 0 * * *` | 03:00 | Отказы старше 30 дней → `archived` |
| `process-deletions` | `0 1 * * *` | 04:00 | `pending_deletion` с наступившей датой → удаление |
| `process-transfers` | `30 1 * * *` | 04:30 | Выкуп кода: заглушка после `support_until`, +7 дней `transferred_out` |
| `cleanup-prototypes` | `0 2 * * *` | 05:00 | `preview_ready` > 90 дней → archived, archived > 30 → удаление |
| `check-domains` | `30 2 * * *` | 05:30 | Кастомные домены через Vercel API → `ssl_status` |

### pg_cron → SQL
| Задача | Расписание | Команда |
|---|---|---|
| `keep-alive` | `0 * * * *` | `select public.cron_keep_alive()` — активность БД (Supabase Free) |
| `cleanup-audit-log-90` | `0 3 * * *` | `select public.cron_retention('audit_log')` |
| `cleanup-app-logs-30` | `0 4 * * *` | `select public.cron_retention('app_logs')` |
| `cleanup-analytics-180` | `0 5 * * *` | `select public.cron_retention('analytics_events')` |
| `cleanup-license-pings-180` | `0 6 * * *` | `select public.cron_retention('license_pings'), public.cron_retention('cron_marks')` |
| `create-partitions` | `0 7 1 * *` | `select public.create_monthly_partitions()` — партиции на 3 месяца вперёд |

`RETENTION_DAYS = { audit_log: 90, app_logs: 30, analytics_events: 180, license_pings: 180 }`. `UNSCHEDULED_JOBS = ['cleanup-slots', 'warmup']` — URL оставлены, но по расписанию не запускаются (`cleanup-slots` не нужен: слоты считаются на лету; `warmup` — лёгкий ping БД).

Дополнительные SQL-задачи из `0011_analytics.sql`: `analytics-refresh` (`5 * * * *`), `analytics-partitions` (`0 7 1 * *`), `analytics-retention` (`30 6 * * *`), `analytics-rate-purge` (`45 * * * *`).

## 3. Реестр в БД `public.cron_registry` (0008)

13 записей, `cron_apply_registry()` создаёт `cron.schedule` для каждой:
```
send-emails            * * * * *        http  60000
check-replies          */5 * * * *      http  60000
booking-reminders      0 * * * *        http  60000
unconfirmed-reminder   0 * * * *        http  60000
follow-up              0 8 * * *        http  60000
subscription-reminders 0 7 * * *        http  60000
reset-email-limits     0 21 * * *       http  10000
archive-refused        0 0 * * *        http  10000
process-deletions      0 1 * * *        http  60000
process-transfers      30 1 * * *       http  10000
cleanup-prototypes     0 2 * * *        http  60000
check-domains          30 2 * * *       http  60000
keep-alive             0 * * * *        sql   30000
```
`cron_assert_registry()` в конце миграций 0006/0007/0008 проверяет, что все задачи есть в `cron.job` с тем же расписанием и активны; падение миграции предпочтительнее молча незапланированной задачи.

`cron_setting(p_name)` читает GUC `app.site_url` / `app.cron_secret` с фолбэком в Supabase Vault. `служебное/scripts/configure-cron.sql` создаёт секреты через `vault.create_secret` (основной путь), вариант `ALTER DATABASE ... SET app.*` на Supabase даёт `42501 permission denied` и оставлен закомментированным. Для проверки логов: `select … from cron.job_run_details r join cron.job j on j.jobid = r.jobid order by r.start_time desc limit 20` (в `cron.job_run_details` колонки `jobname` нет).

Вспомогательные SQL-функции: `cron_log_error`, `cron_log_result`, `cron_try_lock`/`cron_unlock` (TTL 300 с), `cron_claim`/`cron_release`, `cron_claim_unconfirmed(limit)`, `cron_claim_follow_up(limit)`, `cron_http_call(job)` (pg_net), `cron_keep_alive`, `cron_retention`, `cron_drop_old_partitions`.

## 4. Реестр хендлеров `общие/lib/cron-jobs/index.ts`

`JOBS` (15 записей):
`archive-refused`, `backup`, `booking-reminders`, `check-domains`, `cleanup-audit-log`, `cleanup-prototypes`, `cleanup-slots` (заглушка — «слоты не хранятся, очистка не требуется»), `follow-up`, `process-deletions`, `process-transfers`, `reset-email-limits`, `subscription-reminders`, `unconfirmed-reminder`, `warmup`.

Файлы: `archive-refused.ts`, `backup.ts`, `booking-reminders.ts`, `business-removal.ts`, `check-domains.ts`, `cleanup-audit-log.ts`, `cleanup-prototypes.ts`, `follow-up.ts`, `process-deletions.ts`, `process-transfers.ts`, `reset-email-limits.ts`, `subscription-reminders.ts`, `unconfirmed-reminder.ts`, `warmup.ts`, `shared.ts` + тесты.

`send-emails` и `check-replies` — отдельные маршруты со своей логикой, в `JOBS` их нет.

`handleCronRequest(name, req, deps)`: сначала `requireCron` (401 без Bearer, секрет проверяется до имени, чтобы перебором нельзя узнать список), затем `isJobName` (404 `unknown_job`), затем `runCronJob(name, req, JOBS[name], makeCronContext)`. `cronRoute(name)` — GET-обработчик для статических маршрутов `app/api/cron/<name>/route.ts`; `app/api/cron/[job]/route.ts` — универсальный (`maxDuration = 60`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`).

`cron-context.ts` — боевой контекст: service_role-клиент, отправка писем/Telegram, журнал. `cron.ts` — `jsonResponse`, `requireCron`, `runCronJob` (блокировка, бюджет `CRON_BUDGET_MS = 50 с`, обработка ошибок, запись `audit_log cron:<job>`).

## 5. Известное ограничение

`PROGRESS.md`: частые cron-задачи не включены в `vercel.json` из-за лимита Vercel Hobby (максимум 2 задачи, не чаще раза в сутки, `maxDuration` 60 с). Нужен внешний планировщик (UptimeRobot / VPS crontab / pg_cron → HTTP) — это эксплуатационное требование, а не баг кода. `vercel.json` содержит только `backup` и `cleanup-audit-log`.

## 6. GitHub Actions

`.github/workflows/backup.yml` — `weekly-backup`: по расписанию `0 0 * * 0` (воскресенье 00:00 UTC) и `workflow_dispatch`. Устанавливает `postgresql-client`, выполняет `pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --format=custom --file=backup.dump`, загружает артефакт `db-backup-${{ github.run_id }}` с хранением 60 дней. Секрет репозитория — `SUPABASE_DB_URL` (Session pooler, порт 5432).
