// tests/owner-bookings.spec.ts — брони: фильтр, мгновенная смена статуса, подтверждение отмены, мобильные карточки.
// Нужны брони в тестовом бизнесе (хотя бы одна в статусе «Новая»), иначе тесты статусов пропускаются.
import { expect, test, type Page } from '@playwright/test';
import { OWNER, login, panelUrl, requireOwner } from './owner-helpers';

async function openBookings(page: Page, filter: 'upcoming' | 'all' = 'upcoming'): Promise<void> {
  await login(page, OWNER);
  await page.goto(filter === 'all' ? `${panelUrl('bookings')}?filter=all` : panelUrl('bookings'));
}

test.describe('брони', () => {
  test.beforeEach(requireOwner);

  test('фильтр «Предстоящие / Все» с aria-current', async ({ page }) => {
    await openBookings(page);
    const filters = page.getByRole('navigation', { name: 'Фильтр броней' });
    await expect(filters.getByRole('link', { name: 'Предстоящие' })).toHaveAttribute('aria-current', 'page');
    await filters.getByRole('link', { name: 'Все' }).click();
    await expect(filters.getByRole('link', { name: 'Все' })).toHaveAttribute('aria-current', 'page');
  });

  test('«Подтвердить» меняет статус сразу и показывает toast', async ({ page }) => {
    await openBookings(page, 'all');
    const confirmBtn = page.locator('table').getByRole('button', { name: /^Подтвердить:/ }).first();
    test.skip((await confirmBtn.count()) === 0, 'Нет новых броней');
    const row = page.locator('tr', { has: confirmBtn });
    await confirmBtn.click();
    // Optimistic: бейдж меняется до ответа сервера.
    await expect(row.getByText('Подтверждена')).toBeVisible({ timeout: 1000 });
    await expect(page.getByRole('status').filter({ hasText: 'Запись подтверждена' }).first()).toBeVisible();
  });

  test('«Отменить» спрашивает подтверждение, «Отмена» ничего не меняет', async ({ page }) => {
    await openBookings(page, 'all');
    const cancelBtn = page.locator('table').getByRole('button', { name: /^Отменить:/ }).first();
    test.skip((await cancelBtn.count()) === 0, 'Нет активных броней');
    await cancelBtn.click();
    const dialog = page.getByRole('dialog', { name: 'Отменить запись?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toBeHidden();
    await expect(cancelBtn).toBeVisible();
  });

  test('ошибка сервера откатывает статус и показывает ошибку', async ({ page }) => {
    await openBookings(page, 'all');
    const doneBtn = page.locator('table').getByRole('button', { name: /^Выполнено:/ }).first();
    test.skip((await doneBtn.count()) === 0, 'Нет активных броней');
    // Server action — POST на ту же страницу с заголовком Next-Action: рвём его, чтобы проверить откат.
    await page.route('**/panel/bookings**', (route) => (route.request().headers()['next-action'] ? route.abort() : route.continue()));
    const row = page.locator('tr', { has: doneBtn });
    const before = await row.locator('td').nth(3).innerText();
    await doneBtn.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Не удалось' }).first()).toBeVisible({ timeout: 5000 });
    await expect(row.locator('td').nth(3)).toHaveText(before);
  });

  test('поиск по телефону и имени сужает список, «ничего не найдено» — понятный текст', async ({ page }) => {
    await openBookings(page, 'all');
    const search = page.getByRole('searchbox', { name: 'Поиск' });
    test.skip((await search.count()) === 0, 'Мало броней — поле поиска не показывается');
    await search.fill('zzzz-нет-такого');
    await expect(page.getByText(/ничего не найдено/)).toBeVisible();
    await search.fill('');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('брони сгруппированы по дням (заголовки «Сегодня», «Завтра» или дата)', async ({ page }) => {
    await openBookings(page, 'all');
    const groupHeaders = page.locator('table th[scope="colgroup"]');
    test.skip((await groupHeaders.count()) === 0, 'Нет броней');
    await expect(groupHeaders.first()).toHaveText(/Сегодня|Завтра|Вчера|\d+ [а-я]+/);
  });

  test('< 768px — карточки вместо таблицы, кнопки ≥ 44px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await openBookings(page, 'all');
    await expect(page.locator('table')).toBeHidden();
    const firstBtn = page.locator('main li button').first();
    test.skip((await firstBtn.count()) === 0, 'Нет броней с действиями');
    const box = await firstBtn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
