// tests/admin-verticals.spec.ts — ниши (ТЗ §4.5): экспорт JSON под защитой, JSON-редактор с проверкой синтаксиса,
// создание и правка ниши, импорт.
import { expect, test } from '@playwright/test';
import { expectToast, loginAsAdmin, requireAdmin, requireApp, requireWrites, runId } from './admin-helpers';

test.describe('без входа', () => {
  requireApp();

  test('экспорт ниш — 401 JSON', async ({ request }) => {
    const res = await request.get('/api/verticals', { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect((await res.json()) as { error?: string }).toMatchObject({ error: expect.any(String) });
  });
});

test.describe('супер-админ', () => {
  requireAdmin();
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/panel/verticals');
  });

  test('экспорт — массив ниш без кэша', async ({ page }) => {
    const res = await page.request.get('/api/verticals');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toMatch(/no-store/);
    expect(res.headers()['content-disposition']).toMatch(/attachment/);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('JSON-редактор: ошибка синтаксиса сразу, без запроса', async ({ page }) => {
    const form = page.getByRole('form', { name: 'Новая ниша' });
    const editor = form.locator('textarea').first();
    await editor.fill('{ "broken": ');
    await expect(editor).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByText(/Ошибка JSON/).first()).toBeVisible();
    await expect(form.getByRole('button', { name: /^Форматировать/ }).first()).toBeDisabled();
    await editor.fill('{"a":1}');
    await expect(editor).not.toHaveAttribute('aria-invalid', 'true');
    await form.getByRole('button', { name: /^Форматировать/ }).first().click();
    await expect(editor).toHaveValue('{\n  "a": 1\n}');
  });

  test('ошибки zod под полями формы', async ({ page }) => {
    const form = page.getByRole('form', { name: 'Новая ниша' });
    await form.getByLabel('Slug').fill('Bad Slug!');
    await form.getByLabel('Префикс URL').fill('toolong');
    await form.getByRole('button', { name: 'Создать' }).click();
    await expect(form.getByLabel('Название')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
  });

  test('создание и правка ниши', async ({ page }) => {
    requireWrites();
    const id = runId();
    const slug = `e2e-${id}`;
    const form = page.getByRole('form', { name: 'Новая ниша' });
    await form.getByLabel('Название').fill(`E2E ниша ${id}`);
    await form.getByLabel('Slug').fill(slug);
    // Префикс уникален среди ниш: 4 последних символа runId (латиница/цифры).
    await form.getByLabel('Префикс URL').fill(id.slice(-4));
    await form.getByLabel('Активна').uncheck();
    await form.getByRole('button', { name: 'Создать' }).click();
    await expectToast(page, `Создана ниша: E2E ниша ${id}`);
    await page.getByRole('link', { name: `Править нишу «E2E ниша ${id}»` }).click();
    await expect(page).toHaveURL(/edit=/);
    const edit = page.getByRole('form', { name: `Правка ниши E2E ниша ${id}` });
    await expect(edit.getByLabel('Slug')).toHaveValue(slug);
  });
});
