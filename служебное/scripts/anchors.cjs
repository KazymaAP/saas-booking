// служебное/scripts/anchors.cjs — проверяет, что все внутренние якоря (a[href^="#"]) ведут
// на существующий элемент. Битые оглавления в юрдокументах и в разделе копий — тихий баг:
// страница отрисовывается, но клик по пункту ничего не делает.
// Запуск: MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" node служебное/scripts/anchors.cjs
const { chromium } = require('@playwright/test');

const CHROME = process.env.SHOOT_CHROME
  || 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

const PAGES = [
  '/', '/oferta', '/privacy', '/dogovor-porucheniya',
  '/test/ful/sts', '/test/ful/sts/urls', '/auth', '/partner', '/demo', '/GERA',
  '/preview/beauty', '/preview/detailing', '/preview/dentist',
  '/d/2bro', '/b/2bro', '/s/2bro',
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let totalBad = 0;
  for (const url of PAGES) {
    const page = await ctx.newPage();
    let status = 0;
    try {
      const r = await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      status = r ? r.status() : 0;
      await page.waitForTimeout(400);
    } catch (e) {
      console.log(`NAV-FAIL ${url} ${String(e.message).slice(0, 80)}`);
      await page.close();
      continue;
    }
    const res = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href^="#"]')];
      const bad = [];
      for (const a of anchors) {
        const id = decodeURIComponent(a.getAttribute('href').slice(1));
        if (!id) continue; // href="#" — кнопка «наверх», не цель
        const target = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
        if (!target) bad.push(id + ' ← ' + (a.textContent || '').trim().slice(0, 40));
      }
      return { count: anchors.length, bad };
    });
    totalBad += res.bad.length;
    const flag = res.bad.length ? 'BAD' : 'ok ';
    console.log(`${flag} ${String(status).padEnd(3)} ${url}  anchors=${res.count} broken=${res.bad.length}`);
    res.bad.slice(0, 10).forEach((b) => console.log('      #' + b));
    await page.close();
  }
  await browser.close();
  console.log(`\nTOTAL BROKEN ANCHORS: ${totalBad}`);
})();
