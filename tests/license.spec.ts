// tests/license.spec.ts — e2e лицензии: протокол ping (HMAC запроса и ответа), fail-safe ответы, revoke, /blocked.
// Тест не создаёт данные в БД: проверяет контракт на «неизвестной» лицензии. Сквозной ping по реальной лицензии —
// при заданных E2E_LICENSE_ID и E2E_LICENSE_KEY (производный ключ из transfer-файла).
import { expect, test } from '@playwright/test';
import { SIGNATURE_HEADER, hmacSign, hmacVerify } from '../lib/license-client';

const UNKNOWN_LICENSE = '00000000-0000-4000-8000-000000000000';
const LICENSE_ID = process.env.E2E_LICENSE_ID ?? '';
const LICENSE_KEY = process.env.E2E_LICENSE_KEY ?? '';

function pingBody(license_id: string, domain = 'e2e.example.test') {
  return JSON.stringify({ license_id, domain, version: 'e2e', nonce: crypto.randomUUID(), ts: new Date().toISOString() });
}

test.describe('POST /api/license/ping', () => {
  test('невалидное тело → 400, status unknown, без подписи', async ({ request }) => {
    const res = await request.post('/api/license/ping', { data: '{"license_id":"nope"}', headers: { 'content-type': 'application/json' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).status).toBe('unknown');
    expect(res.headers()[SIGNATURE_HEADER.toLowerCase()]).toBeUndefined();
    expect(res.headers()['cache-control']).toContain('no-store');
  });

  test('слишком большое тело → 413', async ({ request }) => {
    const res = await request.post('/api/license/ping', { data: 'x'.repeat(5_000) });
    expect(res.status()).toBe(413);
  });

  test('подписанный запрос с неверной подписью → 401 unknown (не blocked)', async ({ request }) => {
    const body = pingBody(UNKNOWN_LICENSE);
    const res = await request.post('/api/license/ping', { data: body, headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: await hmacSign('wrong-key', body) } });
    expect([401, 429]).toContain(res.status());
    expect((await res.json()).status).toBe('unknown');
  });

  test('неподписанный legacy-ping неизвестной лицензии → 200 unknown (не blocked)', async ({ request }) => {
    const body = JSON.stringify({ license_id: UNKNOWN_LICENSE, domain: 'e2e.example.test', version: 'e2e-legacy' });
    const res = await request.post('/api/license/ping', { data: body, headers: { 'content-type': 'application/json' } });
    // 503 — стенд без БД: сервер уходит в fail-safe, клиент включит grace. В любом случае не blocked.
    expect([200, 429, 503]).toContain(res.status());
    expect((await res.json()).status).toBe('unknown');
  });

  test('ответ сервера подписан ключом лицензии и содержит наш nonce', async ({ request }) => {
    test.skip(!(LICENSE_ID && LICENSE_KEY), 'нужны E2E_LICENSE_ID + E2E_LICENSE_KEY');
    const body = pingBody(LICENSE_ID);
    const res = await request.post('/api/license/ping', { data: body, headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: await hmacSign(LICENSE_KEY, body) } });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(await hmacVerify(LICENSE_KEY, text, res.headers()[SIGNATURE_HEADER.toLowerCase()] ?? null)).toBe(true);
    const reply = JSON.parse(text);
    expect(reply.nonce).toBe(JSON.parse(body).nonce);
    expect(['active', 'unverified', 'blocked']).toContain(reply.status);
  });
});

test.describe('POST /api/license/revoke', () => {
  test('без сессии супер-админа → 401, блокировки нет', async ({ request }) => {
    const res = await request.post('/api/license/revoke', { data: { license_id: UNKNOWN_LICENSE } });
    expect(res.status()).toBe(401);
  });
});

test.describe('/blocked', () => {
  test('заглушка: заголовок, ссылка на поддержку, noindex', async ({ page }) => {
    await page.goto('/blocked');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link').first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
