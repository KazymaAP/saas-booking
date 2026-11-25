// служебное/scripts/make-og.cjs — собирает public/og.png 1200×630 для превью ссылок.
// Рисуем HTML системным шрифтом (Segoe UI с кириллицей) и снимаем скриншот:
// так текст не превращается в «квадратики», как это бывает у генераторов картинок.
// Запуск: node служебное/scripts/make-og.cjs
const { chromium } = require('@playwright/test');
const path = require('node:path');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';

const HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    background:
      radial-gradient(900px 520px at 82% -12%, rgba(34,211,238,.20), transparent 62%),
      radial-gradient(760px 520px at 4% 108%, rgba(59,130,246,.26), transparent 60%),
      #070b14;
    color: #f2f6ff;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 76px;
  }
  .grid { position: absolute; inset: 0; background-image:
      linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size: 60px 60px; mask-image: radial-gradient(75% 75% at 50% 45%, #000 35%, transparent 100%); }
  .row { display: flex; align-items: center; gap: 14px; position: relative; }
  .mark { width: 52px; height: 52px; border-radius: 15px; background: linear-gradient(135deg, #3b82f6, #22d3ee);
          display: grid; place-items: center; font-size: 26px; font-weight: 800; color: #06121f; }
  .brand { font-size: 30px; font-weight: 700; letter-spacing: -.5px; }
  h1 { position: relative; margin-top: 34px; font-size: 62px; line-height: 1.06; font-weight: 800; letter-spacing: -2px; max-width: 940px; }
  h1 .accent { background: linear-gradient(90deg, #60a5fa, #22d3ee); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .lead { position: relative; margin-top: 24px; font-size: 27px; line-height: 1.35; color: #9fb0cc; max-width: 820px; }
  .chips { position: relative; margin-top: 38px; display: flex; gap: 12px; }
  .chip { border: 1px solid #1b2740; background: rgba(13,20,36,.85); border-radius: 999px; padding: 11px 20px;
          font-size: 19px; color: #cfe0f7; }
  .dot { color: #22d3ee; }
  .url { position: absolute; right: 76px; bottom: 54px; font-size: 21px; color: #7d8fae; letter-spacing: .3px; }
</style></head>
<body>
  <div class="grid"></div>
  <div class="row"><div class="mark">З</div><div class="brand">Запишись</div></div>
  <h1>Сайт с онлайн-записью<br><span class="accent">для вашего бизнеса</span></h1>
  <p class="lead">Клиенты выбирают услугу и время сами — с телефона, без звонков и переписки.</p>
  <div class="chips">
    <div class="chip">Запуск за 1 день</div>
    <div class="chip">Работает как приложение</div>
    <div class="chip">Без комиссии с записи</div>
  </div>
  <div class="url">www.zapishisya.ru</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(HTML, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const out = path.resolve('public/og.png');
  await page.screenshot({ path: out, type: 'png' });
  await browser.close();
  console.log(`готово: ${out}`);
})();
