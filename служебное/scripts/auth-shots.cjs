// Снимает auth-страницы на 1280x800 и 390x844, чтобы проверить центрирование карточки
// и цвет ссылок. Запуск:
//   MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" node служебное/scripts/auth-shots.cjs
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE || 'https://www.zapishisya.ru';
const OUT = process.env.OUT || 'C:/Users/rrrme/AppData/Local/Temp/auth-shots';

const PAGES = [
  ['admin-login', '/admin/login'],
  ['reset-password', '/reset-password?token=bogus'],
  ['magic-link', '/magic-link'],
  ['invite', '/invite/bogus'],
  ['forgot-password', '/admin/forgot-password'],
];

const VIEWPORTS = [
  ['desktop', { width: 1280, height: 800 }],
  ['mobile', { width: 390, height: 844 }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
  });
  const rows = [];
  for (const [vpName, viewport] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport });
    for (const [name, url] of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
      let status = 0;
      try {
        const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 45000 });
        status = resp ? resp.status() : 0;
      } catch (e) {
        errors.push('nav: ' + String(e.message).slice(0, 100));
      }
      const geo = await page.evaluate(() => {
        const main = document.querySelector('main');
        const link = document.querySelector('nav a');
        const de = document.documentElement;
        if (!main) return null;
        const r = main.getBoundingClientRect();
        const lr = link ? link.getBoundingClientRect() : null;
        const cs = link ? getComputedStyle(link) : null;
        return {
          mainTop: Math.round(r.top),
          mainH: Math.round(r.height),
          mainW: Math.round(r.width),
          mainBg: getComputedStyle(main).backgroundColor,
          overflow: de.scrollWidth - de.clientWidth,
          linkColor: cs ? cs.color : null,
          linkUnderline: cs ? cs.textDecorationLine : null,
          linkTop: lr ? Math.round(lr.top) : null,
        };
      });
      await page.screenshot({ path: path.join(OUT, `${vpName}-${name}.png`), fullPage: false });
      rows.push({ vpName, name, url, status, errors: errors.join(' | '), ...(geo || {}) });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(rows, null, 1));
  console.log('OUT=' + OUT);
})();
