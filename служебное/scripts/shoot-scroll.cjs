// служебное/scripts/shoot-scroll.cjs — снимки по экранам (viewport), без артефакта fixed-фона.
// Использование: node служебное/scripts/shoot-scroll.cjs <path> <outName> [width] [height] [screens]
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const outDir = 'служебное/out/shots3';

(async () => {
  const [, , target, outName, wArg, hArg, sArg] = process.argv;
  const width = Number(wArg || 1440);
  const height = Number(hArg || 900);
  const screens = Number(sArg || 3);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + target, { waitUntil: 'networkidle', timeout: 45000 });
  try {
    const accept = page.locator('button:has-text("Принять"), button:has-text("Согласен")');
    if (await accept.count()) await accept.first().click({ timeout: 1500 });
  } catch { /* нет баннера */ }
  await page.waitForTimeout(500);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let i = 0; i < screens; i++) {
    const y = Math.round((total - height) * (screens === 1 ? 0 : i / (screens - 1)));
    await page.evaluate((yy) => window.scrollTo(0, yy), Math.max(0, y));
    await page.waitForTimeout(350);
    const file = path.join(outDir, `${outName}-${i}.png`);
    await page.screenshot({ path: file });
    console.log(file, 'y=', Math.max(0, y), 'of', total);
  }
  await browser.close();
})();
