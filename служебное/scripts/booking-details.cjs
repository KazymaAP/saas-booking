// служебное/scripts/booking-details.cjs — шаги «данные» и «проверка» в шторке записи.
// Запись НЕ создаётся: проверяем валидацию, маску телефона и сводку перед подтверждением.
// Запуск: node служебное/scripts/booking-details.cjs [slug]
const { chromium } = require('@playwright/test');
const fs = require('node:fs');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const SLUG = process.argv[2] || 'vippro';

const errors = () => [...document.querySelectorAll('.text-brand-error')].map((e) => e.textContent.trim()).filter(Boolean);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));

  await page.goto(`${BASE}/d/${SLUG}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.locator('button').filter({ hasText: /Записаться/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.service-row').first().click();
  await page.waitForTimeout(2000);

  const free = page.locator('.time-chip:not([disabled])').first();
  if ((await free.count()) === 0) { console.log('нет свободных окон — шаг не проверить'); await browser.close(); return; }
  await free.click();
  await page.waitForTimeout(200);
  await page.locator('button').filter({ hasText: /Продолжить/ }).click();
  await page.waitForTimeout(500);

  const report = { slug: SLUG };

  // 1. Пустая форма.
  await page.locator('button[type="submit"]').filter({ hasText: /Проверить запись/ }).click();
  await page.waitForTimeout(300);
  report.emptyFormErrors = await page.evaluate(errors);
  report.stillOnDetails = (await page.locator('#niche-name').count()) > 0;

  // 2. Кривой телефон.
  await page.fill('#niche-name', 'Тест');
  await page.fill('#niche-phone', '123');
  await page.locator('button[type="submit"]').filter({ hasText: /Проверить запись/ }).click();
  await page.waitForTimeout(300);
  report.badPhoneErrors = await page.evaluate(errors);
  report.phoneMasked = await page.inputValue('#niche-phone');

  // 3. Корректные данные.
  await page.fill('#niche-phone', '9991234567');
  await page.waitForTimeout(200);
  report.phoneMaskedValid = await page.inputValue('#niche-phone');
  const detailLabel = await page.locator('label[for="niche-detail"]').textContent();
  report.detailLabel = detailLabel?.trim();
  await page.fill('#niche-detail', 'Toyota Camry');
  await page.locator('button[type="submit"]').filter({ hasText: /Проверить запись/ }).click();
  await page.waitForTimeout(700);

  report.reachedReview = (await page.locator('text=Заезд').count()) > 0;
  report.reviewText = await page.evaluate(() => {
    const dl = document.querySelector('dl');
    if (!dl) return null;
    return [...dl.querySelectorAll('div')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()).slice(0, 6);
  });
  report.reviewButtons = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
  );
  report.errorsAtReview = await page.evaluate(errors);
  report.consoleErrors = consoleErrors;

  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync('служебное/out/booking-details.json', JSON.stringify(report, null, 1), 'utf8');

  console.log(JSON.stringify(report, null, 1));
  await browser.close();
})();
