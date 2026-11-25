// служебное/scripts/css-classes.cjs — проверка, что классы, которые реально стоят в разметке,
// определены в CSS. Опечатка в имени утилиты Tailwind не ломает сборку и не видна в HTML:
// элемент просто наследует цвет и остаётся нечитаемым. Проверяем вычисленный стиль.
// Запуск: node служебное/scripts/css-classes.cjs [slug]
const { chromium } = require('@playwright/test');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const SLUG = process.argv[2] || 'vippro';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/d/${SLUG}`, { waitUntil: 'networkidle', timeout: 45000 });

  const report = await page.evaluate(() => {
    // Все элементы, у которых в className есть подстрока, похожая на цвет акцента.
    const targets = [...document.querySelectorAll('[class*="accent-on"]')].map((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        color: cs.color,
        background: cs.backgroundColor,
        text: (el.textContent || '').trim().slice(0, 20),
      };
    });
    // Какие вообще утилиты цвета акцента существуют в подключённых стилях.
    const sheetText = [...document.styleSheets]
      .map((s) => {
        try {
          return [...s.cssRules].map((r) => r.cssText).join('\n');
        } catch {
          return '';
        }
      })
      .join('\n');
    const has = (needle) => sheetText.includes(needle);
    return {
      targets,
      cssHasAccentOn: has('--color-accent-on') || /accent-on/.test(sheetText),
      cssBytes: sheetText.length,
    };
  });

  console.log(`CSS правил: ${report.cssBytes} символов, упоминание accent-on: ${report.cssHasAccentOn}`);
  if (report.targets.length === 0) console.log('элементов с accent-on нет');
  for (const t of report.targets) {
    console.log(`  <${t.tag}> "${t.text}" color=${t.color} bg=${t.background}`);
    console.log(`     class=${t.cls.slice(0, 160)}`);
  }
  await browser.close();
})();
