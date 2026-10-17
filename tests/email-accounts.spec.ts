// tests/email-accounts.spec.ts — ящики рассылки: доступ, создание, валидация, optimistic вкл/выкл, удаление, a11y.
import { expect, test } from '@playwright/test';
import { E2E, E2E_READY, SKIP_REASON, loginAsAdmin, uniq } from './email-helpers';

test.describe('/panel/email-accounts', () => {
  test.skip(!E2E_READY, SKIP_REASON);

  test('без входа — редирект на логин', async ({ page }) => {
    await page.goto(`${E2E.baseUrl}/panel/email-accounts`);
    await expect(page).toHaveURL(/\/panel\/login/);
  });

  test.describe('после входа', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(`${E2E.baseUrl}/panel/email-accounts`);
    });

    test('у всех полей формы есть доступные имена', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Ящики рассылки' })).toBeVisible();
      for (const name of ['Адрес ящика', 'Пароль приложения (SMTP)', 'Лимит писем в день']) {
        await expect(page.getByLabel(name, { exact: true }).first()).toBeVisible();
      }
      await expect(page.getByRole('group', { name: 'SMTP' })).toBeVisible();
    });

    test('ошибка валидации показывается как alert', async ({ page }) => {
      await page.getByLabel('Адрес ящика', { exact: true }).fill(`${uniq('bad')}@example.com`);
      await page.getByLabel('Пароль приложения (SMTP)', { exact: true }).fill('secret-pass');
      await page.getByLabel('Лимит писем в день').last().fill('5000');
      await page.getByRole('button', { name: 'Добавить ящик' }).click();
      await expect(page.getByRole('alert')).toContainText('Лимит');
    });

    test('создание → выключение (optimistic) → удаление; пароль не попадает в HTML', async ({ page }) => {
      const email = `${uniq('e2e')}@example.com`;
      const password = `pw-${uniq('x')}`;
      await page.getByLabel('Адрес ящика', { exact: true }).fill(email);
      await page.getByLabel('Имя отправителя').first().fill('E2E тест');
      await page.getByLabel('Пароль приложения (SMTP)', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Добавить ящик' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Ящик добавлен' })).toBeVisible();

      const row = page.getByRole('listitem').filter({ hasText: email });
      await expect(row).toContainText('активен');
      expect(await page.content()).not.toContain(password);

      await row.getByRole('button', { name: 'Выключить' }).click();
      await expect(row).toContainText('выключен');
      await expect(row.getByRole('button', { name: 'Включить' })).toHaveAttribute('aria-pressed', 'false');

      page.once('dialog', (d) => d.accept());
      await row.getByRole('button', { name: 'Удалить' }).click();
      await expect(page.getByRole('listitem').filter({ hasText: email })).toHaveCount(0);
    });
  });
});
