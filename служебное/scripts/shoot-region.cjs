// служебное/scripts/shoot-region.cjs — снимки отдельных участков страницы в масштабе 1:1.
// Использование: node служебное/scripts/shoot-region.cjs <path> <outName> <y> <height> [width]
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';
const CHROME = process.env.SHOOT_CHROME
  || 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const outDir = 'служебное/out/shots';

(async () => {
  const [, , target, outName, yArg, hArg, wArg] = process.argv;
  const width = Number(wArg || 1440);
  const y = Number(yArg || 0);
  const height = Number(hArg || 900);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + target, { waitUntil: 'networkidle', timeout: 45000 });
  try {
    const accept = page.locator('button:has-text("Принять"), button:has-text("Согласен")');
    if (await accept.count()) await accept.first().click({ timeout: 1500 });
  } catch { /* нет баннера */ }
  await page.waitForTimeout(400);
  const file = path.join(outDir, `${outName}.png`);
  await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y, width, height } });
  console.log(file);
  await browser.close();
})();
