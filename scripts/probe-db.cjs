// scripts/probe-db.cjs — диагностика локального Postgres на 127.0.0.1:5432.
// Пробует常见ные creds, выводит список БД и наличие схемы auth (признак Supabase).
const pg = require('pg');

const HOST = '127.0.0.1';
const PORT = 5432;
const combos = [
  { user: 'postgres', password: 'postgres' },
  { user: 'postgres', password: '' },
  { user: 'postgres', password: 'password' },
  { user: 'postgres', password: 'mysecretpassword' },
  { user: 'supabase_admin', password: 'postgres' },
  { user: 'root', password: 'root' },
];

async function tryConnect(user, password) {
  const client = new pg.Client({ host: HOST, port: PORT, user, password, database: 'postgres', connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const ver = await client.query('SELECT version()');
    const dbs = await client.query("SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY datname");
    let authSchema = 'n/a';
    try {
      const s = await client.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name='auth'");
      authSchema = s.rowCount > 0 ? 'YES (Supabase?)' : 'no';
    } catch {}
    await client.end();
    return { ok: true, user, password, version: ver.rows[0].version.split('\n')[0], dbs: dbs.rows.map(r => r.datname), authSchema };
  } catch (e) {
    try { await client.end(); } catch {}
    return { ok: false, user, password, error: e.message.split('\n')[0] };
  }
}

(async () => {
  console.log(`🔍 Пробуем 127.0.0.1:${PORT} ...\n`);
  for (const c of combos) {
    const r = await tryConnect(c.user, c.password);
    if (r.ok) {
      console.log(`✅ УДАЛОСЬ: user=${r.user} password='${r.password}'`);
      console.log(`   version: ${r.version}`);
      console.log(`   databases: ${r.dbs.join(', ')}`);
      console.log(`   auth schema: ${r.authSchema}`);
      process.exit(0);
    } else {
      console.log(`❌ user=${r.user} password='${r.password}' → ${r.error}`);
    }
  }
  console.log('\nНе подключились ни с одним из常见ых creds. Возможно, нужны другие учётные данные.');
  process.exit(1);
})();
