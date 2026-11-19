// служебное/scripts/booking.cjs — снимки шторки записи (главный пользовательский путь).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';
const outDir = 'служебное/out/shots4';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const [name, width, height] of [['d', 1440, 900], ['m', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'ru-RU' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/d/vippro', { waitUntil: 'networkidle', timeout: 45000 });
    try {
      const accept = page.locator('button:has-text("Принять")');
      if (await accept.count()) await accept.first().click({ timeout: 1500 });
    } catch { /* нет баннера */ }
    // Открываем запись через кнопку в шапке-герое.
    await page.locator('button:has-text("Записаться")').first().click({ timeout: 8000 }).catch((e) => console.log('click fail', String(e).slice(0, 80)));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${outDir}/sheet1-${name}.png` });
    // Выбираем услугу, чтобы увидеть следующий шаг.
    const svc = page.locator('.sheet button').filter({ hasText: '₽' }).first();
    if (await svc.count()) { await svc.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(800); }
    await page.screenshot({ path: `${outDir}/sheet2-${name}.png` });
    console.log(name, 'ok');
    await ctx.close();
  }
  await browser.close();
})();
