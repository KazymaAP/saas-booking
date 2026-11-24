// служебное/scripts/title-check.cjs — меняется ли <title> после загрузки страницы.
// Гипотеза: сервер отдаёт правильный заголовок, а гидрация возвращает заголовок layout.
const { chromium } = require('@playwright/test');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const URLS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['https://www.zapishisya.ru/d/net-takogo-sajta'];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const url of URLS) {
    await page.goto(url, { waitUntil: 'commit', timeout: 45000 });
    const samples = [];
    for (const ms of [0, 300, 1200, 3000]) {
      await page.waitForTimeout(ms === 0 ? 50 : ms);
      samples.push({ at: ms, title: await page.evaluate(() => document.title), count: await page.evaluate(() => document.querySelectorAll('title').length) });
    }
    console.log(`\n${url.replace('https://www.zapishisya.ru', '')}`);
    for (const s of samples) console.log(`  +${s.at}ms: "${s.title}" (title tags: ${s.count})`);
  }
  await browser.close();
})();
