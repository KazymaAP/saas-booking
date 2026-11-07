// tests/owner-services.spec.ts — услуги: добавление с валидацией, правка, мгновенное скрытие/показ.
import { expect, test, type Page } from '@playwright/test';
import { OWNER, expectToast, login, panelUrl, requireOwner, uniq } from './owner-helpers';

async function openServices(page: Page): Promise<void> {
  await login(page, OWNER);
  await page.goto(panelUrl('services'));
}

function addForm(page: Page) {
  return page.getByRole('region', { name: 'Добавить услугу' });
}

test.describe('услуги', () => {
  test.beforeEach(requireOwner);

  test('ошибки валидации — под полями, с aria-invalid и aria-describedby', async ({ page }) => {
    await openServices(page);
    const form = addForm(page);
    await form.getByLabel('Цена, ₽').fill('abc');
    await form.getByRole('button', { name: 'Добавить' }).click();
    const name = form.getByLabel('Название');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await name.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy?.split(' ').pop()}"]`)).toHaveText(/Название/);
    await expect(form.getByLabel('Цена, ₽')).toHaveAttribute('aria-invalid', 'true');
  });

  test('добавить → изменить → скрыть → показать', async ({ page }) => {
    await openServices(page);
    const title = uniq('E2E услуга');
    const form = addForm(page);
    await form.getByLabel('Название').fill(title);
    await form.getByLabel('Цена, ₽').fill('1500');
    await form.getByLabel('Длительность, мин').fill('45');
    await form.getByRole('button', { name: 'Добавить' }).click();
    await expectToast(page, 'Услуга добавлена');
    await expect(form.getByLabel('Название')).toHaveValue('');

    const active = page.getByRole('region', { name: /На сайте/ });
    const card = active.locator('li', { hasText: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText('1 500 ₽');

    await card.getByRole('button', { name: `Изменить: ${title}` }).click();
    await card.getByLabel('Цена, ₽').fill('2000');
    await card.getByRole('button', { name: 'Сохранить' }).click();
    await expectToast(page, 'Сохранено');
    await expect(active.locator('li', { hasText: title })).toContainText('2 000 ₽');

    // Optimistic: карточка переезжает в «Скрытые» до ответа сервера.
    await active.getByRole('button', { name: `Скрыть: ${title}` }).click();
    const hidden = page.getByRole('region', { name: /Скрытые/ });
    await expect(hidden.locator('li', { hasText: title })).toBeVisible({ timeout: 1000 });
    await expectToast(page, 'Услуга скрыта с сайта');

    await hidden.getByRole('button', { name: `Показать: ${title}` }).click();
    await expect(active.locator('li', { hasText: title })).toBeVisible({ timeout: 1000 });
    // Уборка: оставляем услугу скрытой, чтобы не засорять тестовый сайт.
    await active.getByRole('button', { name: `Скрыть: ${title}` }).click();
    await expectToast(page, 'Услуга скрыта с сайта');
  });

  test('мобильный: одна колонка, без горизонтального скролла', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await openServices(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
