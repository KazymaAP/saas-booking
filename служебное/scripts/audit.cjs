// служебное/scripts/audit.cjs — сплошной обход живого сайта: код ответа, ошибки консоли,
// упавшие запросы, горизонтальный скролл. Без снимков, чтобы обход был быстрым.
// Использование: node служебное/scripts/audit.cjs [файл-со-списком]
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.SHOOT_CHROME
  || 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

const DEFAULT_PATHS = [
  '/', '/oferta', '/privacy', '/dogovor-porucheniya', '/data-request',
  '/demo', '/partner', '/partner/demo', '/partner/login', '/auth',
  '/admin/login', '/admin/forgot-password', '/reset-password', '/magic-link', '/blocked',
  '/GERA', '/test/ful/sts',

  '/preview/beauty', '/preview/detailing', '/preview/cleaning', '/preview/dentist',
  '/preview/fitness', '/preview/lawyer', '/preview/photographer', '/preview/repair',
  '/preview/tutor', '/preview/vet',

  '/d/vippro', '/d/2bro', '/d/a500', '/d/race', '/d/pride', '/d/akvamaster',
  '/d/vippro/my', '/d/vippro/my/login', '/d/vippro/booking/my/none', '/d/vippro/booking/last',

  '/test/ful/sts/admin', '/test/ful/sts/admin/businesses', '/test/ful/sts/admin/clients',
  '/test/ful/sts/admin/licenses', '/test/ful/sts/admin/templates', '/test/ful/sts/admin/settings',
  '/test/ful/sts/admin/logs', '/test/ful/sts/admin/funnel', '/test/ful/sts/admin/stats',
  '/test/ful/sts/admin/verticals', '/test/ful/sts/admin/backup', '/test/ful/sts/admin/inbox',
  '/test/ful/sts/admin/email-accounts',

  '/test/ful/sts/d/vippro/admin', '/test/ful/sts/d/vippro/admin/bookings',
  '/test/ful/sts/d/vippro/admin/services', '/test/ful/sts/d/vippro/admin/staff',
  '/test/ful/sts/d/vippro/admin/settings', '/test/ful/sts/d/vippro/admin/texts',
  '/test/ful/sts/d/vippro/admin/photos', '/test/ful/sts/d/vippro/admin/reviews',
  '/test/ful/sts/d/vippro/admin/faq', '/test/ful/sts/d/vippro/admin/appearance',
  '/test/ful/sts/d/vippro/admin/notifications', '/test/ful/sts/d/vippro/admin/team',
  '/test/ful/sts/d/vippro/admin/subscription', '/test/ful/sts/d/vippro/admin/data',
  '/test/ful/sts/d/vippro/receptionist',
];

const listFile = process.argv[2];
const paths = listFile
  ? fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  : DEFAULT_PATHS;

const VIEWPORTS = [
  { name: 'd', width: 1440, height: 1000 },
  { name: 'm', width: 390, height: 844 },
];

const IGNORE_ERR = [
  /Failed to load resource.*favicon/i,
  /net::ERR_ABORTED/i,
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const rows = [];

  for (const target of paths) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'ru-RU',
      });
      const page = await ctx.newPage();
      const errors = [];
      const failed = [];
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (IGNORE_ERR.some((re) => re.test(t))) return;
        errors.push(t.slice(0, 220));
      });
      page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 220)));
      page.on('requestfailed', (r) => {
        const u = r.url();
        if (/favicon|_next\/static/.test(u)) return;
        failed.push(`${r.failure()?.errorText || '?'} ${u.replace(BASE, '').slice(0, 90)}`);
      });

      let status = 0;
      let navErr = null;
      try {
        const resp = await page.goto(BASE + target, { waitUntil: 'networkidle', timeout: 45000 });
        status = resp ? resp.status() : 0;
      } catch (e) {
        navErr = String(e).slice(0, 160);
      }

      try {
        const accept = page.locator('button:has-text("Принять"), button:has-text("Согласен")');
        if (await accept.count()) await accept.first().click({ timeout: 1200 });
      } catch { /* нет баннера */ }
      await page.waitForTimeout(350);

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const vw = doc.clientWidth;
        const offenders = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1) {
            const cls = typeof el.className === 'string' ? el.className.slice(0, 70) : '';
            offenders.push(`${el.tagName.toLowerCase()}.${cls} right=${Math.round(r.right)}`);
            if (offenders.length >= 4) break;
          }
        }
        return {
          overflowX: doc.scrollWidth - doc.clientWidth,
          h1: (document.querySelector('h1') || {}).textContent?.trim().slice(0, 80) || null,
          bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
          offenders,
        };
      }).catch(() => ({ error: 'eval failed' }));

      rows.push({
        target, vp: vp.name, status, navErr,
        errors: [...new Set(errors)].slice(0, 5),
        failed: [...new Set(failed)].slice(0, 5),
        ...metrics,
      });
      await ctx.close();
    }
  }

  await browser.close();
  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync('служебное/out/audit.json', JSON.stringify(rows, null, 2));

  let problems = 0;
  for (const r of rows) {
    const bad = r.status !== 200 || r.navErr || r.errors.length || r.failed.length
      || (r.overflowX ?? 0) > 0;
    if (!bad) continue;
    problems++;
    console.log(`${r.status} ${r.vp} ${r.target}` + (r.navErr ? ` NAV=${r.navErr}` : ''));
    if ((r.overflowX ?? 0) > 0) console.log('   overflowX=', r.overflowX, JSON.stringify(r.offenders));
    if (r.errors.length) console.log('   console:', JSON.stringify(r.errors));
    if (r.failed.length) console.log('   failed:', JSON.stringify(r.failed));
  }
  console.log(`\nвсего проверок: ${rows.length}, проблемных: ${problems}`);
})();
