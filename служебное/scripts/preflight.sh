#!/usr/bin/env bash
# scripts/preflight.sh — smoke-проверка перед деплоем: env → install → typecheck → тесты → build → smoke запущенного сервера.
# Запуск: pnpm preflight   (или bash служебное/scripts/preflight.sh)
# Флаги окружения:
#   PREFLIGHT_SKIP_ENV=1    — не проверять env (CI без секретов; build всё равно пройдёт).
#   PREFLIGHT_SKIP_SMOKE=1  — не поднимать next start (нет доступа к Supabase).
#   PREFLIGHT_PORT=3100     — порт для smoke.
# Exit code: 0 — всё прошло, 1 — упал хотя бы один шаг (список в конце).
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1

PORT="${PREFLIGHT_PORT:-3100}"
SMOKE_TIMEOUT_S=60
HEALTH_BUDGET_MS=200
REQUIRED_NODE_MAJOR=20
FAILED=()

step() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✘ %s\033[0m\n' "$1"; FAILED+=("$1"); }

run_step() {
  local title="$1"; shift
  step "$title"
  if "$@"; then ok "$title"; else fail "$title"; fi
}

# Подхватываем .env, если он есть (как это делает Next). Значения не печатаются.
load_env_file() {
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

check_node() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')" || return 1
  echo "node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo 'нет')"
  [[ "$major" -ge "$REQUIRED_NODE_MAJOR" ]] || { echo "Нужен Node >= $REQUIRED_NODE_MAJOR"; return 1; }
  command -v pnpm >/dev/null || { echo 'pnpm не найден: npm i -g pnpm'; return 1; }
}

# Список обязательных переменных — из lib/env.ts (единый источник), проверка формата — там же.
check_env() {
  node --experimental-strip-types --no-warnings -e '
    import("./общие/lib/env.ts").then(({ checkEnv }) => {
      const problems = checkEnv(process.env);
      for (const p of problems) console.error("  - " + p);
      process.exit(problems.length ? 1 : 0);
    });
  ' 2>/dev/null && return 0
  # Fallback для Node без strip-types: только наличие переменных.
  local missing=0 name
  for name in $(sed -n '/^export const REQUIRED_ENV = \[/,/^\]/p' lib/env.ts | grep -oE "'[A-Z_]+'" | tr -d "'"); do
    if [[ -z "${!name:-}" ]]; then echo "  - $name: не задана"; missing=1; fi
  done
  return "$missing"
}

# Секреты не должны попадать в клиентский бандл: service_role ключ в .next/static — критическая ошибка.
check_bundle_secrets() {
  [[ -d .next/static ]] || { echo 'нет .next/static — сборка не выполнена'; return 1; }
  if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] && grep -rqF "$SUPABASE_SERVICE_ROLE_KEY" .next/static; then
    echo 'SUPABASE_SERVICE_ROLE_KEY найден в клиентском бандле!'; return 1
  fi
  if grep -rqE 'SUPABASE_SERVICE_ROLE_KEY|ENCRYPTION_KEY|CRON_SECRET' .next/static; then
    echo 'Имена серверных секретов найдены в клиентском бандле'; return 1
  fi
}

smoke() {
  local log pid code headers
  log="$(mktemp)"
  PORT="$PORT" pnpm exec next start -p "$PORT" >"$log" 2>&1 &
  pid=$!
  # shellcheck disable=SC2064
  trap "kill $pid 2>/dev/null" RETURN

  local i
  for ((i = 0; i < SMOKE_TIMEOUT_S; i++)); do
    curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health" && break
    kill -0 "$pid" 2>/dev/null || { echo 'next start упал:'; tail -n 20 "$log"; return 1; }
    sleep 1
  done

  # Прогрев: первый запрос компилирует маршрут и создаёт клиент Supabase — в бюджет не входит.
  local ms
  read -r code ms < <(curl -s -o /dev/null -w '%{http_code} %{time_total}' "http://127.0.0.1:$PORT/api/health")
  ms="$(awk -v s="$ms" 'BEGIN { printf "%d", s * 1000 }')"
  echo "GET /api/health → $code за ${ms} мс"
  [[ "$code" == "200" ]] || { curl -s "http://127.0.0.1:$PORT/api/health"; echo; return 1; }
  ((ms <= HEALTH_BUDGET_MS)) || { echo "health медленнее ${HEALTH_BUDGET_MS} мс"; return 1; }
  code="$(curl -s -I -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health")"
  echo "HEAD /api/health → $code"
  [[ "$code" == "200" ]] || return 1

  headers="$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/")"
  local h
  for h in 'content-security-policy' 'strict-transport-security' 'x-frame-options: deny' 'x-content-type-options: nosniff' 'referrer-policy' 'permissions-policy' 'cross-origin-opener-policy: same-origin'; do
    grep -qi "^$h" <<<"$headers" || { echo "нет заголовка: $h"; return 1; }
  done
  grep -qi "^x-powered-by" <<<"$headers" && { echo 'X-Powered-By не отключён'; return 1; }
  grep -i '^content-security-policy' <<<"$headers" | grep -q "unsafe-eval" && { echo "CSP содержит 'unsafe-eval'"; return 1; }

  # Подпуть незарегистрированного кастомного домена: middleware → rewrite в resolve-domain → 404.
  # 400 здесь означал бы, что host/next не дошли до route handler (регрессия, см. notes.md п.20).
  code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: preflight-check.invalid' "http://127.0.0.1:$PORT/services")"
  echo "Подпуть неизвестного кастомного домена → $code"
  [[ "$code" == "404" ]] || return 1

  # Мутирующий запрос с чужим Origin должен отклоняться middleware.
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://evil.example' "http://127.0.0.1:$PORT/api/bookings")"
  echo "POST /api/bookings с чужим Origin → $code"
  [[ "$code" == "403" ]] || return 1
}

load_env_file
run_step 'Node и pnpm' check_node
if [[ "${PREFLIGHT_SKIP_ENV:-0}" != "1" ]]; then run_step 'Переменные окружения' check_env; fi
run_step 'Установка зависимостей (lockfile)' pnpm install --frozen-lockfile
run_step 'Typecheck' pnpm typecheck
run_step 'Typecheck strict (зона инфраструктуры)' pnpm typecheck:strict
run_step 'Unit-тесты' pnpm test
run_step 'Сборка' pnpm build
run_step 'Секреты не в клиентском бандле' check_bundle_secrets
if [[ "${PREFLIGHT_SKIP_SMOKE:-0}" != "1" ]]; then run_step "Smoke: next start :$PORT" smoke; fi

printf '\n'
if ((${#FAILED[@]})); then
  printf '\033[31mPREFLIGHT FAILED (%d):\033[0m\n' "${#FAILED[@]}"
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
printf '\033[32mPREFLIGHT OK\033[0m\n'
