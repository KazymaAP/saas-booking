// служебное/scripts/phone-mask.cjs — как маска и валидация ведут себя на живых вариантах ввода.
// Реальные люди вставляют «8 999 123-45-67», «+7(999)1234567», «9991234567».
const { chromium } = require('@playwright/test');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const SLUG = process.argv[2] || 'vippro';

const CASES = [
  '89991234567',
  '8 999 123-45-67',
  '+7(999)1234567',
  '9991234567',
  '+7 999 123 45 67',
  '7 999 123 45 67',
  '999-123-45-67',
  '123',
  '',
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/d/${SLUG}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.locator('button').filter({ hasText: /Записаться/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.service-row').first().click();
  await page.waitForTimeout(2000);
  const free = page.locator('.time-chip:not([disabled])').first();
  await free.click();
  await page.waitForTimeout(200);
  await page.locator('button').filter({ hasText: /Продолжить/ }).click();
  await page.waitForTimeout(500);

  await page.fill('#niche-name', 'Тест');
  for (const input of CASES) {
    await page.fill('#niche-phone', '');
    await page.fill('#niche-phone', input);
    await page.waitForTimeout(120);
    const masked = await page.inputValue('#niche-phone');
    const valid = await page.evaluate(() => document.querySelector('#niche-phone')?.getAttribute('aria-invalid') !== 'true');
    console.log(`ввод "${input}" → поле "${masked}"${valid ? '' : '  ← невалидно'}`);
  }
  await browser.close();
})();
