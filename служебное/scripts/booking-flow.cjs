// служебное/scripts/booking-flow.cjs — проверка шага «дата и время» в шторке записи на живом сайте.
// Что ловит: шторка открывается на дне, где свободного времени не осталось (вечером «сегодня»
// ещё в полосе, но все окна в прошлом) — посетитель видит стену недоступных кнопок.
// Запуск: node служебное/scripts/booking-flow.cjs [slug ...]
const { chromium } = require('@playwright/test');
const fs = require('node:fs');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const SITES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['vippro', 'begemot'];

async function scanSite(page, slug) {
  await page.goto(`${BASE}/d/${slug}`, { waitUntil: 'networkidle', timeout: 45000 });
  const cta = page.locator('button').filter({ hasText: /Записаться/ }).first();
  if ((await cta.count()) === 0) return { slug, error: 'нет кнопки «Записаться»' };
  await cta.click();
  await page.waitForTimeout(600);

  const service = page.locator('.service-row').first();
  if ((await service.count()) === 0) return { slug, error: 'нет .service-row в шторке' };
  await service.click();
  await page.waitForTimeout(2000);

  // Что выбралось само, без участия человека.
  const auto = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.time-chip')];
    const next = [...document.querySelectorAll('button')].find((b) => /Продолжить/.test(b.textContent || ''));
    return {
      day: document.querySelector('.day-chip.is-active')?.textContent?.replace(/\s+/g, ' ') ?? null,
      total: chips.length,
      free: chips.filter((c) => !c.disabled).length,
      nextEnabled: next ? !next.disabled : null,
      hint: document.querySelector('[data-hint], .hint')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    };
  });

  // Обходим все дни полосы, чтобы понять, был ли вообще день со слотами.
  const days = [];
  const count = await page.locator('.day-chip').count();
  for (let i = 0; i < count; i++) {
    const chip = page.locator('.day-chip').nth(i);
    await chip.click();
    await page.waitForTimeout(1100);
    days.push(
      await page.evaluate(() => {
        const chips = [...document.querySelectorAll('.time-chip')];
        return {
          day: document.querySelector('.day-chip.is-active')?.textContent?.replace(/\s+/g, ' ') ?? null,
          total: chips.length,
          free: chips.filter((c) => !c.disabled).length,
        };
      }),
    );
  }

  const bestFree = days.reduce((max, d) => Math.max(max, d.free), 0);
  const verdict = auto.free > 0 ? 'ok' : bestFree > 0 ? 'BAD: открылись на пустом дне, хотя есть день со слотами' : 'empty: слотов нет нигде';
  return { slug, auto, days, bestFree, verdict };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });

  const results = [];
  for (const slug of SITES) {
    try {
      results.push(await scanSite(page, slug));
    } catch (error) {
      results.push({ slug, error: String(error).slice(0, 300) });
    }
  }

  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync(
    'служебное/out/booking-flow.json',
    JSON.stringify({ checkedAt: new Date().toISOString(), results, consoleErrors }, null, 1),
    'utf8',
  );

  for (const r of results) {
    if (r.error) {
      console.log(`\n[${r.slug}] ОШИБКА: ${r.error}`);
      continue;
    }
    console.log(`\n[${r.slug}] авто-день: ${r.auto.day} | свободно ${r.auto.free}/${r.auto.total} | «Продолжить» ${r.auto.nextEnabled ? 'активна' : 'ВЫКЛЮЧЕНА'}`);
    console.log(`  лучший день в полосе: ${r.bestFree} свободных`);
    console.log(`  ${r.verdict}`);
    if (r.verdict.startsWith('BAD')) {
      console.log('  дни: ' + r.days.map((d) => `${d.day}=${d.free}/${d.total}`).join(', '));
    }
  }
  if (consoleErrors.length > 0) console.log(`\nконсольные ошибки: ${consoleErrors.length}`);
  await browser.close();
})();
