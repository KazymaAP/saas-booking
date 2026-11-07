#!/usr/bin/env bash
# scripts/migrate.sh — применение миграций supabase/migrations/*.sql по порядку (ТЗ §4).
# Идемпотентно: каждая применённая миграция фиксируется в таблице _migrations; повторный запуск
# пропускает уже применённые. Каждая миграция — в своей транзакции (ON_ERROR_STOP=1): упал файл —
# остановились, предыдущие остались применёнными.
#
# Нужен psql (поставляется с PostgreSQL; для Supabase — строка подключения из Dashboard → Database).
# Пример:
#   DATABASE_URL="postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
#     bash scripts/migrate.sh
# Локальный файл можно не указывать — берутся все *.sql из supabase/migrations в алфавитном порядке.
# Применить один конкретный файл: bash scripts/migrate.sh 0014_partition_bookings.sql
set -euo pipefail

: "${DATABASE_URL:?Задайте DATABASE_URL (строка подключения Postgres/Supabase), см. scripts/db-check.sh}"

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
mig_dir="$root/supabase/migrations"

command -v psql >/dev/null 2>&1 || { echo "psql не найден. Установите PostgreSQL client или используйте Supabase SQL Editor." >&2; exit 127; }

# Таблица учёта применённых миграций (отдельная от приложения, безопасна для повторного создания).
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q <<'SQL'
create table if not exists _migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
SQL

# Список файлов: либо один переданный аргументом, либо все *.sql по порядку.
if [ "$#" -ge 1 ]; then
  files=("$@")
else
  mapfile -t files < <(cd "$mig_dir" && ls -1 *.sql | sort)
fi

applied=0
skipped=0
for name in "${files[@]}"; do
  path="$mig_dir/$name"
  if [ ! -f "$path" ]; then
    echo "Нет файла миграции: $path" >&2
    exit 1
  fi
  # Уже применена? (quote для безопасной подстановки имени)
  already="$(psql "$DATABASE_URL" -X -At -c "select 1 from _migrations where name = '$name'")"
  if [ "$already" = "1" ]; then
    echo "↷ skip  $name (уже применена)"
    skipped=$((skipped + 1))
    continue
  fi
  echo "→ apply $name"
  # Файл + отметка в одной транзакции: миграция и её фиксация атомарны.
  {
    cat "$path"
    printf "\ninsert into _migrations (name) values ('%s') on conflict (name) do nothing;\n" "$name"
  } | psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q
  echo "  ✓ $name"
  applied=$((applied + 1))
done

echo "Готово: применено $applied, пропущено $skipped."
