// служебное/scripts/copy-audit.cjs — обход кабинетов через раздел копий.
//
// Раздел /test/ful/sts открывает те же компоненты без входа (middleware срезает префикс
// и ставит x-copy-mode), поэтому это единственный способ проверить панели снаружи.
// Смотрим код ответа, ошибки консоли, упавшие запросы и горизонтальный скролл.
// Запуск: MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" node служебное/scripts/copy-audit.cjs [vp]
const { chromium } = require('@playwright/test');
const fs = require('node:fs');

const CHROME = process.env.SHOOT_CHROME
  || 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';
const P = '/test/ful/sts';

const ADMIN = [
  '', '/businesses', '/clients', '/licenses', '/templates', '/settings', '/logs', '/funnel',
  '/stats', '/verticals', '/backup', '/inbox', '/email-accounts', '/preview/tenant',
];

const CABINET = [
  '', '/bookings', '/services', '/photos', '/texts', '/reviews', '/staff', '/faq',
  '/notifications', '/settings', '/appearance', '/subscription', '/team', '/data',
];

const BIZ = [
  ['d', 'vippro'],
  ['b', '2bro'],
];

const ROLES = ['/receptionist', '/manager', '/master', '/owner'];

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 640 },
};

function targets() {
  const out = [];
  for (const p of ADMIN) out.push(`${P}/admin${p}`);
  for (const [prefix, slug] of BIZ) {
    const base = `${P}/${prefix}/${slug}`;
    out.push(base);
    out.push(`${base}/admin`);
    for (const s of CABINET) if (s) out.push(`${base}/admin${s}`);
    out.push(`${base}/my`);
    out.push(`${base}/my/login`);
    for (const r of ROLES) out.push(`${base}${r}`);
  }
  return out;
}

(async () => {
  const vpName = process.argv[2] || 'desktop';
  const vp = VIEWPORTS[vpName];
  if (!vp) { console.error('vp: desktop | mobile | narrow'); process.exit(1); }

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: vp });
  const rows = [];

  for (const target of targets()) {
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
    page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 110)} ${r.failure()?.errorText ?? ''}`));
    let status = 0;
    let navErr = '';
    try {
      const resp = await page.goto(BASE + target, { waitUntil: 'networkidle', timeout: 45000 });
      status = resp ? resp.status() : 0;
      await page.waitForTimeout(250);
    } catch (e) {
      navErr = String(e.message).slice(0, 90);
    }
    const metrics = await page.evaluate(() => {
      const de = document.documentElement;
      const overflowX = de.scrollWidth - de.clientWidth;
      const offenders = [];
      if (overflowX > 0) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.right > de.clientWidth + 1 && r.width > 0) {
            offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
            if (offenders.length >= 4) break;
          }
        }
      }
      const h1 = document.querySelector('h1');
      return {
        overflowX, offenders,
        h1: h1 ? (h1.textContent || '').trim().slice(0, 60) : null,
        title: document.title.slice(0, 70),
      };
    }).catch(() => ({ error: 'eval failed' }));

    rows.push({ target, status, navErr, errors: [...new Set(errors)].slice(0, 4), failed: [...new Set(failed)].slice(0, 4), ...metrics });
    await page.close();
  }

  await browser.close();
  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync(`служебное/out/copy-audit-${vpName}.json`, JSON.stringify(rows, null, 2));

  let problems = 0;
  for (const r of rows) {
    const bad = r.status !== 200 || r.navErr || r.errors?.length || r.failed?.length || (r.overflowX ?? 0) > 0 || !r.h1;
    if (!bad) continue;
    problems++;
    console.log(`${r.status} ${r.target}` + (r.navErr ? ` NAV=${r.navErr}` : '') + (r.h1 ? '' : ' [нет h1]'));
    if ((r.overflowX ?? 0) > 0) console.log('   overflowX=', r.overflowX, JSON.stringify(r.offenders));
    if (r.errors?.length) console.log('   console:', JSON.stringify(r.errors));
    if (r.failed?.length) console.log('   failed:', JSON.stringify(r.failed));
  }
  console.log(`\n[${vpName}] проверок: ${rows.length}, проблемных: ${problems}`);
})();
