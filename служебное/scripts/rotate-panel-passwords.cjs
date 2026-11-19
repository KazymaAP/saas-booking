#!/usr/bin/env node
// служебное/scripts/rotate-panel-passwords.cjs — смена дефолтного пароля на уникальные.
//
// Зачем: кабинеты заводились скриптом provision-service-admins.cjs с одним паролем на всех.
// Любой, кто знал slug (а slug'и лежали в открытом /gera-data.json), мог войти в чужой кабинет.
// Скрипт выдаёт каждому аккаунту свой пароль и поднимает must_change_password:
// до смены пароля владельцем кабинет не открывается (см. layout кабинета).
//
// Запуск:
//   node служебное/scripts/rotate-panel-passwords.cjs                 # только отчёт
//   node служебное/scripts/rotate-panel-passwords.cjs --apply         # сменить пароли
//
// Результат: служебное/out/panel-passwords-<дата>.csv (в git не попадает) — его и рассылают владельцам.
// Повторный запуск меняет пароли снова: старый CSV после этого недействителен.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { generatePanelPassword } = require('./lib/panel-password.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const DOMAIN = 'panel.zapishisya.ru';
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) throw new Error('.env.local не найден');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function api(pathname, init = {}) {
  const res = await fetch(`${URL}${pathname}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const r = await api(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!r.ok) throw new Error(`Список пользователей: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const batch = r.body?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  console.log(APPLY ? '=== РЕЖИМ ЗАПИСИ: пароли будут сменены ===' : '=== ПРОСМОТР (ничего не меняется) ===');

  const users = (await listAllAuthUsers()).filter((u) => (u.email || '').toLowerCase().endsWith(`.${DOMAIN}`));
  console.log(`Аккаунтов кабинетов: ${users.length}`);
  if (users.length === 0) return;

  // Слаг кабинета = вторая часть адреса: admin@<slug>.panel.zapishisya.ru
  const slugOf = (email) => String(email).split('@')[1]?.replace(`.${DOMAIN}`, '') ?? '';

  const rows = [];
  let changed = 0;
  let failed = 0;

  for (const user of users) {
    const email = String(user.email || '').toLowerCase();
    const slug = slugOf(email);
    const line = { slug, email, password: '' };

    if (!APPLY) {
      line.password = '(будет сгенерирован)';
      rows.push(line);
      continue;
    }

    try {
      const password = generatePanelPassword();
      const updated = await api(`/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      });
      if (!updated.ok) throw new Error(`auth ${updated.status}: ${JSON.stringify(updated.body).slice(0, 160)}`);

      // Флаг обязательной смены: кабинет не откроется, пока владелец не задаст свой пароль.
      const flagged = await api(`/rest/v1/admin_users?auth_user_id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ must_change_password: true }),
      });
      if (!flagged.ok) throw new Error(`admin_users ${flagged.status}: ${JSON.stringify(flagged.body).slice(0, 160)}`);

      line.password = password;
      changed += 1;
    } catch (error) {
      line.password = `ОШИБКА: ${error.message}`;
      failed += 1;
    }
    rows.push(line);
  }

  rows.sort((a, b) => a.slug.localeCompare(b.slug));

  if (!APPLY) {
    console.log(`Будет сменено: ${rows.length}`);
    console.log('Примеры адресов:', rows.slice(0, 5).map((r) => r.email).join(', '));
    console.log('\nНичего не записано. Повторите с --apply.');
    return;
  }

  // Пароли — только в файл вне git: в консоль и в логи они не попадают.
  const outDir = path.join(ROOT, 'служебное', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `panel-passwords-${stamp}.csv`);
  fs.writeFileSync(
    outFile,
    ['slug;login;password', ...rows.map((r) => [csvCell(r.slug), csvCell(r.email), csvCell(r.password)].join(';'))].join('\n'),
    'utf8',
  );

  console.log(`\nсменено: ${changed} · ошибок: ${failed}`);
  console.log(`файл с паролями: ${outFile}`);
  console.log('Передайте пароли владельцам: при первом входе кабинет попросит задать свой.');
}

main().catch((error) => {
  console.error('Сбой:', error.message);
  process.exit(1);
});
