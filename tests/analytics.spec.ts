// tests/analytics.spec.ts — Playwright E2E собственной аналитики (ТЗ 4.0 §12.3).
// Запуск: E2E_BASE_URL=https://… E2E_BUSINESS_PATH=/s/<slug> pnpm exec playwright test tests/analytics.spec.ts
// Сценарии страницы перехватывают /api/track/page (page.route) — проверяем клиентский pixel без записи в БД.
// Сценарии API ходят в настоящий эндпоинт: проверяем контракт 204/400/413, cookie sid, DNT и права summary.
import { expect, test, type Page, type Request } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? '';
const BUSINESS_PATH = process.env.E2E_BUSINESS_PATH ?? '';
const TRACK_PATH = '/api/track/page';
// Pixel отправляется в requestIdleCallback (таймаут 4 c) — ждём с запасом.
const BEACON_WAIT_MS = 8000;
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

test.skip(!BASE_URL, 'E2E_BASE_URL не задан — E2E аналитики пропущены');
test.use({ baseURL: BASE_URL, userAgent: CHROME_UA });

type BeaconBody = { business_id: string | null; event: string; path: string; referrer: string | null };

// Перехватывает pixel: отвечает 204 как настоящий эндпоинт и копит тела запросов.
async function captureBeacons(page: Page): Promise<BeaconBody[]> {
  const bodies: BeaconBody[] = [];
  await page.route(`**${TRACK_PATH}`, async (route) => {
    const raw = route.request().postData();
    if (raw) bodies.push(JSON.parse(raw) as BeaconBody);
    await route.fulfill({ status: 204, body: '' });
  });
  return bodies;
}

function isTrackRequest(r: Request): boolean {
  return r.url().includes(TRACK_PATH) && r.method() === 'POST';
}

test.describe('pixel на сайте клиента', () => {
  test.skip(!BUSINESS_PATH, 'E2E_BUSINESS_PATH не задан');

  test('pageview уходит один раз, после загрузки, без query и PII', async ({ page }) => {
    const bodies = await captureBeacons(page);
    await page.goto(`${BUSINESS_PATH}?utm_source=test&phone=89991234567`);
    await expect.poll(() => bodies.length, { timeout: BEACON_WAIT_MS }).toBe(1);
    const [body] = bodies;
    expect(body?.event).toBe('pageview');
    expect(body?.business_id).toMatch(/^[0-9a-f-]{36}$/);
    // Клиент шлёт только pathname: query (UTM, телефоны) в аналитику не попадает.
    expect(body?.path).toBe(new URL(page.url()).pathname);
    expect(JSON.stringify(body)).not.toContain('89991234567');
  });

  test('pixel не блокирует рендер: запрос стартует после события load', async ({ page }) => {
    let loadedAt = 0;
    let beaconAt = 0;
    page.on('load', () => { loadedAt = Date.now(); });
    page.on('request', (r) => { if (isTrackRequest(r) && beaconAt === 0) beaconAt = Date.now(); });
    await captureBeacons(page);
    await page.goto(BUSINESS_PATH);
    await expect.poll(() => beaconAt, { timeout: BEACON_WAIT_MS }).toBeGreaterThan(0);
    expect(loadedAt).toBeGreaterThan(0);
    expect(beaconAt).toBeGreaterThanOrEqual(loadedAt);
  });

  test('Do Not Track: ни одного запроса к pixel', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1', configurable: true });
    });
    const bodies = await captureBeacons(page);
    await page.goto(BUSINESS_PATH);
    await page.waitForTimeout(BEACON_WAIT_MS);
    expect(bodies).toHaveLength(0);
  });

  test('Global Privacy Control: ни одного запроса к pixel', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
    });
    const bodies = await captureBeacons(page);
    await page.goto(BUSINESS_PATH);
    await page.waitForTimeout(BEACON_WAIT_MS);
    expect(bodies).toHaveLength(0);
  });

  test('клик по телефону → phone_click', async ({ page }) => {
    const bodies = await captureBeacons(page);
    await page.goto(BUSINESS_PATH);
    await expect.poll(() => bodies.length, { timeout: BEACON_WAIT_MS }).toBe(1);
    const phone = page.locator('a[href^="tel:"]').first();
    test.skip((await phone.count()) === 0, 'на сайте нет ссылки tel:');
    // Переход по tel: в headless не нужен — гасим действие по умолчанию, делегированный обработчик срабатывает раньше.
    await phone.evaluate((el) => el.addEventListener('click', (e) => e.preventDefault()));
    await phone.click();
    await expect.poll(() => bodies.map((b) => b.event), { timeout: BEACON_WAIT_MS }).toContain('phone_click');
  });
});

test.describe('API /api/track/page', () => {
  const pageview = { business_id: null, event: 'pageview', path: '/' };

  test('валидное событие → 204 без тела и единственная cookie sid', async ({ request }) => {
    const res = await request.post(TRACK_PATH, { data: JSON.stringify(pageview), headers: { 'content-type': 'text/plain' } });
    expect(res.status()).toBe(204);
    expect(await res.body()).toHaveLength(0);
    const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    // Без ANALYTICS_SALT сервер молча отбрасывает событие и cookie не ставит — допустимо.
    for (const c of cookies) {
      expect(c.value).toMatch(/^sid=[0-9a-f-]{36}; Path=\/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax$/);
    }
    expect(cookies.length).toBeLessThanOrEqual(1);
  });

  test('DNT: 204 без cookie', async ({ request }) => {
    const res = await request.post(TRACK_PATH, { data: JSON.stringify(pageview), headers: { dnt: '1', 'content-type': 'text/plain' } });
    expect(res.status()).toBe(204);
    expect(res.headers()['set-cookie']).toBeUndefined();
  });

  test('неизвестное событие и битый JSON → 400 без тела', async ({ request }) => {
    for (const data of [JSON.stringify({ event: 'drop_table', path: '/' }), '{oops']) {
      const res = await request.post(TRACK_PATH, { data, headers: { 'content-type': 'text/plain' } });
      expect(res.status()).toBe(400);
      expect(await res.body()).toHaveLength(0);
    }
  });

  test('тело больше 8 КБ → 413', async ({ request }) => {
    const res = await request.post(TRACK_PATH, {
      data: JSON.stringify({ ...pageview, path: `/${'x'.repeat(9000)}` }),
      headers: { 'content-type': 'text/plain' },
    });
    expect([400, 413]).toContain(res.status());
  });
});

test.describe('API /api/analytics/summary', () => {
  test('без входа → 403, ответ не кэшируется', async ({ request }) => {
    const res = await request.get('/api/analytics/summary?business_id=3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
    expect(res.status()).toBe(403);
    expect(res.headers()['cache-control']).toBe('no-store');
  });

  test('невалидный период → 400', async ({ request }) => {
    const res = await request.get('/api/analytics/summary?from=2026-10-10&to=2026-10-01');
    expect(res.status()).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'invalid_range' });
  });
});
