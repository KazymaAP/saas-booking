// служебное/scripts/widths.cjs — проверка горизонтального скролла на нестандартных ширинах
// (320 — узкий телефон, 768 — планшет между брейкпоинтами).
const { chromium } = require('@playwright/test');
const fs = require('fs');

const CHROME = process.env.SHOOT_CHROME
  || 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

const PATHS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/', '/d/vippro', '/test/ful/sts', '/test/ful/sts/d/vippro/admin', '/test/ful/sts/admin', '/GERA', '/dev/templates/beauty'];

const WIDTHS = [320, 768];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const target of PATHS) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU' });
      const page = await ctx.newPage();
      let status = 0;
      try {
        const r = await page.goto(BASE + target, { waitUntil: 'networkidle', timeout: 45000 });
        status = r ? r.status() : 0;
      } catch { /* nav */ }
      try {
        const a = page.locator('button:has-text("Принять"), button:has-text("Согласен")');
        if (await a.count()) await a.first().click({ timeout: 1200 });
      } catch { /* нет баннера */ }
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const d = document.documentElement;
        const vw = d.clientWidth;
        const off = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1) {
            off.push(`${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.slice(0, 60) : ''} +${Math.round(r.right - vw)}`);
            if (off.length >= 3) break;
          }
        }
        return { over: d.scrollWidth - d.clientWidth, off };
      }).catch(() => ({ over: -1, off: [] }));
      console.log(`${status} ${String(width).padStart(3)} ${target} over=${m.over}${m.off.length ? ' ' + JSON.stringify(m.off) : ''}`);
      await ctx.close();
    }
  }
  await browser.close();
})();
