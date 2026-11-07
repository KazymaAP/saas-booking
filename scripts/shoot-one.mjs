// scripts/shoot-one.mjs — один скриншот нужного URL.
import { chromium } from '@playwright/test';
import { setTimeout as wait } from 'node:timers/promises';
const url = process.argv[2] || 'http://localhost:3000/';
const out = process.argv[3] || '/tmp/root2.png';
const EXEC = 'C:/Users/rrrme/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(5000);
await page.screenshot({ path: out, fullPage: true });
console.log('saved', out, await page.title());
await browser.close();
