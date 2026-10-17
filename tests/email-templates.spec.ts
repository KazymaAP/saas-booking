// tests/email-templates.spec.ts — шаблоны: создание, новая версия, откат, предпросмотр в sandbox, экранирование, удаление.
import { expect, test } from '@playwright/test';
import { E2E, E2E_READY, SKIP_REASON, loginAsAdmin, uniq } from './email-helpers';

test.describe('/panel/templates', () => {
  test.skip(!E2E_READY, SKIP_REASON);

  test('без входа — редирект на логин', async ({ page }) => {
    await page.goto(`${E2E.baseUrl}/panel/templates`);
    await expect(page).toHaveURL(/\/panel\/login/);
  });

  test('создание → правка (v2) → откат (v3) → удаление', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${E2E.baseUrl}/panel/templates`);
    const name = uniq('e2e-tpl');

    await page.getByLabel('Название').fill(name);
    await page.getByLabel('Канал').selectOption('client');
    await page.getByLabel('Тип').selectOption('booking_new');
    await page.getByLabel('Тема').fill('Запись в {business_name}');
    await page.getByLabel('Текст письма').fill('Здравствуйте, {client_name}! <b>не тег</b>');
    await page.getByRole('button', { name: 'Создать шаблон' }).click();
    await expect(page).toHaveURL(/edit=/);
    await expect(page.getByRole('heading', { name: new RegExp(`Правка: ${name} \\(v1\\)`) })).toBeVisible();

    // Предпросмотр: iframe без прав на скрипты, значения подставлены, HTML из текста экранирован.
    const frame = page.locator('iframe[title="HTML-версия письма"]');
    await expect(frame).toHaveAttribute('sandbox', '');
    await expect(frame.contentFrame().getByText('Здравствуйте, Анна!')).toBeVisible();
    await expect(frame.contentFrame().locator('b')).toHaveCount(0);

    await page.getByLabel('Тема').fill('Новая тема {business_name}');
    await page.getByRole('button', { name: 'Сохранить новую версию' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'версия 2' })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Откатить к версии 1' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Версия 1 восстановлена как версия 3' })).toBeVisible();

    await page.goto(`${E2E.baseUrl}/panel/templates?channel=client`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: `Удалить шаблон ${name}` }).click();
    await expect(page.getByRole('status').filter({ hasText: /удалён|выключен/ })).toBeVisible();
  });
});
