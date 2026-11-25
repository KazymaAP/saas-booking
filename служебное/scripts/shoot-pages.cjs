// служебное/scripts/shoot-pages.cjs — скриншоты ключевых страниц для визуальной проверки.
// Запуск: node служебное/scripts/shoot-pages.cjs [ширина]
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const width = Number(process.argv[2] || 390);

const PAGES = [
  ['home', '/'],
  ['oferta', '/oferta'],
  ['storefront', '/d/vippro'],
  ['my-login', '/d/vippro/my/login'],
  ['cabinet-login', '/d/vippro/admin/login'],
  ['partner', '/partner'],
  ['data-request', '/data-request'],
  ['gera', '/GERA'],
  ['copy-hub', '/test/ful/sts'],
  ['copy-cabinet', '/test/ful/sts/d/vippro/admin'],
  ['not-found', '/nesushchestvuyushchaya-stranica'],
];

(async () => {
  const dir = path.join('служебное', 'out', `shots-${width}`);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [name, url] of PAGES) {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(700);
    // Прячем баннер cookie: он перекрывает низ страницы на каждом снимке.
    await page.evaluate(() => {
      document.querySelectorAll('[class*="cookie" i], [id*="cookie" i]').forEach((el) => {
        const box = el.getBoundingClientRect();
        if (box.bottom > window.innerHeight - 200) el.style.display = 'none';
      });
    });
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
    console.log(`${name}: ${path.join(dir, `${name}.png`)}`);
  }
  await browser.close();
})();
