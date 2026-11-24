// служебное/scripts/sites.cjs — обход всех живых сайтов сервисов: код ответа,
// ошибки консоли, упавшие запросы. Один вьюпорт, без снимков.
const { chromium } = require('@playwright/test');
const fs = require('fs');

const CHROME = process.env.SHOOT_CHROME
  || 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';

(async () => {
  let xml = '';
  for (let attempt = 1; attempt <= 5 && !xml; attempt++) {
    try {
      xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
    } catch (e) {
      console.log(`sitemap: попытка ${attempt} — ${e.cause?.code || e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  if (!xml) throw new Error('sitemap недоступен');
  const slugs = [...xml.matchAll(/<loc>[^<]*\/d\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  console.log('сайтов в карте:', slugs.length);

  const browser = await chromium.launch({ executablePath: CHROME });
  const bad = [];
  let i = 0;
  const CONC = 4;

  async function worker() {
    while (i < slugs.length) {
      const slug = slugs[i++];
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 160)));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (/429|Failed to load resource/.test(t)) return;
        errs.push(t.slice(0, 160));
      });
      let status = 0;
      try {
        const r = await page.goto(`${BASE}/d/${slug}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        status = r ? r.status() : 0;
        await page.waitForTimeout(1200);
      } catch (e) {
        errs.push('NAV ' + String(e).slice(0, 120));
      }
      const h1 = await page.evaluate(() => (document.querySelector('h1') || {}).textContent?.trim().slice(0, 60) || '').catch(() => '');
      if (status !== 200 || errs.length || !h1) bad.push({ slug, status, errs: [...new Set(errs)].slice(0, 3), h1 });
      await ctx.close();
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await browser.close();

  fs.writeFileSync('служебное/out/sites.json', JSON.stringify({ total: slugs.length, bad }, null, 2));
  console.log(`проверено: ${slugs.length}, проблемных: ${bad.length}`);
  for (const b of bad) console.log(`${b.status} /d/${b.slug} h1="${b.h1}" ${JSON.stringify(b.errs)}`);
})();
