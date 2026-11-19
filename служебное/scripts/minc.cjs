// служебное/scripts/minc.cjs — кто задаёт min-content ширину в супер-админке.
const { chromium } = require('@playwright/test');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/test/ful/sts/admin', { waitUntil: 'networkidle', timeout: 45000 });
  const out = await page.evaluate(() => {
    const sw = () => document.documentElement.scrollWidth;
    const base = sw();
    // Находим секцию с двумя карточками
    const section = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Последняя активность'));
    if (!section) return 'no section';
    const rows = [];
    for (const card of section.children) {
      const prev = card.style.display;
      card.style.display = 'none';
      const now = sw();
      card.style.display = prev;
      rows.push({
        cls: (typeof card.className === 'string' ? card.className : '').slice(0, 50),
        text: (card.textContent || '').trim().slice(0, 40),
        overflowWithout: now - 390,
      });
    }
    // Внутри второй карточки ищем самый широкий элемент
    const inner = [];
    for (const n of section.querySelectorAll('*')) {
      const r = n.getBoundingClientRect();
      if (r.width > 350) {
        const cs = getComputedStyle(n);
        inner.push({
          tag: n.tagName.toLowerCase(),
          cls: (typeof n.className === 'string' ? n.className : '').slice(0, 60),
          w: Math.round(r.width),
          minW: cs.minWidth,
          ws: cs.whiteSpace,
          text: (n.textContent || '').trim().slice(0, 35),
        });
      }
    }
    return { base: base - 390, rows, inner: inner.slice(0, 12) };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
