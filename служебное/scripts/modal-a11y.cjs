// служебное/scripts/modal-a11y.cjs — доступность шторки записи с клавиатуры.
// Проверяет: куда попадает фокус при открытии, ловится ли Tab внутри диалога,
// закрывается ли по Escape, возвращается ли фокус на кнопку после закрытия.
const { chromium } = require('@playwright/test');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';

async function describeActive(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'null';
    const inDialog = !!el.closest('[role="dialog"]');
    const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${inDialog ? ' [в диалоге]' : ' [ВНЕ диалога]'} — ${label}`;
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/d/vippro`, { waitUntil: 'networkidle', timeout: 45000 });

  const trigger = page.locator('button').filter({ hasText: /Записаться/ }).first();
  await trigger.focus();
  await trigger.click();
  await page.waitForTimeout(900);

  console.log('диалог открыт:', await page.locator('[role="dialog"]').count());
  console.log('фокус сразу после открытия:', await describeActive(page));

  // 12 нажатий Tab: если фокус уходит за пределы диалога — ловушки нет.
  let escaped = null;
  const trail = [];
  for (let i = 1; i <= 12; i++) {
    await page.keyboard.press('Tab');
    const d = await describeActive(page);
    trail.push(`  tab ${i}: ${d}`);
    if (d.includes('ВНЕ диалога') && escaped === null) escaped = i;
  }
  console.log(trail.join('\n'));
  console.log('фокус вышел за пределы диалога на шаге:', escaped ?? 'нет');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  console.log('Escape закрыл диалог:', (await page.locator('[role="dialog"]').count()) === 0);
  console.log('фокус после Escape:', await describeActive(page));

  // Закрытие крестиком и возврат фокуса.
  if ((await page.locator('[role="dialog"]').count()) > 0) {
    await page.locator('[role="dialog"] button[aria-label="Закрыть"]').click();
    await page.waitForTimeout(700);
  }
  console.log('после закрытия крестиком фокус:', await describeActive(page));

  await browser.close();
})();
