// tests/unsubscribe.spec.ts — отписка: страница, One-Click API (RFC 8058), идемпотентность, noindex.
// Сценарии с записью в БД требуют Supabase с миграцией unsubscribes (E2E_DB=1). Без БД проверяется,
// что сбой честно показывается как ошибка с кнопкой «Повторить», а не как успешная отписка.
import { expect, test } from '@playwright/test';
import { makeUnsubscribeToken, uniqueEmail } from './helpers';

const HAS_DB = process.env.E2E_DB === '1';

test('страница: noindex, no-referrer', async ({ page }) => {
  await page.goto(`/unsubscribe/${makeUnsubscribeToken(uniqueEmail('meta'))}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
});

test('поддельный токен → «Ссылка недействительна» и путь через /data-request', async ({ page }) => {
  await page.goto('/unsubscribe/u1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  const status = page.getByTestId('unsubscribe-status');
  await expect(status).toHaveAttribute('data-status', 'invalid');
  await expect(status).toHaveAttribute('role', 'alert');
  await expect(page.locator('a[href="/data-request"]')).toBeVisible();
});

test('email на странице показан маской', async ({ page }) => {
  const email = uniqueEmail('mask');
  await page.goto(`/unsubscribe/${makeUnsubscribeToken(email)}`);
  await expect(page.locator('main')).not.toContainText(email);
});

test('первый визит отписывает, повторный — «уже отписаны»', async ({ page }) => {
  const token = makeUnsubscribeToken(uniqueEmail('visit'));
  await page.goto(`/unsubscribe/${token}`);
  const status = page.getByTestId('unsubscribe-status');
  if (!HAS_DB) {
    await expect(status).toHaveAttribute('data-status', 'error');
    await expect(page.getByRole('button', { name: 'Повторить отписку' })).toBeVisible();
    return;
  }
  await expect(status).toHaveAttribute('data-status', 'done');
  await page.goto(`/unsubscribe/${token}`);
  await expect(status).toHaveAttribute('data-status', 'already');
});

test('причина отписки сохраняется (PRG)', async ({ page }) => {
  test.skip(!HAS_DB, 'нужна БД с таблицей unsubscribes');
  await page.goto(`/unsubscribe/${makeUnsubscribeToken(uniqueEmail('reason'))}`);
  await page.getByLabel('Слишком много писем').check();
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page).toHaveURL(/status=reason_saved/);
  await expect(page.getByTestId('unsubscribe-status')).toHaveAttribute('data-status', 'reason_saved');
});

test.describe('API One-Click', () => {
  test('POST «List-Unsubscribe=One-Click» без Origin: 200 и идемпотентность', async ({ request }) => {
    const url = `/api/unsubscribe/${makeUnsubscribeToken(uniqueEmail('oneclick'))}`;
    const form = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: 'List-Unsubscribe=One-Click' };
    const first = await request.post(url, form);
    expect(first.headers()['cache-control']).toContain('no-store');
    expect(first.headers()['x-robots-tag']).toContain('noindex');
    if (!HAS_DB) {
      expect(first.status()).toBe(500);
      return;
    }
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ ok: true, already: false });
    const second = await request.post(url, form);
    expect(await second.json()).toEqual({ ok: true, already: true });
  });

  test('поддельный токен → 404', async ({ request }) => {
    const res = await request.post('/api/unsubscribe/u1.forged', { data: '' });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'invalid_token' });
  });

  test('чужое тело → 400', async ({ request }) => {
    const res = await request.post(`/api/unsubscribe/${makeUnsubscribeToken(uniqueEmail('body'))}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: 'foo=bar',
    });
    expect(res.status()).toBe(400);
  });

  test('GET → 303 на страницу отписки', async ({ request }) => {
    const token = makeUnsubscribeToken(uniqueEmail('get'));
    const res = await request.get(`/api/unsubscribe/${token}`, { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()['location']).toContain(`/unsubscribe/${token}`);
  });
});
