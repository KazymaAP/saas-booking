const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const CHROME = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const api = [];
  p.on('response', r => { const u = r.url(); if (u.includes('/api/bookings/slots')) api.push(u.split('date=')[1]); });
  await p.goto('https://www.zapishisya.ru/d/vippro', { waitUntil: 'networkidle', timeout: 45000 });
  await p.locator('button').filter({ hasText: /Записаться/ }).first().click();
  await p.waitForTimeout(700);
  await p.locator('.service-row').first().click();
  await p.waitForTimeout(1800);
  const out = [];
  const days = await p.locator('.day-chip').count();
  for (let i = 0; i < days; i++) {
    await p.locator('.day-chip').nth(i).click();
    await p.waitForTimeout(1200);
    const info = await p.evaluate(() => {
      const chips = [...document.querySelectorAll('.time-chip')];
      return {
        total: chips.length,
        free: chips.filter(c => !c.disabled).length,
        active: document.querySelector('.day-chip.is-active')?.textContent?.replace(/\s+/g, '') ?? null,
      };
    });
    out.push(info);
  }
  fs.writeFileSync('служебное/out/days.json', JSON.stringify({ days: out, api }, null, 1), 'utf8');
  console.log('written', days);
  await b.close();
})();
