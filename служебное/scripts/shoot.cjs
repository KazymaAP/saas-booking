// служебное/scripts/shoot.cjs — снимки живых страниц для визуального аудита.
// Использование: node служебное/scripts/shoot.cjs <outDir> <path1> <path2> ...
const { chromium } = require('@playwright/test');

// Локально установлен chromium-1248, а пакет ждёт 1255 — берём то, что есть.
const CHROME = process.env.SHOOT_CHROME
  || 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const fs = require('fs');
const path = require('path');

const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';
const outDir = process.argv[2] || 'служебное/out/shots';
const targets = process.argv.slice(3);

const VIEWPORTS = [
  { name: 'd', width: 1440, height: 1000 },
  { name: 'm', width: 390, height: 844 },
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const report = [];

  for (const target of targets) {
    const safe = target.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        locale: 'ru-RU',
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 200)));

      const url = BASE + target;
      let status = 0;
      try {
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        status = resp ? resp.status() : 0;
      } catch (e) {
        errors.push('NAV ' + String(e).slice(0, 160));
      }

      // Гасим баннер cookie, иначе он перекрывает низ страницы на снимке.
      try {
        const accept = page.locator('button:has-text("Принять"), button:has-text("Согласен")');
        if (await accept.count()) await accept.first().click({ timeout: 1500 });
      } catch { /* нет баннера — нормально */ }

      await page.waitForTimeout(400);

      // Метрики, которые нужны для аудита вёрстки.
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflowX = doc.scrollWidth - doc.clientWidth;
        // Элементы, вылезающие за вьюпорт по горизонтали.
        const offenders = [];
        const vw = doc.clientWidth;
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1 || r.left < -1) {
            const cls = typeof el.className === 'string' ? el.className.slice(0, 90) : '';
            offenders.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right) });
            if (offenders.length >= 8) break;
          }
        }
        // Кнопки и ссылки меньше 40px по меньшей стороне (mobile tap target).
        const smallTaps = [];
        for (const el of document.querySelectorAll('a[href], button')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (Math.min(r.width, r.height) < 32) {
            const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
            smallTaps.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
            if (smallTaps.length >= 10) break;
          }
        }
        return {
          title: document.title,
          h1: (document.querySelector('h1') || {}).textContent?.trim().slice(0, 90) || null,
          docHeight: doc.scrollHeight,
          overflowX,
          offenders,
          smallTaps,
        };
      }).catch(() => ({ error: 'eval failed' }));

      const file = path.join(outDir, `${safe}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});

      report.push({ target, vp: vp.name, status, url, file, errors: errors.slice(0, 6), metrics });
      await ctx.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  for (const r of report) {
    console.log(`${r.status} ${r.vp} ${r.target}  h=${r.metrics.docHeight ?? '?'} overflowX=${r.metrics.overflowX ?? '?'} err=${r.errors.length}`);
    if (r.metrics.overflowX > 0) console.log('   OVERFLOW', JSON.stringify(r.metrics.offenders));
    if (r.errors.length) console.log('   ERR', JSON.stringify(r.errors));
  }
})();
