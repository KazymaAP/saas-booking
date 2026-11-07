// scripts/apply-migrations-api.cjs — накат миграций 0001–0014 через Supabase Management API (HTTPS).
// Используется, когда прямой порт 5432 до БД недоступен (например, в песочнице агента).
// Требует аккаунт-токен Management API (НЕ service_role!): https://supabase.com/dashboard/account/tokens
//
// Запуск:
//   SUPABASE_MANAGEMENT_TOKEN=<token> SUPABASE_PROJECT_REF=oryzoexstuzgpbqvpjbr \
//   node scripts/apply-migrations-api.cjs
//
// Endpoint: POST https://api.supabase.com/v1/projects/{ref}/database/query
// Body:     {"query": "<SQL>"}

const fs = require('node:fs');
const path = require('node:path');

const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || 'oryzoexstuzgpbqvpjbr';
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

if (!TOKEN) {
  console.error('❌ Задайте SUPABASE_MANAGEMENT_TOKEN (аккаунт-токен Supabase Management API).');
  console.error('   Получить: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

async function runQuery(sql, label) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    throw new Error(`${label}: HTTP ${res.status}\n${detail}`);
  }
  return text;
}

async function main() {
  console.log(`🔌 Management API — проект ${REF}. Миграций в каталоге: ${files.length}`);

  // Таблица отслеживания (идемпотентность)
  await runQuery(
    `CREATE TABLE IF NOT EXISTS _applied_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`,
    'init _applied_migrations'
  );
  const appliedText = await runQuery('SELECT name FROM _applied_migrations;', 'select applied');
  let applied = new Set();
  try {
    const j = JSON.parse(appliedText);
    const rows = Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : (j && Array.isArray(j.result) ? j.result : []));
    applied = new Set(rows.map((r) => r && r.name).filter(Boolean));
  } catch {}

  let count = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`⏭️  ${f} — уже применена, пропускаем`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    console.log(`▶️  Применяем ${f} …`);
    await runQuery(sql, f);
    await runQuery(`INSERT INTO _applied_migrations(name) VALUES ('${f}') ON CONFLICT DO NOTHING;`, `track ${f}`);
    count++;
    console.log(`✅ ${f} применена`);
  }
  console.log(`\n🎉 Готово. Применено новых: ${count}, всего файлов: ${files.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Миграции прерваны:', e.message);
    process.exit(1);
  });
