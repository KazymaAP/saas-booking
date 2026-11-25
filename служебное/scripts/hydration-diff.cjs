// служебное/scripts/hydration-diff.cjs — что именно расходится при гидрации.
// Сравниваем разметку без JS (ровно серверный HTML) и после гидрации:
// сначала текстовые узлы, затем HTML — первый разошедшийся участок показывает место.
// Запуск: node служебное/scripts/hydration-diff.cjs /d/vippro
const { chromium } = require('@playwright/test');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const path = process.argv[2] || '/d/vippro';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const url = BASE + path;

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const p1 = await noJs.newPage();
  await p1.goto(url, { waitUntil: 'load', timeout: 45000 });
  const server = await p1.evaluate(() => ({ html: document.body.innerHTML, text: document.body.innerText }));
  await noJs.close();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx.newPage();
  const errors = [];
  const consoleErrors = [];
  p2.on('pageerror', (e) => errors.push(String(e).split('\n')[0].slice(0, 300)));
  p2.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  await p2.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await p2.waitForTimeout(2000);
  const client = await p2.evaluate(() => ({ html: document.body.innerHTML, text: document.body.innerText }));
  await ctx.close();
  await browser.close();

  console.log(`необработанных исключений: ${errors.length}`);
  for (const e of [...new Set(errors)]) console.log(`  ! ${e}`);
  console.log(`console.error: ${consoleErrors.length}`);
  for (const e of [...new Set(consoleErrors)].slice(0, 6)) console.log(`  ! ${e}`);

  console.log(`\nсервер: ${server.html.length} байт разметки, ${server.text.length} символов текста`);
  console.log(`клиент: ${client.html.length} байт разметки, ${client.text.length} символов текста`);
  console.log(`текст совпадает: ${server.text === client.text}`);

  // Первое расхождение в разметке — с контекстом.
  const a = server.html;
  const b = client.html;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) {
    console.log('\nразметка идентична');
  } else {
    const from = Math.max(0, i - 260);
    console.log(`\nпервое расхождение на смещении ${i}`);
    console.log(`  сервер: …${a.slice(from, i)}⟦${a.slice(i, i + 220)}⟧`);
    console.log(`  клиент: …${b.slice(from, i)}⟦${b.slice(i, i + 220)}⟧`);
  }
})();
