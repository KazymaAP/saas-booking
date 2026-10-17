// tests/cookie.spec.ts — баннер cookie: показ, 3 кнопки, хранение выбора, запись согласия, настройки, a11y.
import { expect, test, type Page } from '@playwright/test';
import { COOKIE_CONSENT_API, COOKIE_CONSENT_STORAGE_KEY, COOKIE_POLICY_VERSION } from '../lib/legal-versions';

const banner = (page: Page) => page.getByTestId('cookie-banner');
const settings = (page: Page) => page.getByTestId('cookie-settings');

async function stored(page: Page): Promise<{ version: string; analytics: boolean } | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

test('первый визит: немодальный диалог с тремя кнопками ≥ 44px', async ({ page }) => {
  await page.goto('/privacy');
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toHaveAttribute('role', 'dialog');
  await expect(banner(page)).toHaveAttribute('aria-modal', 'false');
  for (const name of ['Принять', 'Отклонить', 'Настройки']) {
    const button = banner(page).getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // Контент не заблокирован: ссылка в документе кликабельна при открытом баннере.
  await page.locator('nav[aria-label="Содержание документа"] a').first().click();
  await expect(banner(page)).toBeVisible();
});

test('баннер не попадает в SSR-HTML (не влияет на LCP)', async ({ request }) => {
  const html = await (await request.get('/privacy')).text();
  expect(html).not.toContain('data-testid="cookie-banner"');
});

test('«Принять» → localStorage + POST в журнал согласий, при повторном визите баннера нет', async ({ page }) => {
  await page.goto('/privacy');
  const posted = page.waitForRequest((r) => r.url().endsWith(COOKIE_CONSENT_API) && r.method() === 'POST');
  await banner(page).getByRole('button', { name: 'Принять', exact: true }).click();
  const req = await posted;
  expect(req.postDataJSON()).toEqual({ accepted: true, policy_version: COOKIE_POLICY_VERSION });
  await expect(banner(page)).toBeHidden();
  expect(await stored(page)).toMatchObject({ version: COOKIE_POLICY_VERSION, analytics: true });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(banner(page)).toBeHidden();
});

test('«Отклонить» → только localStorage, в журнал не пишется', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith(COOKIE_CONSENT_API)) calls.push(r.method()); });
  await page.goto('/privacy');
  await banner(page).getByRole('button', { name: 'Отклонить', exact: true }).click();
  await expect(banner(page)).toBeHidden();
  expect(await stored(page)).toMatchObject({ version: COOKIE_POLICY_VERSION, analytics: false });
  await page.waitForTimeout(300);
  expect(calls).toEqual([]);
});

test('новая редакция политики → баннер показывается снова', async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, JSON.stringify({ version: '2000-01-01', analytics: true, decided_at: '2000-01-01T00:00:00Z' }));
  }, COOKIE_CONSENT_STORAGE_KEY);
  await page.goto('/privacy');
  await expect(banner(page)).toBeVisible();
});

test('повреждённое значение в localStorage → баннер, без ошибок на странице', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((key) => window.localStorage.setItem(key, '{oops'), COOKIE_CONSENT_STORAGE_KEY);
  await page.goto('/privacy');
  await expect(banner(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('«Настройки»: модальный диалог, ловушка фокуса, Escape возвращает к баннеру', async ({ page }) => {
  await page.goto('/privacy');
  const trigger = banner(page).getByRole('button', { name: 'Настройки', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(settings(page)).toBeVisible();
  await expect(settings(page)).toHaveAttribute('aria-modal', 'true');
  // Технические cookie нельзя выключить, аналитика по умолчанию выключена (согласие не предзаполнено).
  await expect(settings(page).getByLabel(/Технические/)).toBeDisabled();
  await expect(settings(page).getByLabel('Статистика посещений')).not.toBeChecked();
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="cookie-settings"]')));
    expect(inside, `фокус внутри диалога после Tab #${i + 1}`).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="cookie-settings"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(settings(page)).toBeHidden();
  await expect(banner(page)).toBeVisible();
  await expect(trigger).toBeFocused();
});

test('«Сохранить выбор» без галочки = отказ от статистики', async ({ page }) => {
  await page.goto('/privacy');
  await banner(page).getByRole('button', { name: 'Настройки', exact: true }).click();
  await settings(page).getByRole('button', { name: 'Сохранить выбор' }).click();
  await expect(settings(page)).toBeHidden();
  expect(await stored(page)).toMatchObject({ analytics: false });
});

test('кнопка «Настройки cookie» в футере документа позволяет изменить выбор', async ({ page }) => {
  await page.goto('/privacy');
  await banner(page).getByRole('button', { name: 'Принять', exact: true }).click();
  await page.getByTestId('cookie-settings-open').first().click();
  await expect(settings(page)).toBeVisible();
  const toggle = settings(page).getByLabel('Статистика посещений');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await settings(page).getByRole('button', { name: 'Сохранить выбор' }).click();
  expect(await stored(page)).toMatchObject({ analytics: false });
});

test('API согласий: чужой Origin → 403, мусор → 400', async ({ request, baseURL }) => {
  const foreign = await request.post(COOKIE_CONSENT_API, {
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    data: { accepted: true, policy_version: COOKIE_POLICY_VERSION },
  });
  expect(foreign.status()).toBe(403);
  const garbage = await request.post(COOKIE_CONSENT_API, {
    headers: { Origin: baseURL ?? '', 'Content-Type': 'application/json' },
    data: { accepted: false, policy_version: 'x' },
  });
  expect(garbage.status()).toBe(400);
});
