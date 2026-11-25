// служебное/scripts/page-audit.cjs — обход ВСЕХ маршрутов сайта, а не только карты сайта.
// Что проверяет: код ответа против ожидаемого, title, description, canonical, og:image,
// lang, ровно один h1, alt у картинок, битые картинки, горизонтальную прокрутку,
// пустую страницу, ошибки гидрации и исключения JS.
//
// Запуск:
//   node служебное/scripts/page-audit.cjs                — оба вьюпорта (390 и 1280)
//   node служебное/scripts/page-audit.cjs --vp=390       — только мобильный
//   node служебное/scripts/page-audit.cjs --only=admin   — только URL, содержащие подстроку
const { chromium } = require('@playwright/test');
const fs = require('node:fs');

const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = 'https://www.zapishisya.ru';
const HYDRATION = /hydrat|did not match|server rendered HTML|Minified React error #(418|423|425)/i;
const ERROR_MARKERS = [
  'Application error',
  'Unhandled Runtime Error',
  'Internal Server Error',
  'Ошибка сервера',
  'Что-то пошло не так',
];

// expect: точный код; 'guard' — любой из 3xx/401/403/404 (страница закрыта, но не 500);
// 'any' — код не важен, важно что не 5xx.
const TARGETS = [
  // --- публичные страницы ---
  { path: '/', expect: 200, index: true },
  { path: '/oferta', expect: 200, index: true },
  { path: '/privacy', expect: 200, index: true },
  { path: '/dogovor-porucheniya', expect: 200, index: true },
  { path: '/GERA', expect: 200, index: false },
  { path: '/data-request', expect: 200, index: false },
  { path: '/partner', expect: 200, index: false },
  { path: '/partner/demo', expect: 200, index: false },
  { path: '/partner/login', expect: 200, index: false },
  { path: '/demo', expect: 'any', index: false },
  { path: '/demo/business', expect: 'any', index: false },
  { path: '/auth', expect: 200, index: false },
  { path: '/blocked', expect: 200, index: false },
  { path: '/magic-link', expect: 200, index: false },
  { path: '/reset-password', expect: 200, index: false },
  { path: '/admin/login', expect: 200, index: false },
  { path: '/admin/forgot-password', expect: 200, index: false },
  { path: '/dev/super-admin', expect: 'any', index: false },
  { path: '/preview/vippro', expect: 'any', index: false },

  // --- витрина и клиентские страницы бизнеса ---
  { path: '/d/vippro', expect: 200, index: true },
  { path: '/d/vippro/my', expect: 'any', index: false },
  { path: '/d/vippro/my/login', expect: 200, index: false },
  { path: '/d/vippro/booking/last', expect: 'any', index: false },

  // --- кабинет владельца ---
  { path: '/d/vippro/admin/login', expect: 200, index: false },
  { path: '/d/vippro/admin/password', expect: 200, index: false },
  { path: '/d/vippro/admin', expect: 'guard', index: false },
  { path: '/d/vippro/admin/bookings', expect: 'guard', index: false },
  { path: '/d/vippro/admin/services', expect: 'guard', index: false },
  { path: '/d/vippro/admin/staff', expect: 'guard', index: false },
  { path: '/d/vippro/admin/photos', expect: 'guard', index: false },
  { path: '/d/vippro/admin/reviews', expect: 'guard', index: false },
  { path: '/d/vippro/admin/faq', expect: 'guard', index: false },
  { path: '/d/vippro/admin/texts', expect: 'guard', index: false },
  { path: '/d/vippro/admin/settings', expect: 'guard', index: false },
  { path: '/d/vippro/admin/appearance', expect: 'guard', index: false },
  { path: '/d/vippro/admin/subscription', expect: 'guard', index: false },
  { path: '/d/vippro/admin/team', expect: 'guard', index: false },
  { path: '/d/vippro/admin/data', expect: 'guard', index: false },
  { path: '/d/vippro/admin/notifications', expect: 'guard', index: false },
  { path: '/d/vippro/admin/export', expect: 'guard', index: false },

  // --- роли сотрудников (все 14) ---
  ...['owner', 'manager', 'receptionist', 'content', 'viewer', 'finance', 'marketing',
    'callcenter', 'analyst', 'photographer', 'copywriter', 'support', 'auditor', 'intern']
    .map((role) => ({ path: `/d/vippro/${role}`, expect: 'any', index: false })),

  // --- раздел копий ---
  { path: '/test/ful/sts', expect: 200, index: false },
  { path: '/test/ful/sts/d/vippro', expect: 200, index: false },
  { path: '/test/ful/sts/d/vippro/admin', expect: 200, index: false },
  { path: '/test/ful/sts/d/vippro/admin/services', expect: 200, index: false },
  { path: '/test/ful/sts/d/vippro/admin/bookings', expect: 200, index: false },

  // --- недействительные ссылки: должны давать понятный экран, а не 500 ---
  { path: '/unsubscribe/nesushchestvuyushchiy-token', expect: 'any', index: false },
  { path: '/invite/nesushchestvuyushchiy-token', expect: 'any', index: false },
  { path: '/pay/nesushchestvuyushchiy-id', expect: 'any', index: false },
  { path: '/booking/cancel/nesushchestvuyushchiy-token', expect: 'any', index: false },
  { path: '/booking/reschedule/nesushchestvuyushchiy-token', expect: 'any', index: false },
  { path: '/d/vippro/booking/cancel/nesushchestvuyushchiy-token', expect: 'any', index: false },
  { path: '/d/vippro/booking/reschedule/nesushchestvuyushchiy-token', expect: 'any', index: false },
  { path: '/d/vippro/booking/my/nesushchestvuyushchiy-token', expect: 'any', index: false },
  { path: '/domain-site/by-domain/example.com', expect: 'any', index: false },
  { path: '/preview/nesushchestvuyushchiy-slug', expect: 'any', index: false },
  { path: '/d/nesushchestvuyushchiy-biznes', expect: 404, index: false },
  { path: '/nesushchestvuyushchaya-stranica', expect: 404, index: false },
  { path: '/dev/templates/nesushchestvuyushchiy-klyuch', expect: 'any', index: false },
];

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const vpArg = (args.find((a) => a.startsWith('--vp=')) || '').slice(5);
const VIEWPORTS = vpArg
  ? [{ name: vpArg, width: Number(vpArg), height: vpArg === '390' ? 844 : 900 }]
  : [
      { name: '390', width: 390, height: 844 },
      { name: '1280', width: 1280, height: 900 },
    ];

function expectOk(expect, status) {
  if (expect === 'any') return status > 0 && status < 500;
  if (expect === 'guard') return status === 401 || status === 403 || status === 404 || (status >= 300 && status < 400);
  return status === expect;
}

async function check(browser, target, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const badRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 240)));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !/favicon|_vercel|\.map(\?|$)/.test(u)) badRequests.push(`${r.status()} ${u.replace(BASE, '').slice(0, 120)}`);
  });

  const url = BASE + target.path;
  let status = 0;
  let finalUrl = url;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    status = resp ? resp.status() : 0;
    finalUrl = page.url();
  } catch (e) {
    await context.close();
    return { path: target.path, vp: vp.name, status: 'timeout', problems: ['таймаут загрузки'], error: String(e).slice(0, 160) };
  }
  await page.waitForTimeout(600);

  const dom = await page.evaluate(() => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
    const imgs = [...document.images];
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      title: document.title.trim(),
      description: meta('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      ogTitle: meta('meta[property="og:title"]'),
      ogImage: meta('meta[property="og:image"]'),
      robots: meta('meta[name="robots"]'),
      lang: document.documentElement.lang || '',
      h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()).filter(Boolean),
      imgCount: imgs.length,
      noAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
      brokenImgs: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => (i.currentSrc || i.src).slice(-70)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      textLen: text.length,
      textHead: text.slice(0, 220),
    };
  });

  await context.close();

  const problems = [];
  if (!expectOk(target.expect, status)) problems.push(`код ${status}, ждали ${target.expect}`);
  if (status >= 500) problems.push('серверная ошибка 5xx');
  const bodyError = ERROR_MARKERS.find((m) => dom.textHead.includes(m));
  if (bodyError && status !== 404) problems.push(`текст ошибки: «${bodyError}»`);
  if (status === 200 && dom.textLen < 120) problems.push(`почти пустая страница (${dom.textLen} символов)`);
  if (status === 200 && dom.title.length === 0) problems.push('пустой title');
  if (status === 200 && dom.h1.length === 0) problems.push('нет h1');
  if (dom.h1.length > 1) problems.push(`${dom.h1.length} h1`);
  if (dom.noAlt > 0) problems.push(`img без alt: ${dom.noAlt}`);
  if (dom.brokenImgs.length > 0) problems.push(`битые картинки: ${dom.brokenImgs.length}`);
  if (dom.overflow > 1) problems.push(`прокрутка по X: ${dom.overflow}px`);
  if (target.index && status === 200) {
    if (!dom.description) problems.push('нет description');
    if (!dom.canonical) problems.push('нет canonical');
    if (!dom.ogImage) problems.push('нет og:image');
    if (dom.robots && /noindex/i.test(dom.robots)) problems.push('noindex на индексируемой странице');
  }
  if (target.index && dom.canonical && !dom.canonical.startsWith('https://www.zapishisya.ru')) {
    problems.push(`canonical не на канонический хост: ${dom.canonical}`);
  }
  if (!dom.lang) problems.push('нет lang у <html>');
  const hydration = consoleErrors.filter((t) => HYDRATION.test(t));
  if (hydration.length > 0) problems.push(`гидрация: ${hydration.length}`);
  if (pageErrors.length > 0) problems.push(`исключения JS: ${pageErrors.length}`);
  if (badRequests.length > 0) problems.push(`запросы 4xx/5xx: ${badRequests.length}`);

  return { path: target.path, vp: vp.name, status, finalUrl: finalUrl.replace(BASE, ''), ...dom, hydration, consoleErrors, pageErrors, badRequests, problems };
}

(async () => {
  const targets = only ? TARGETS.filter((t) => t.path.includes(only)) : TARGETS;
  const browser = await chromium.launch({ executablePath: CHROME });
  const all = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n########## вьюпорт ${vp.width}px ##########`);
    let i = 0;
    for (const t of targets) {
      i++;
      const r = await check(browser, t, vp);
      all.push(r);
      const label = `${String(i).padStart(2)}/${targets.length} ${t.path}`;
      if (r.problems.length > 0) console.log(`${label} → ${r.problems.join(' | ')}`);
      else console.log(`${label} → ${r.status} ok`);
    }
  }

  await browser.close();

  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync('служебное/out/page-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), results: all }, null, 1), 'utf8');

  const bad = all.filter((r) => r.problems.length > 0);
  console.log(`\n=== ${all.length} проверок, проблемных ${bad.length} ===`);

  // Дубли title на индексируемых страницах — отдельная беда SEO.
  const seen = new Map();
  for (const r of all.filter((x) => x.vp === VIEWPORTS[0].name && x.status === 200)) {
    const key = r.title.toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r.path);
  }
  const dups = [...seen.entries()].filter(([, paths]) => paths.length > 1);
  if (dups.length > 0) {
    console.log('\n--- одинаковый title у разных страниц ---');
    for (const [title, paths] of dups) console.log(`  «${title}» ← ${paths.join(', ')}`);
  }
  const kinds = {};
  for (const r of bad) for (const p of r.problems) {
    const k = p.replace(/[: ].*$/, '').replace(/\d+/, 'N');
    kinds[k] = (kinds[k] || 0) + 1;
  }
  console.log(Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
})();
