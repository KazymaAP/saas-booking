// служебное/scripts/sweep.cjs — обход всех страниц панелей на 390 px: горизонтальный скролл и ошибки.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';
const P = '/test/ful/sts';

const ROUTES = [
  `${P}/admin`,
  ...['businesses', 'clients', 'stats', 'logs', 'settings', 'templates', 'licenses', 'inbox', 'funnel', 'verticals', 'email-accounts', 'backup'].map((s) => `${P}/admin/${s}`),
  ...['bookings', 'services', 'photos', 'texts', 'reviews', 'staff', 'faq', 'notifications', 'settings', 'appearance', 'subscription', 'team', 'data'].map((s) => `${P}/d/vippro/admin/${s}`),
  `${P}/d/vippro/receptionist`,
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const rows = [];
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
    let status = 0;
    try {
      const r = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 40000 });
      status = r ? r.status() : 0;
      await page.waitForTimeout(1200);
    } catch (e) {
      errs.push('NAV ' + String(e).slice(0, 100));
    }
    const info = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = document.documentElement.scrollWidth - vw;
      let culprit = null;
      if (over > 0) {
        for (const n of document.querySelectorAll('body *')) {
          const r = n.getBoundingClientRect();
          if (r.width > vw + 1) {
            culprit = `${n.tagName.toLowerCase()}.${(typeof n.className === 'string' ? n.className : '').slice(0, 45)}`;
            break;
          }
        }
      }
      return { over, culprit, h: document.documentElement.scrollHeight };
    }).catch(() => ({ over: -1, culprit: 'eval-fail', h: 0 }));
    rows.push({ route, status, ...info, errs: errs.slice(0, 2) });
    console.log(`${String(info.over).padStart(4)} ${status} ${route}${info.culprit ? '  <- ' + info.culprit : ''}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync('служебное/out/sweep.json', JSON.stringify(rows, null, 2));
})();
