// tests/import.spec.mts — e2e импорта 2GIS (Playwright). Запуск против работающего приложения:
//   BASE_URL=http://localhost:3000 pnpm exec playwright test tests/import.spec.mts
// Сценарий через интерфейс выполняется, только если заданы E2E_ADMIN_EMAIL и E2E_ADMIN_PASSWORD (супер-админ из SUPERADMIN_EMAILS);
// без них проверяется только защита API. Всегда используется dry-run — в БД ничего не пишется.
import { expect, test, type APIRequestContext } from '@playwright/test';
import * as XLSX from 'xlsx';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test.use({ baseURL: BASE_URL });

function workbook(rows: Array<Record<string, string>>): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const SAMPLE = workbook([
  { Наименование: 'E2E Шина', Рубрики: 'Шиномонтаж', Адрес: 'ул. Тестовая 1', Телефон: '89000000001', 'E-mail': 'e2e@example.com', '2GIS URL': 'https://2gis.ru/firm/e2e-1' },
  { Наименование: 'E2E Цветы', Рубрики: 'Цветы', Адрес: 'ул. Тестовая 2', Телефон: '89000000002', 'E-mail': '', '2GIS URL': 'https://2gis.ru/firm/e2e-2' },
  { Наименование: '', Рубрики: 'Шиномонтаж', Адрес: '', Телефон: '', 'E-mail': '', '2GIS URL': '' },
]);

async function upload(request: APIRequestContext, file: { name: string; mimeType: string; buffer: Buffer }, fields: Record<string, string> = {}) {
  return request.post('/api/import/2gis', { multipart: { file, ...fields } });
}

test.describe('API /api/import/2gis без сессии', () => {
  test('анонимный запрос — 401, файл не обрабатывается', async ({ request }) => {
    const res = await upload(request, { name: 'a.xlsx', mimeType: XLSX_MIME, buffer: SAMPLE }, { dry_run: '1' });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ ok: false, reason: 'auth' });
  });

  test('GET не поддерживается', async ({ request }) => {
    const res = await request.get('/api/import/2gis');
    expect(res.status()).toBe(405);
  });
});

test.describe('импорт через интерфейс (dry-run)', () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'нужны E2E_ADMIN_EMAIL и E2E_ADMIN_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await page.goto('/panel/login');
    await page.getByPlaceholder('Email').fill(ADMIN_EMAIL);
    await page.getByPlaceholder('Пароль').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(/\/panel\/funnel/);
  });

  test('загрузка xlsx показывает статистику по фильтру', async ({ page }) => {
    await page.goto('/panel/businesses');
    await page.locator('input[name="file"]').setInputFiles({ name: 'e2e.xlsx', mimeType: XLSX_MIME, buffer: SAMPLE });
    await page.locator('input[name="filter"]').fill('шин');
    await page.getByLabel('Только проверить, без записи').check();
    await page.getByRole('button', { name: 'Загрузить' }).click();
    await expect(page.getByText(/Всего строк 3, по фильтру 2, с email 1, создано 0/)).toBeVisible();
  });

  test('API с сессией: не xlsx — 415, нет колонок — 422', async ({ page }) => {
    const notXlsx = await upload(page.request, { name: 'a.xlsx', mimeType: XLSX_MIME, buffer: Buffer.from('<html></html>') }, { dry_run: '1' });
    expect(notXlsx.status()).toBe(415);
    const noHeaders = await upload(page.request, { name: 'a.xlsx', mimeType: XLSX_MIME, buffer: workbook([{ Колонка: 'x' }]) }, { dry_run: '1' });
    expect(noHeaders.status()).toBe(422);
    expect(await noHeaders.json()).toMatchObject({ ok: false, reason: 'headers' });
  });

  test('API с сессией: dry-run возвращает полную статистику', async ({ page }) => {
    const res = await upload(page.request, { name: 'a.xlsx', mimeType: XLSX_MIME, buffer: SAMPLE }, { dry_run: '1', filter: 'шин' });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, stats: { total: 3, selected: 2, invalid: 1, withEmail: 1, created: 0, dryRun: true } });
  });
});
