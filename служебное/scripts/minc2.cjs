// служебное/scripts/minc2.cjs — измеряем min-content по дереву и ищем виновника.
const { chromium } = require('@playwright/test');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/test/ful/sts/admin', { waitUntil: 'networkidle', timeout: 45000 });
  const out = await page.evaluate(() => {
    const section = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Последняя активность'));
    const card = section.children[0];
    const results = [];
    const measure = (el, depth) => {
      if (depth > 6) return;
      const prevW = el.style.width;
      const prevWs = el.style.whiteSpace;
      el.style.width = 'min-content';
      const mc = Math.round(el.getBoundingClientRect().width);
      el.style.width = prevW;
      el.style.whiteSpace = prevWs;
      results.push({
        depth,
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 55),
        minContent: mc,
        ws: getComputedStyle(el).whiteSpace,
        minW: getComputedStyle(el).minWidth,
        text: el.children.length === 0 ? (el.textContent || '').trim().slice(0, 40) : '',
      });
      if (mc > 350) for (const c of el.children) measure(c, depth + 1);
    };
    measure(card, 0);
    return results.slice(0, 24);
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
