// служебное/scripts/find-superadmin.cjs — найти auth-пользователя супер-админа по email.
// Запуск: node служебное/scripts/find-superadmin.cjs
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
const EMAIL = (env.SUPERADMIN_EMAILS || '').split(',')[0].trim();

if (!URL_ || !KEY) {
  console.error('нет URL или service_role');
  process.exit(1);
}

async function api(p) {
  const res = await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

(async () => {
  console.log('project:', URL_);
  console.log('ищем:', EMAIL);
  const data = await api();
  const users = data.users || data;
  const hit = users.find((u) => (u.email || '').toLowerCase() === EMAIL.toLowerCase());
  if (!hit) {
    console.log('не найден среди', users.length, 'пользователей');
    console.log(users.slice(0, 10).map((u) => u.email).join('\n'));
    return;
  }
  console.log('id:', hit.id);
  console.log('email:', hit.email);
  console.log('created:', hit.created_at);
  console.log('last_sign_in:', hit.last_sign_in_at);
  console.log('confirmed:', hit.email_confirmed_at);
})();
