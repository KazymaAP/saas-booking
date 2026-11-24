// служебное/scripts/runtime-audit.cjs — обход витрин /d/* и статических страниц.
// Что ловит: ошибки гидрации React, битые картинки, <img> без alt, отсутствие h1,
// горизонтальную прокрутку на 390px, ответ не 200.
// Запуск: node служебное/scripts/runtime-audit.cjs [--all]
const { chromium } = require('@playwright/test');
const fs = require('node:fs');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const HYDRATION = /hydrat|did not match|server rendered HTML|Minified React error #(418|423|425)/i;

async function getUrls() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]).filter((u) => !/\.(png|jpg|svg|webp)$/i.test(u));
}

async function checkPage(page, url) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const onConsole = (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  };
  const onPageError = (e) => pageErrors.push(String(e).slice(0, 300));
  const onFailed = (r) => {
    const u = r.url();
    if (r.status() >= 400 && !u.includes('favicon') && !u.includes('vercel')) failedRequests.push(`${r.status()} ${u.slice(0, 160)}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', (r) => failedRequests.push(`net ${r.url().slice(0, 160)}`));
  page.on('response', onFailed);

  let status = 0;
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
    status = resp ? resp.status() : 0;
  } catch (error) {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onFailed);
    return { url, status: 'timeout', error: String(error).slice(0, 200) };
  }
  await page.waitForTimeout(400);

  const dom = await page.evaluate(() => {
    const imgs = [...document.images];
    return {
      h1: document.querySelectorAll('h1').length,
      brokenImgs: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      noAlt: imgs.filter((i) => !i.hasAttribute('alt')).map((i) => (i.currentSrc || i.src).slice(-60)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.title,
      noTitle: document.title.trim().length === 0,
    };
  });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onFailed);

  const problems = [];
  if (status !== 200) problems.push(`status ${status}`);
  if (dom.h1 === 0) problems.push('нет h1');
  if (dom.h1 > 1) problems.push(`${dom.h1} h1`);
  if (dom.brokenImgs.length > 0) problems.push(`битые картинки: ${dom.brokenImgs.length}`);
  if (dom.noAlt.length > 0) problems.push(`img без alt: ${dom.noAlt.length}`);
  if (dom.overflow > 1) problems.push(`прокрутка по X: ${dom.overflow}px`);
  if (dom.noTitle) problems.push('пустой title');
  const hydration = consoleErrors.filter((t) => HYDRATION.test(t));
  if (hydration.length > 0) problems.push(`гидрация: ${hydration.length}`);
  if (pageErrors.length > 0) problems.push(`исключения: ${pageErrors.length}`);
  const realFailed = failedRequests.filter((f) => !/net /.test(f) || !/analytics|gtag|metrika/i.test(f));
  if (realFailed.length > 0) problems.push(`запросы: ${realFailed.length}`);

  return { url, status, ...dom, consoleErrors, pageErrors, failedRequests: realFailed, hydration, problems };
}

(async () => {
  const urls = await getUrls();
  const sample = process.argv.includes('--all') ? urls : urls;
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const results = [];
  let i = 0;
  for (const url of sample) {
    i++;
    const r = await checkPage(page, url);
    results.push(r);
    if (r.problems && r.problems.length > 0) console.log(`[${i}/${sample.length}] ${url.replace(BASE, '')} → ${r.problems.join(', ')}`);
    else if (i % 20 === 0) console.log(`[${i}/${sample.length}] ok`);
  }

  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync('служебное/out/runtime-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, results }, null, 1), 'utf8');

  const bad = results.filter((r) => r.problems && r.problems.length > 0);
  console.log(`\n=== ${results.length} страниц, проблемных ${bad.length} ===`);
  const byKind = {};
  for (const r of bad) for (const p of r.problems) {
    const key = p.replace(/[: ].*$/, '').replace(/\d+/, 'N');
    byKind[key] = (byKind[key] || 0) + 1;
  }
  console.log(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  await browser.close();
})();
