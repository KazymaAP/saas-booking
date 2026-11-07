// scripts/shoot.mjs — пакетный скриншот страниц локального dev-сервера.
// Запуск: node scripts/shoot.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const OUT = '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

// Репрезентативный набор: по одному представителю каждого типа страниц.
// Динамические [param] — с заведомо несуществующими значениями (БД-то плейсхолдер),
// чтобы увидеть, как страница ведёт себя при ошибке данных (error-boundary / empty-state).
const routes = [
  ['root', '/'],
  ['auth', '/auth'],
  ['panel-login', '/panel/login'],
  ['partner-login', '/partner/login'],
  ['partner-demo', '/partner/demo'],
  ['privacy', '/privacy'],
  ['data-request', '/data-request'],
  ['blocked', '/blocked'],
  ['unsubscribe', '/unsubscribe/test-token'],
];

const errors = [];
// Используем имеющийся в кэше бинарник (проектный Playwright хочет chromium-1140, которого нет).
const EXEC = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

page.on('console', (m) => {
  if (m.type() === 'error') errors.push({ route: page.url(), text: m.text().slice(0, 300) });
});
page.on('pageerror', (e) => errors.push({ route: page.url(), text: 'PAGEERROR: ' + e.message.slice(0, 300) }));

let ok = 0, fail = 0;
for (const [name, url] of routes) {
  const full = BASE + url;
  try {
    const resp = await page.goto(full, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Даём отрендериться (dev-сервер медленный на первом hit) и осесть error-boundary.
    await page.waitForTimeout(4000);
    const status = resp ? resp.status() : 0;
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file, fullPage: true });
    const size = fs.statSync(file).size;
    console.log(`${status}  ${name.padEnd(18)} ${url.padEnd(34)} ${size}b`);
    if (status >= 500) fail++; else ok++;
  } catch (e) {
    console.log(`ERR  ${name.padEnd(18)} ${url.padEnd(34)} ${(e.message||'').split('\n')[0].slice(0,80)}`);
    fail++;
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 2));
const uniq = [...new Set(errors.map((e) => e.text))];
console.log(`\n=== ИТОГО: ok=${ok} fail=${fail}, уникальных ошибок консоли=${uniq.length}`);
console.log('=== уникальные ошибки:');
uniq.slice(0, 40).forEach((t) => console.log(' - ' + t));
