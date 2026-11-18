#!/usr/bin/env node
// служебное/scripts/provision-service-admins.cjs — заводит владельца кабинета каждому сервису.
// Логин у всех один — admin, пароль по умолчанию admin123 (можно передать аргументом).
// Короткий логин разворачивается в admin@<slug>.panel.zapishisya.ru (см. resolveOwnerLogin
// в общие/lib/owner-session.ts): Supabase Auth умеет только email, а форме входа хватает «admin».
//
// Запуск:
//   node служебное/scripts/provision-service-admins.cjs            # только отчёт, ничего не пишет
//   node служебное/scripts/provision-service-admins.cjs --apply     # создать аккаунты
//   node служебное/scripts/provision-service-admins.cjs --apply --password='ДругойПароль'
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LOGIN = 'admin';
const DOMAIN = 'panel.zapishisya.ru';

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

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const passwordArg = args.find((a) => a.startsWith('--password='));
const PASSWORD = passwordArg ? passwordArg.slice('--password='.length) : 'admin123';

if (PASSWORD.length < 8) {
  console.error('Пароль короче 8 символов — Supabase Auth такой не примет.');
  process.exit(1);
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

async function main() {
  console.log(APPLY ? '=== РЕЖИМ ЗАПИСИ ===' : '=== ПРОСМОТР (ничего не меняется) ===');

  // Кабинет есть только у оплативших: status=client и активная подписка — те же условия,
  // по которым generate-gera-data.ts ставит siteUrl.
  const biz = await api('/rest/v1/businesses?select=id,slug,name,status,subscription_active&status=eq.client&subscription_active=is.true&order=slug.asc');
  if (!biz.ok) throw new Error(`Бизнесы: ${biz.status} ${JSON.stringify(biz.body).slice(0, 200)}`);
  const businesses = biz.body || [];
  console.log(`Сервисов с готовым сайтом: ${businesses.length}`);

  const existingRows = await api('/rest/v1/admin_users?select=id,business_id,auth_user_id,email,role');
  if (!existingRows.ok) throw new Error(`admin_users: ${existingRows.status}`);
  const ownersByBusiness = new Map();
  for (const row of existingRows.body || []) {
    if (row.role === 'owner') ownersByBusiness.set(row.business_id, row);
  }

  const authUsers = await listAllAuthUsers();
  const authByEmail = new Map(authUsers.map((u) => [(u.email || '').toLowerCase(), u]));
  console.log(`Пользователей в Supabase Auth сейчас: ${authUsers.length}`);

  const report = [];
  let created = 0, skipped = 0, failed = 0;

  for (const b of businesses) {
    const email = `${LOGIN}@${b.slug}.${DOMAIN}`;
    const line = { slug: b.slug, name: b.name, login: LOGIN, email };

    if (ownersByBusiness.has(b.id)) {
      line.result = `уже есть владелец (${ownersByBusiness.get(b.id).email})`;
      skipped += 1;
      report.push(line);
      continue;
    }

    if (!APPLY) {
      line.result = authByEmail.has(email) ? 'создастся связка с готовым пользователем' : 'создастся пользователь и связка';
      report.push(line);
      continue;
    }

    try {
      let user = authByEmail.get(email);
      if (!user) {
        const createdUser = await api('/auth/v1/admin/users', {
          method: 'POST',
          body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
        });
        if (!createdUser.ok) throw new Error(`auth ${createdUser.status}: ${JSON.stringify(createdUser.body).slice(0, 160)}`);
        user = createdUser.body;
      }

      const inserted = await api('/rest/v1/admin_users', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([{
          business_id: b.id,
          auth_user_id: user.id,
          email,
          name: b.name,
          role: 'owner',
          status: 'active',
        }]),
      });
      if (!inserted.ok) throw new Error(`admin_users ${inserted.status}: ${JSON.stringify(inserted.body).slice(0, 160)}`);

      line.result = 'создан';
      created += 1;
    } catch (error) {
      line.result = `ОШИБКА: ${error.message}`;
      failed += 1;
    }
    report.push(line);
  }

  const outFile = path.join(ROOT, 'служебное', 'service-admins.csv');
  fs.writeFileSync(
    outFile,
    ['slug;name;login;email;result', ...report.map((r) => [r.slug, r.name, r.login, r.email, r.result].join(';'))].join('\n'),
    'utf8',
  );

  console.log(`\nсоздано: ${created} · уже было: ${skipped} · ошибок: ${failed}`);
  console.log(`отчёт: ${outFile}`);
  if (!APPLY) console.log('\nНичего не записано. Повторите с --apply.');
}

main().catch((error) => {
  console.error('Сбой:', error.message);
  process.exit(1);
});
