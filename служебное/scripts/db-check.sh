#!/usr/bin/env bash
# scripts/db-check.sh — проверка схемы БД после миграций 0001–0007 (ТЗ §4).
# Использует только чтение (см. db-check.sql). Код выхода != 0 при FAIL.
# Пример: DATABASE_URL="postgresql://..." bash scripts/db-check.sh
set -euo pipefail

: "${DATABASE_URL:?Задайте DATABASE_URL (строка подключения Postgres/Supabase)}"

here="$(cd "$(dirname "$0")" && pwd)"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$here/db-check.sql"
