// tests/owner-admin-route.spec.ts — кабинет предпринимателя живёт на /admin, старый /panel → 404.
import { expect, test } from '@playwright/test';
import { OWNER, login, panelUrl, requireOwner } from './owner-helpers';

test.describe('маршрут кабинета предпринимателя', () => {
  test.beforeEach(requireOwner);

  test('/{prefix}/{slug}/admin открывается владельцем', async ({ page }) => {
    await login(page, OWNER);
    await expect(page.getByRole('navigation', { name: 'Разделы кабинета' })).toBeVisible();
  });

  test('старый /{prefix}/{slug}/panel → 404', async ({ page }) => {
    const res = await page.goto(panelUrl().replace(/\/admin$/, '/panel'));
    expect(res?.status()).toBe(404);
  });
});
