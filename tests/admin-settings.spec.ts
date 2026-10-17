// tests/admin-settings.spec.ts — настройки платформы (ТЗ §15.5): разделы, валидация ИНН/цен/лимитов, сохранение.
import { expect, test } from '@playwright/test';
import { expectToast, loginAsAdmin, requireAdmin, requireApp, requireWrites } from './admin-helpers';

test.describe('без входа', () => {
  requireApp();

  test('настройки уводят на вход', async ({ page }) => {
    await page.goto('/panel/settings');
    await expect(page).toHaveURL(/\/panel\/login/);
  });
});

test.describe('супер-админ', () => {
  requireAdmin();
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/panel/settings');
  });

  test('все разделы на месте', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Настройки платформы' })).toBeVisible();
    for (const name of ['Реквизиты', 'Тарифы', 'Цены по умолчанию', 'Ограничения частоты', 'Функции']) {
      await expect(page.getByRole('form', { name })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /Интеграции/ })).toBeVisible();
  });

  test('ИНН: 10 или 12 цифр — ошибка под полем, связанная aria-describedby', async ({ page }) => {
    const form = page.getByRole('form', { name: 'Реквизиты' });
    const inn = form.getByLabel('ИНН');
    const before = await inn.inputValue();
    await inn.fill('123');
    await form.getByRole('button', { name: 'Сохранить реквизиты' }).click();
    await expect(inn).toHaveAttribute('aria-invalid', 'true');
    await expect(inn).toBeFocused();
    const describedBy = (await inn.getAttribute('aria-describedby')) ?? '';
    const errId = describedBy.split(' ').find((x) => x.endsWith('-err'));
    expect(errId).toBeTruthy();
    await expect(page.locator(`[id="${errId}"]`)).toContainText('ИНН: 10 или 12 цифр');
    // Ничего не сохранилось: после перезагрузки — прежнее значение.
    await page.reload();
    await expect(page.getByRole('form', { name: 'Реквизиты' }).getByLabel('ИНН')).toHaveValue(before);
  });

  test('отрицательная цена и нулевой лимит отклоняются', async ({ page }) => {
    const prices = page.getByRole('form', { name: 'Цены по умолчанию' });
    await prices.getByLabel('Разовая оплата, ₽').fill('-1');
    await prices.getByRole('button', { name: 'Сохранить цены' }).click();
    await expect(prices.getByLabel('Разовая оплата, ₽')).toHaveAttribute('aria-invalid', 'true');

    const limits = page.getByRole('form', { name: 'Ограничения частоты' });
    await limits.getByLabel('Броней за 10 минут').fill('0');
    await limits.getByRole('button', { name: 'Сохранить ограничения' }).click();
    await expect(limits.getByLabel('Броней за 10 минут')).toHaveAttribute('aria-invalid', 'true');
  });

  test('сохранение лимитов без изменений — успех и значения на месте', async ({ page }) => {
    requireWrites();
    const limits = page.getByRole('form', { name: 'Ограничения частоты' });
    const booking = await limits.getByLabel('Броней за 10 минут').inputValue();
    await limits.getByRole('button', { name: 'Сохранить ограничения' }).click();
    await expectToast(page, /Сохранено|Изменений нет/);
    await page.reload();
    await expect(page.getByRole('form', { name: 'Ограничения частоты' }).getByLabel('Броней за 10 минут')).toHaveValue(booking);
  });

  test('сервер не ответил — тост об ошибке, раздел и введённое значение на месте', async ({ page }) => {
    // Обрываем только POST server action (у него заголовок Next-Action); обычная навигация не трогается.
    await page.route('**/panel/settings', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) await route.abort('failed');
      else await route.continue();
    });
    const limits = page.getByRole('form', { name: 'Ограничения частоты' });
    await limits.getByLabel('Броней за 10 минут').fill('7');
    await limits.getByRole('button', { name: 'Сохранить ограничения' }).click();
    await expectToast(page, 'Сервер не ответил', 'alert');
    // Не error boundary: форма видна, значение не потеряно.
    await expect(page.getByRole('heading', { name: 'Что-то пошло не так' })).toHaveCount(0);
    await expect(limits.getByLabel('Броней за 10 минут')).toHaveValue('7');
  });
});
