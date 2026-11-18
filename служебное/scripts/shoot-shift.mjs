// scripts/shoot-shift.mjs — вход сотрудником и скриншоты страниц кабинета.
// Один контекст на всё: повторные входы упираются в rate-limit формы логина.
//   node scripts/shoot-shift.mjs                       — страница смены (телефон + десктоп) и замер переполнения
//   node scripts/shoot-shift.mjs /d/vippro/admin a.png — произвольный путь в один скриншот
import { chromium } from '@playwright/test';
import { setTimeout as wait } from 'node:timers/promises';

// Настройки локальной проверки — константами, а не переменными окружения: .env.example описывает
// только то, что читает приложение, и не должен пухнуть от служебных скриптов (env-example.test.ts).
const BASE = 'http://localhost:3111';
// Логин можно переопределить третьим аргументом: владелец — admin, сотрудник — master.
const LOGIN = process.argv[4] || 'master';
const PASSWORD = 'admin123';
const SLUG = 'vippro';
const EXEC = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(`${BASE}/d/${SLUG}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.fill('input[name="email"]', LOGIN);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
]);
console.log('вход:', page.url());

// Баннер cookie перекрывает низ страницы — принимаем, иначе скриншот врёт про вёрстку.
// Клик может не пройти (баннер уже скрыт анимацией) — это не повод ронять скриншот.
async function acceptCookies() {
  try {
    const accept = page.getByRole('button', { name: 'Принять' });
    if (await accept.count()) await accept.first().click({ timeout: 4000 });
  } catch {
    /* баннер уже закрыт */
  }
}

const one = process.argv[2];
if (one) {
  const out = process.argv[3] || 'shot.png';
  await page.goto(`${BASE}${one}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(1500);
  await acceptCookies();
  await page.screenshot({ path: out, fullPage: true });
  console.log('saved', out, '→', await page.title());
  await browser.close();
  process.exit(0);
}

await page.goto(`${BASE}/d/${SLUG}/receptionist`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(1200);
await acceptCookies();

const overflow = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1) bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ').slice(0, 3).join('.')} → ${Math.round(r.right)}`);
  });
  return { vw, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 6) };
});
console.log('переполнение:', JSON.stringify(overflow));

await page.screenshot({ path: 'shift-phone.png', fullPage: true });
console.log('saved shift-phone.png');

await page.setViewportSize({ width: 1280, height: 900 });
await page.reload({ waitUntil: 'domcontentloaded' });
await wait(1000);
await page.screenshot({ path: 'shift-desktop.png', fullPage: true });
console.log('saved shift-desktop.png');

// Кабинет этой же ролью: проверяем, что «Моя смена» появилась в шапке.
await page.goto(`${BASE}/d/${SLUG}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(1000);
await page.screenshot({ path: 'panel-nav.png' });
console.log('saved panel-nav.png');

await browser.close();
