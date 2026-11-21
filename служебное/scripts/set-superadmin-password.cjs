// служебное/scripts/set-superadmin-password.cjs — выставить новый пароль супер-админу
// и сразу проверить его входом по email/паролю.
// Запуск: node служебное/scripts/set-superadmin-password.cjs <новый-пароль>
const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...loadEnv(path.join(process.cwd(), '.env')), ...loadEnv(path.join(process.cwd(), '.env.local')) };
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = (env.SUPERADMIN_EMAILS || '').split(',')[0].trim();
const PASSWORD = process.argv[2];

if (!PASSWORD || PASSWORD.length < 12) {
  console.error('нужен пароль >= 12 символов аргументом');
  process.exit(1);
}

async function retry(label, fn, attempts = 5) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.log(`${label}: попытка ${i} не удалась (${e.cause?.code || e.message})`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw last;
}

(async () => {
  const list = await retry('список', async () => {
    const listRes = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    return listRes.json();
  });
  const user = (list.users || []).find((u) => (u.email || '').toLowerCase() === EMAIL.toLowerCase());
  if (!user) throw new Error('супер-админ не найден');

  await retry('обновление', async () => {
    const upd = await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    if (!upd.ok) throw new Error(`update ${upd.status} ${(await upd.text()).slice(0, 200)}`);
    return true;
  });
  console.log('пароль обновлён для', EMAIL);

  // Проверка: реальный вход по паролю тем же способом, что делает форма.
  const body = await retry('вход', async () => {
    const signin = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const json = await signin.json();
    if (!signin.ok) throw new Error(`signin ${signin.status} ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  });
  console.log('вход проверен: ok, access_token есть:', Boolean(body.access_token));
})();
