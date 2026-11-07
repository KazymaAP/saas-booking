#!/usr/bin/env bash
# scripts/cron-check.sh — проверка расписаний pg_cron в Supabase (агент 2, зона cron).
# Сверяет cron.job с реестром lib/schedules.ts (список ниже синхронизирован тестом lib/schedules.test.ts):
#   задача есть, расписание совпадает, active = true, команда совпадает с cron_registry;
#   лишние задачи — предупреждение.
# Дополнительно: настройки app.site_url / app.cron_secret заданы, ошибки cron за сутки в audit_log,
# последние неудачные запуски в cron.job_run_details.
# Запуск: SUPABASE_DB_URL='postgresql://...' bash scripts/cron-check.sh   (или pnpm cron:check)
# Код выхода: 0 — всё в порядке, 1 — расхождения, нет подключения или нет psql (причина — в stderr).
set -euo pipefail

readonly EXIT_OK=0
readonly EXIT_MISMATCH=1
readonly EXIT_SETUP=1

# name|schedule — все pg_cron задачи (runner pg_cron_http и pg_cron_sql в lib/schedules.ts).
readonly EXPECTED_JOBS=(
  "send-emails|* * * * *"
  "check-replies|*/5 * * * *"
  "booking-reminders|0 * * * *"
  "unconfirmed-reminder|0 * * * *"
  "follow-up|0 8 * * *"
  "subscription-reminders|0 7 * * *"
  "reset-email-limits|0 21 * * *"
  "archive-refused|0 0 * * *"
  "process-deletions|0 1 * * *"
  "process-transfers|30 1 * * *"
  "cleanup-prototypes|0 2 * * *"
  "check-domains|30 2 * * *"
  "keep-alive|0 * * * *"
  "cleanup-audit-log-90|0 3 * * *"
  "cleanup-app-logs-30|0 4 * * *"
  "cleanup-analytics-180|0 5 * * *"
  "cleanup-license-pings-180|0 6 * * *"
  "create-partitions|0 7 1 * *"
)

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ОШИБКА: не задан SUPABASE_DB_URL (строка подключения Postgres: Supabase → Settings → Database)." >&2
  exit "$EXIT_SETUP"
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "ОШИБКА: psql не найден (Ubuntu: apt-get install postgresql-client)." >&2
  exit "$EXIT_SETUP"
fi

# Запрос без вывода заголовков; поля через «|».
query() {
  psql "$SUPABASE_DB_URL" -X -qtA -F '|' -v ON_ERROR_STOP=1 -c "$1"
}

if ! actual="$(query "select jobname, schedule, active from cron.job order by jobname")"; then
  echo "ОШИБКА: не удалось прочитать cron.job (нет подключения или pg_cron не установлен)." >&2
  exit "$EXIT_SETUP"
fi

failures=0
declare -A seen=()

echo "== pg_cron: ${#EXPECTED_JOBS[@]} ожидаемых задач =="
for entry in "${EXPECTED_JOBS[@]}"; do
  name="${entry%%|*}"
  schedule="${entry#*|}"
  seen["$name"]=1
  row="$(grep -E "^${name}\|" <<<"$actual" || true)"
  if [[ -z "$row" ]]; then
    echo "  НЕТ      $name ($schedule)"
    failures=$((failures + 1))
    continue
  fi
  IFS='|' read -r _ got_schedule got_active <<<"$row"
  if [[ "$got_schedule" != "$schedule" ]]; then
    echo "  РАСПИС.  $name: в БД '$got_schedule', ожидается '$schedule'"
    failures=$((failures + 1))
  elif [[ "$got_active" != "t" ]]; then
    echo "  ВЫКЛ.    $name"
    failures=$((failures + 1))
  else
    echo "  OK       $name ($schedule)"
  fi
done

while IFS='|' read -r name _ _; do
  [[ -z "$name" ]] && continue
  [[ -n "${seen[$name]:-}" ]] && continue
  echo "  ЛИШНЯЯ   $name — нет в lib/schedules.ts (предупреждение)"
done <<<"$actual"

echo "== Команды задач совпадают с cron_registry (никакого постороннего SQL) =="
# Пусто — все команды совпадают; иначе — имена задач с изменённой командой.
if commands="$(query "select r.name from cron_registry r join cron.job j on j.jobname = r.name
    where r.enabled and j.command <> case when r.kind = 'http'
      then format('select public.cron_http_call(%L)', r.name) else r.command end order by r.name")"; then
  if [[ -z "$commands" ]]; then
    echo "  OK       команды совпадают"
  else
    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      echo "  КОМАНДА  $name: в cron.job не та команда, что в cron_registry (select public.cron_apply_registry())"
      failures=$((failures + 1))
    done <<<"$commands"
  fi
else
  echo "  НЕТ      cron_registry недоступен (миграция 0006 не применена?)"
  failures=$((failures + 1))
fi

echo "== Настройки =="
settings="$(query "select coalesce(public.cron_setting('site_url'), '') <> '', coalesce(public.cron_setting('cron_secret'), '') <> ''" || echo "f|f")"
IFS='|' read -r has_site has_secret <<<"$settings"
if [[ "$has_site" == "t" && "$has_secret" == "t" ]]; then
  echo "  OK       app.site_url и app.cron_secret заданы"
else
  echo "  НЕТ      app.site_url / app.cron_secret (см. комментарий в 0006_pg_cron.sql)"
  failures=$((failures + 1))
fi

echo "== Ошибки cron за 24 часа (audit_log, action = error:cron) =="
errors="$(query "select count(*) from audit_log where action = 'error:cron' and created_at > now() - interval '24 hours'" || echo "?")"
echo "  $errors"

echo "== Неудачные запуски pg_cron за 24 часа (cron.job_run_details) =="
query "select j.jobname || ': ' || left(coalesce(d.return_message, ''), 120)
       from cron.job_run_details d join cron.job j on j.jobid = d.jobid
       where d.status = 'failed' and d.start_time > now() - interval '24 hours'
       order by d.start_time desc limit 10" || echo "  нет доступа к cron.job_run_details"

if (( failures > 0 )); then
  echo "ИТОГ: расхождений — $failures"
  exit "$EXIT_MISMATCH"
fi
echo "ИТОГ: все задачи на месте"
exit "$EXIT_OK"
