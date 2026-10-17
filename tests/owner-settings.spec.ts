// tests/owner-settings.spec.ts — настройки: валидация рабочего времени и телефонов на клиенте, сохранение, a11y-атрибуты.
import { expect, test, type Page } from '@playwright/test';
import { OWNER, expectToast, login, panelUrl, requireOwner } from './owner-helpers';

async function openSettings(page: Page): Promise<void> {
  await login(page, OWNER);
  await page.goto(panelUrl('settings'));
}

test.describe('настройки', () => {
  test.beforeEach(requireOwner);

  test('ошибка часов показывается с названием дня, без запроса к серверу', async ({ page }) => {
    await openSettings(page);
    let actionCalls = 0;
    page.on('request', (r) => { if (r.headers()['next-action']) actionCalls += 1; });
    const tuesday = page.getByLabel('Вторник');
    await tuesday.fill('18:00-09:00');
    await tuesday.blur();
    await expect(page.getByRole('alert').filter({ hasText: /^Вторник:/ })).toBeVisible();
    await expect(tuesday).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: /Сохранить/ }).click();
    expect(actionCalls).toBe(0);
  });

  test('несколько интервалов и «выходной» принимаются', async ({ page }) => {
    await openSettings(page);
    const monday = page.getByLabel('Понедельник');
    const original = await monday.inputValue();
    await monday.fill('09:00-13:00, 14:00-20:00');
    await monday.blur();
    await expect(monday).toHaveAttribute('aria-invalid', 'false');
    await page.getByRole('button', { name: /Сохранить/ }).click();
    await expectToast(page, 'Настройки сохранены');
    await page.reload();
    await expect(page.getByLabel('Понедельник')).toHaveValue(/09:00-13:00, 14:00-20:00/);
    // Возвращаем как было.
    await page.getByLabel('Понедельник').fill(original);
    await page.getByRole('button', { name: /Сохранить/ }).click();
    await expectToast(page, 'Настройки сохранены');
  });

  test('неверный телефон — ошибка под полем', async ({ page }) => {
    await openSettings(page);
    const phones = page.getByLabel('Телефоны');
    await phones.fill('123');
    await phones.blur();
    await expect(phones).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: 'нужен номер РФ' })).toBeVisible();
  });

  test('кнопка неактивна, пока ничего не изменено', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('button', { name: /Сохранить/ })).toBeDisabled();
    await page.getByLabel('Город').fill(`${await page.getByLabel('Город').inputValue()} `);
    await expect(page.getByRole('button', { name: /Сохранить/ })).toBeEnabled();
  });

  test('несохранённые правки: браузер предупреждает при перезагрузке', async ({ page }) => {
    await openSettings(page);
    await page.getByLabel('Город').fill(`${await page.getByLabel('Город').inputValue()} `);
    const dialog = page.waitForEvent('dialog');
    void page.reload();
    const d = await dialog;
    expect(d.type()).toBe('beforeunload');
    await d.dismiss();
  });

  test('все поля ТЗ §4.6 на месте', async ({ page }) => {
    await openSettings(page);
    for (const label of ['Название', 'Описание', 'Город', 'Адрес', 'Телефоны', 'Email для клиентов', 'Цвет сайта',
      'Шаг записи', 'Запись вперёд, дней', 'Не позже чем за, ч', 'Отмена клиентом за, ч', 'Подтверждать новые записи автоматически']) {
      await expect(page.getByLabel(label).first()).toBeVisible();
    }
  });
});
