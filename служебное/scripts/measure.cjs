// служебное/scripts/measure.cjs — геометрия ключевых блоков шаблона.
const { chromium } = require('@playwright/test');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/d/vippro', { waitUntil: 'networkidle', timeout: 45000 });
  const out = await page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    const res = {};
    const container = document.querySelector('main > div.mx-auto');
    res.container = container ? r(container) : null;

    const grid = document.querySelector('main .order-1, main .order-2')?.parentElement;
    if (grid) {
      res.grid = r(grid);
      res.gridCols = getComputedStyle(grid).gridTemplateColumns;
      res.gridChildren = [...grid.children].map((c) => ({ cls: c.className.slice(0, 30), ...r(c) }));
    }

    // Галерея
    const galleryFig = document.querySelector('figure');
    if (galleryFig) {
      const wrap = galleryFig.parentElement;
      res.gallery = { wrap: r(wrap), cols: getComputedStyle(wrap).gridTemplateColumns, items: [...wrap.children].map(r) };
    }

    // Сайдбар: последняя карточка и низ колонки
    const aside = document.querySelector('aside');
    if (aside) {
      res.aside = r(aside);
      res.asideChildren = [...aside.children].map((c) => ({ tag: c.tagName, ...r(c) }));
    }

    // Все секции с заголовками h2 — чтобы понять вертикальный ритм
    res.sections = [...document.querySelectorAll('main section')].map((s) => {
      const h = s.querySelector('h2');
      return { h2: h ? h.textContent.trim().slice(0, 30) : null, ...r(s) };
    });

    // Ритм отступов: расстояние между концом секции и началом следующей
    res.gaps = [];
    const secs = [...document.querySelectorAll('main section')];
    for (let i = 1; i < secs.length; i++) {
      const prev = secs[i - 1].getBoundingClientRect();
      const cur = secs[i].getBoundingClientRect();
      res.gaps.push({ from: (secs[i - 1].querySelector('h2')?.textContent || '?').slice(0, 20), gap: Math.round(cur.top - prev.bottom) });
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
