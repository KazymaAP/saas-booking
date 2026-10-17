// tests/owner-photos.spec.ts — фото: подпись обязательна, превью и прогресс сразу, удаление с подтверждением, лимиты.
// Файлы создаются в памяти (PNG 1×1 и «большой» буфер) — бинарников в репозитории нет.
import { expect, test, type Page } from '@playwright/test';
import { OWNER, expectToast, login, panelUrl, requireOwner, uniq } from './owner-helpers';

// Минимальный валидный PNG 1×1.
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MB = 1024 * 1024;

async function openPhotos(page: Page): Promise<void> {
  await login(page, OWNER);
  await page.goto(panelUrl('photos'));
}

async function pickFiles(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Выбрать фото' }).click();
  await (await chooser).setFiles(files);
}

test.describe('фото', () => {
  test.beforeEach(requireOwner);

  test('без подписи файл не выбирается — ошибка у поля', async ({ page }) => {
    await openPhotos(page);
    test.skip(await page.getByRole('button', { name: 'Выбрать фото' }).isHidden(), 'Лимит фото исчерпан');
    await page.getByRole('button', { name: 'Выбрать фото' }).click();
    const alt = page.getByLabel('Подпись к фото');
    await expect(alt).toHaveAttribute('aria-invalid', 'true');
    await expect(alt).toBeFocused();
  });

  test('неподдерживаемый тип и слишком большой исходник отклоняются в браузере', async ({ page }) => {
    await openPhotos(page);
    test.skip(await page.getByRole('button', { name: 'Выбрать фото' }).isHidden(), 'Лимит фото исчерпан');
    await page.getByLabel('Подпись к фото').fill('Проверка лимитов');
    await pickFiles(page, [
      { name: 'doc.gif', mimeType: 'image/gif', buffer: PNG_1PX },
      { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(26 * MB) },
    ]);
    const alert = page.getByRole('alert').filter({ hasText: 'doc.gif' });
    await expect(alert).toContainText('JPG, PNG или WebP');
    await expect(alert).toContainText('huge.jpg');
  });

  test('загрузка: превью сразу, затем toast; удаление с подтверждением', async ({ page }) => {
    await openPhotos(page);
    test.skip(await page.getByRole('button', { name: 'Выбрать фото' }).isHidden(), 'Лимит фото исчерпан');
    const caption = uniq('E2E фото');
    await page.getByLabel('Подпись к фото').fill(caption);
    await pickFiles(page, [{ name: 'tiny.png', mimeType: 'image/png', buffer: PNG_1PX }]);
    // Optimistic-превью с этапом загрузки появляется до ответа сервера.
    await expect(page.getByLabel(new RegExp(`: ${caption}$`)).first()).toBeVisible({ timeout: 1000 });
    await expectToast(page, 'Фото добавлено');

    const del = page.getByRole('button', { name: `Удалить фото: ${caption}` });
    await expect(del).toBeVisible();
    await del.click();
    const dialog = page.getByRole('dialog', { name: 'Удалить фото?' });
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(del).toBeVisible();
    await del.click();
    await dialog.getByRole('button', { name: 'Удалить' }).click();
    await expect(del).toBeHidden({ timeout: 1000 });
    await expectToast(page, 'Фото удалено');
  });

  test('мобильный: сетка без горизонтального скролла', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await openPhotos(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
