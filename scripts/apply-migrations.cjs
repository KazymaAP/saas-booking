// scripts/apply-migrations.cjs — накатывает миграции 0001–0014 на Supabase/Postgres одной командой.
// Идемпотентно: ведёт таблицу _applied_migrations, пропускает уже применённые.
// Использует pg из изолированного workspace (NODE_PATH), чтобы не трогать package-lock проекта.
//
// Запуск (из корня проекта):
//   NODE_PATH="$HOME/.workbuddy-ai/binaries/node/workspace/node_modules" \
//   MIGRATION_DB_URL="postgresql://postgres:<db-password>@127.0.0.1:5432/postgres" \
//   node scripts/apply-migrations.cjs
//
// MIGRATION_DB_URL — строка подключения к БД. Для локального Supabase (supabase start) это
//   postgresql://postgres:postgres@127.0.0.1:5432/postgres (пароль из supabase/config.toml).
// Для Supabase Cloud — Transaction pooler (порт 6543) из Dashboard → Settings → Database →
//   Connection pooling → режим Transaction → скопировать URI (пароль — пароль БД, не JWT).

const fs = require('node:fs');
const path = require('node:path');
const pg = require('pg');

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');
const DB_URL = process.env.MIGRATION_DB_URL;

if (!DB_URL) {
  console.error('❌ Задайте MIGRATION_DB_URL (строка подключения к БД, порт 5432 или pooler 6543).');
  process.exit(1);
}

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

const client = new pg.Client({ connectionString: DB_URL });

async function main() {
  await client.connect();
  console.log(`🔌 Подключено. Миграций в каталоге: ${files.length}`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await client.query('SELECT name FROM _applied_migrations');
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`⏭️  ${f} — уже применена, пропускаем`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    console.log(`▶️  Применяем ${f} …`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _applied_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      count++;
      console.log(`✅ ${f} применена`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`❌ Ошибка в ${f}: ${e.message}`);
      throw e;
    }
  }

  console.log(`\n🎉 Готово. Применено новых: ${count}, всего файлов: ${files.length}.`);
}

main()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('Миграции прерваны:', e.message);
    try { await client.end(); } catch {}
    process.exit(1);
  });
