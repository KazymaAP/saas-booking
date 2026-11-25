// служебное/scripts/mobile-sheet.cjs — шторка записи на узком телефоне (360 px).
//
// Зачем: основная доля посетителей — мобильные, а шторка держит горизонтальную полосу дней
// и сетку окон. Проверяем, что ничего не вылезает за экран, кнопка шага видна и нажимается,
// а не уезжает под системную панель.
// Запуск: node служебное/scripts/mobile-sheet.cjs [slug ...]
const { chromium } = require('@playwright/test');
const fs = require('node:fs');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const SITES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['vippro', 'begemot'];
const VIEWPORT = { width: 360, height: 640 };

async function check(page, slug) {
  await page.setViewportSize(VIEWPORT);
  await page.goto(`${BASE}/d/${slug}`, { waitUntil: 'networkidle', timeout: 45000 });

  const pageOverflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

  const cta = page.locator('button').filter({ hasText: /Записаться/ }).first();
  if ((await cta.count()) === 0) return { slug, error: 'нет кнопки «Записаться»' };
  await cta.click();
  await page.waitForTimeout(500);

  const service = page.locator('.service-row').first();
  if ((await service.count()) === 0) return { slug, error: 'нет .service-row' };
  await service.click();
  await page.waitForTimeout(1800);

  const geometry = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) };
    };
    const sheet = document.querySelector('[role="dialog"]');
    const chips = [...document.querySelectorAll('.time-chip')];
    const days = [...document.querySelectorAll('.day-chip')];
    const next = [...document.querySelectorAll('button')].find((b) => /Продолжить/.test(b.textContent || ''));
    const outside = (els) => els.filter((e) => e.getBoundingClientRect().right > vw + 1 || e.getBoundingClientRect().left < -1).length;
    return {
      vw,
      scrollW: document.documentElement.scrollWidth,
      sheet: box(sheet),
      sheetOverflowX: sheet ? Math.round(sheet.scrollWidth - sheet.clientWidth) : null,
      timeChips: chips.length,
      timeChipsOutside: outside(chips),
      dayChips: days.length,
      dayChipsOutside: outside(days),
      next: box(next),
      nextDisabled: next ? next.disabled : null,
      // Шторка прокручивается внутри: низ кнопки не должен быть ниже вьюпорта после прокрутки.
      sheetScrollable: sheet ? sheet.scrollHeight > sheet.clientHeight : null,
    };
  });

  // Дотягиваемся до кнопки шага и проверяем, что она реально нажимается.
  const nextBtn = page.locator('button').filter({ hasText: /Продолжить/ }).first();
  let clickable = null;
  if ((await nextBtn.count()) > 0) {
    const freeChip = page.locator('.time-chip:not([disabled])').first();
    if ((await freeChip.count()) > 0) await freeChip.click();
    await page.waitForTimeout(300);
    try {
      await nextBtn.click({ timeout: 3000 });
      clickable = true;
      await page.waitForTimeout(400);
    } catch {
      clickable = false;
    }
  }

  const problems = [];
  if (geometry.scrollW > geometry.vw) problems.push(`страница шире экрана: ${geometry.scrollW} > ${geometry.vw}`);
  if (geometry.sheet && geometry.sheet.w > geometry.vw) problems.push(`шторка шире экрана: ${geometry.sheet.w} > ${geometry.vw}`);
  if (geometry.sheetOverflowX && geometry.sheetOverflowX > 1) problems.push(`внутри шторки горизонтальная прокрутка: +${geometry.sheetOverflowX}px`);
  if (geometry.timeChipsOutside > 0) problems.push(`окна времени вылезают за экран: ${geometry.timeChipsOutside}`);
  if (geometry.dayChipsOutside > 0) problems.push(`дни вылезают за экран: ${geometry.dayChipsOutside}`);
  if (clickable === false) problems.push('кнопка «Продолжить» не нажимается');

  return { slug, geometry, pageOverflow, clickable, problems, verdict: problems.length ? `BAD: ${problems.join('; ')}` : 'ok' };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });

  const results = [];
  for (const slug of SITES) {
    try {
      results.push(await check(page, slug));
    } catch (error) {
      results.push({ slug, error: String(error).slice(0, 300) });
    }
  }

  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync('служебное/out/mobile-sheet.json', JSON.stringify({ checkedAt: new Date().toISOString(), viewport: VIEWPORT, results, consoleErrors }, null, 1), 'utf8');

  for (const r of results) {
    if (r.error) {
      console.log(`\n[${r.slug}] ОШИБКА: ${r.error}`);
      continue;
    }
    const g = r.geometry;
    console.log(`\n[${r.slug}] экран ${g.vw}px | страница ${g.scrollW}px | шторка ${g.sheet ? g.sheet.w + 'px' : '—'}`);
    console.log(`  окна: ${g.timeChips} (за экраном ${g.timeChipsOutside}), дни: ${g.dayChips} (за экраном ${g.dayChipsOutside})`);
    console.log(`  «Продолжить»: ${g.next ? `left=${g.next.left} right=${g.next.right} disabled=${g.nextDisabled}` : 'не найдена'} | нажимается: ${r.clickable}`);
    console.log(`  ${r.verdict}`);
  }
  if (consoleErrors.length > 0) console.log(`\nконсольные ошибки: ${consoleErrors.length} — ${consoleErrors[0]}`);
  await browser.close();
})();
