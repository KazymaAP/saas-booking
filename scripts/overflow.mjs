// scripts/overflow.mjs — программная проверка горизонтального переполнения.
// Запуск: node scripts/overflow.mjs
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const routes = [
  '/',
  '/auth',
  '/panel/login',
  '/partner/login',
  '/partner/demo',
  '/privacy',
  '/data-request',
  '/blocked',
  '/unsubscribe/test-token',
];

const EXEC = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function check(url, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  try {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const be = document.body;
      const sw = Math.max(de.scrollWidth, be ? be.scrollWidth : 0);
      const cw = de.clientWidth;
      // находим элементы, выходящие за правый край вьюпорта
      const offenders = [];
      const vw = window.innerWidth;
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1.5) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.toString().slice(0, 60)) || '',
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
      }
      // уникальные по тег+класс, максимум 8
      const seen = new Set();
      const uniq = offenders.filter((o) => {
        const k = o.tag + '|' + o.cls;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, 8);
      return { scrollW: sw, clientW: cw, overflow: sw - cw, offenders: uniq };
    });
    const flag = m.overflow > 1 ? `OVERFLOW +${m.overflow}px` : 'ok';
    console.log(`${flag.padEnd(16)} ${url.padEnd(34)} scrollW=${m.scrollW} clientW=${m.clientW}`);
    if (m.offenders.length) {
      m.offenders.forEach((o) => console.log(`     ↳ <${o.tag} class="${o.cls}"> right=${o.right} width=${o.width}`));
    }
  } catch (e) {
    console.log(`ERR  ${url.padEnd(34)} ${(e.message || '').split('\n')[0].slice(0, 80)}`);
  }
  await page.close();
}

console.log('--- MOBILE 390x844 ---');
for (const r of routes) await check(r, 390, 844);
console.log('--- DESKTOP 1366x900 ---');
for (const r of routes) await check(r, 1366, 900);

await browser.close();
