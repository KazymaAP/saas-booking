#!/usr/bin/env bash
# scripts/smoke-test.sh — проверка деплоя saas-booking после выкладки (TESTING.md, раздел «Smoke-test»).
#
# Использование:
#   bash scripts/smoke-test.sh <BASE_URL> [<prefix>/<slug>]
#   bash scripts/smoke-test.sh https://zapishisya.ru t/shinomontazh-koleso
#
# Переменные окружения:
#   SMOKE_SITE     <prefix>/<slug> публичного сайта со статусом client (то же, что второй аргумент)
#   CRON_SECRET    если задан — проверяется GET /api/cron/cleanup-slots с секретом (задача без побочных эффектов)
#   SMOKE_TIMEOUT  таймаут одного запроса, секунд (по умолчанию 15)
#   SMOKE_STRICT=1 WARN считается ошибкой
#
# Коды выхода: 0 — нет FAIL; 1 — есть хотя бы один FAIL; 2 — неверные аргументы или нет curl.
# Скрипт только читает: GET-запросы, без создания броней и отправки писем.

set -u

usage() {
  echo "Использование: bash scripts/smoke-test.sh <BASE_URL> [<prefix>/<slug>]" >&2
  echo "Пример:        bash scripts/smoke-test.sh https://zapishisya.ru t/shinomontazh-koleso" >&2
}

if [ $# -lt 1 ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl не найден: установите curl и повторите" >&2
  exit 2
fi

BASE_URL="${1%/}"
case "$BASE_URL" in
  http://*|https://*) ;;
  *) echo "BASE_URL должен начинаться с http:// или https://: $BASE_URL" >&2; usage; exit 2 ;;
esac

SITE="${2:-${SMOKE_SITE:-}}"
SITE="${SITE#/}"
SITE="${SITE%/}"
if [ -n "$SITE" ] && ! printf '%s' "$SITE" | grep -Eq '^[a-z]{1,4}/[a-z0-9-]+$'; then
  echo "Публичный сайт задаётся как <prefix>/<slug>, например t/shinomontazh-koleso: $SITE" >&2
  exit 2
fi

TIMEOUT="${SMOKE_TIMEOUT:-15}"
STRICT="${SMOKE_STRICT:-0}"

OK=0; WARN=0; FAIL=0; SKIP=0
TMP_BODY="$(mktemp)"
TMP_HEAD="$(mktemp)"
trap 'rm -f "$TMP_BODY" "$TMP_HEAD"' EXIT

# Вывод одной строки результата: статус, название, подробность.
report() {
  local status="$1" name="$2" detail="$3"
  # printf считает байты, а не символы: длину UTF-8 строки считаем без байтов продолжения (0x80–0xBF).
  local len pad
  len="$(printf '%s' "$name" | LC_ALL=C tr -d '\200-\277' | wc -c | tr -d ' ')"
  pad=$((28 - len)); [ "$pad" -lt 1 ] && pad=1
  printf '%-5s %s%*s%s\n' "$status" "$name" "$pad" '' "$detail"
  case "$status" in
    OK) OK=$((OK + 1)) ;;
    WARN) WARN=$((WARN + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    SKIP) SKIP=$((SKIP + 1)) ;;
  esac
}

# GET-запрос: тело в $TMP_BODY, заголовки в $TMP_HEAD, HTTP-код в stdout ("000" — нет соединения).
# Дополнительные аргументы передаются в curl (например, заголовок авторизации).
fetch() {
  local path="$1"; shift
  curl -sS -o "$TMP_BODY" -D "$TMP_HEAD" -w '%{http_code}' \
    --max-time "$TIMEOUT" -A 'saas-booking-smoke-test' "$@" "$BASE_URL$path" 2>/dev/null || true
}

# check <название> <путь> <ожидаемый HTTP-код> [<подстрока в теле>]
check() {
  local name="$1" path="$2" expected="$3" needle="${4:-}"
  local code
  code="$(fetch "$path")"
  if [ "$code" = "000" ]; then
    report FAIL "$name" "нет ответа за ${TIMEOUT} с ($BASE_URL$path)"
    return 1
  fi
  if [ "$code" != "$expected" ]; then
    report FAIL "$name" "$code, ожидался $expected"
    return 1
  fi
  if [ -n "$needle" ] && ! grep -qiF -- "$needle" "$TMP_BODY"; then
    report FAIL "$name" "$code, в ответе нет «$needle»"
    return 1
  fi
  report OK "$name" "$code"
}

echo "saas-booking smoke-test → $BASE_URL"

# 1. Healthcheck из ТЗ §3.2. В коде эндпоинта нет: 404 — предупреждение, а не ошибка.
code="$(fetch /api/health)"
if [ "$code" = "200" ]; then
  report OK "/api/health" "$code"
elif [ "$code" = "000" ]; then
  report FAIL "/api/health" "нет ответа за ${TIMEOUT} с — сайт недоступен"
else
  report WARN "/api/health" "$code (эндпоинт не реализован, см. TESTING.md)"
fi

# 2. Лендинг.
check "/" "/" 200 "<html"

# 3. Вход в супер-админку: страница с формой пароля.
check "/panel/login" "/panel/login" 200 'type="password"'

# 4. Sitemap строится запросом к Supabase — 500 обычно означает неверные ключи или недоступную БД.
check "/sitemap.xml" "/sitemap.xml" 200 "<urlset"

# 5. robots.txt: прототипы закрыты, ссылка на sitemap есть.
code="$(fetch /robots.txt)"
if [ "$code" = "000" ]; then
  report FAIL "/robots.txt" "нет ответа за ${TIMEOUT} с"
elif [ "$code" != "200" ]; then
  report FAIL "/robots.txt" "${code}, ожидался 200"
elif ! grep -qF "Disallow: /preview/" "$TMP_BODY"; then
  report FAIL "/robots.txt" "нет «Disallow: /preview/»"
elif ! grep -qi "^Sitemap:" "$TMP_BODY"; then
  report FAIL "/robots.txt" "нет строки «Sitemap:»"
else
  report OK "/robots.txt" "$code"
fi

# 6. Заголовки безопасности из middleware.ts.
code="$(fetch /)"
missing=""
grep -qi '^x-frame-options: *DENY' "$TMP_HEAD" || missing="$missing X-Frame-Options"
grep -qi '^x-content-type-options: *nosniff' "$TMP_HEAD" || missing="$missing X-Content-Type-Options"
if [ "$code" = "000" ]; then
  report FAIL "security headers" "нет ответа"
elif [ -n "$missing" ]; then
  report FAIL "security headers" "нет:$missing"
else
  report OK "security headers" "X-Frame-Options, X-Content-Type-Options"
fi

# 7. Cron без секрета должен отвечать 401. 200 — кто угодно может запускать рассылку.
check "cron без секрета" "/api/cron/send-emails" 401

# 8. Прототип без токена — 404.
check "preview без токена" "/preview/smoke-test-nonexistent" 404

# 9. Публичный сайт бизнеса: страница и JSON-LD LocalBusiness.
if [ -n "$SITE" ]; then
  check "публичный сайт" "/$SITE" 200 "application/ld+json"
else
  report SKIP "публичный сайт" "не указан <prefix>/<slug>"
fi

# 10. Cron с секретом: cleanup-slots ничего не меняет и подтверждает, что CRON_SECRET в Vercel совпадает с локальным.
if [ -n "${CRON_SECRET:-}" ]; then
  code="$(fetch /api/cron/cleanup-slots -H "Authorization: Bearer ${CRON_SECRET}")"
  if [ "$code" = "200" ] && grep -qF '"ok":true' "$TMP_BODY"; then
    report OK "cron с секретом" "$code"
  elif [ "$code" = "401" ]; then
    report FAIL "cron с секретом" "401: CRON_SECRET не совпадает с переменной в Vercel"
  elif [ "$code" = "200" ]; then
    report FAIL "cron с секретом" "200, но в ответе нет \"ok\":true"
  else
    report FAIL "cron с секретом" "${code}, ожидался 200"
  fi
else
  report SKIP "cron с секретом" "CRON_SECRET не задан"
fi

echo "Итог: $OK OK, $WARN WARN, $FAIL FAIL, $SKIP SKIP"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
if [ "$STRICT" = "1" ] && [ "$WARN" -gt 0 ]; then
  echo "SMOKE_STRICT=1: предупреждения считаются ошибкой"
  exit 1
fi
exit 0
