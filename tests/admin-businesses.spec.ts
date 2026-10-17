// tests/admin-businesses.spec.ts — список бизнесов (ТЗ §13.1, §13.3): доступ к экспорту, фильтры, пагинация,
// валидация ручного добавления, карточка с историей.
import { expect, test } from '@playwright/test';
import { expectToast, loginAsAdmin, requireAdmin, requireApp, requireWrites, runId } from './admin-helpers';

test.describe('без входа', () => {
  requireApp();

  test('экспорт CSV недоступен без сессии', async ({ request }) => {
    const res = await request.get('/api/export/businesses?format=csv', { maxRedirects: 0 });
    expect([401, 403]).toContain(res.status());
    expect(res.headers()['content-disposition'] ?? '').not.toContain('attachment');
  });

  test('список бизнесов уводит на вход', async ({ page }) => {
    await page.goto('/panel/businesses');
    await expect(page).toHaveURL(/\/panel\/login/);
  });
});

test.describe('супер-админ', () => {
  requireAdmin();
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/panel/businesses');
  });

  test('фильтры попадают в URL и в ссылки экспорта', async ({ page }) => {
    const filter = page.getByRole('form', { name: 'Фильтр бизнесов' });
    await filter.getByLabel('Город').fill('Москва');
    await filter.getByRole('button').first().click();
    await expect(page).toHaveURL(/city=/);
    const csv = page.getByRole('link', { name: 'Скачать CSV' });
    await expect(csv).toHaveAttribute('href', /format=csv/);
    await expect(csv).toHaveAttribute('href', /city=/);
    // Номер страницы в экспорт не передаётся: файл — вся выборка.
    await expect(csv).not.toHaveAttribute('href', /page=/);
  });

  test('экспорт CSV — вложение с BOM и заголовком', async ({ page }) => {
    const res = await page.request.get('/api/export/businesses?format=csv');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toMatch(/attachment/);
    expect(res.headers()['cache-control']).toMatch(/no-store/);
    const body = await res.body();
    // UTF-8 BOM — Excel открывает кириллицу без «кракозябр».
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  test('пагинация сохраняет фильтры', async ({ page }) => {
    await page.goto('/panel/businesses?status=new');
    // Ждём данные (не скелетон loading.tsx): иначе count() = 0 и тест молча уходит в skip.
    await expect(page.getByRole('status').filter({ hasText: /^Найдено:/ })).toBeVisible();
    const next = page.getByRole('link', { name: 'Дальше →' });
    if ((await next.count()) === 0) test.skip(true, 'Меньше 50 бизнесов — одна страница');
    await next.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/status=new/);
    await expect(page.getByText(/Страница 2/)).toBeVisible();
  });

  test('массовая смена статуса: сервер не ответил — тост, статус откатился, выбор сохранён для повтора', async ({ page }) => {
    // Обрываем только POST server action (заголовок Next-Action); навигация и RSC-запросы идут как обычно.
    await page.route('**/panel/businesses*', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) await route.abort('failed');
      else await route.continue();
    });
    await page.goto('/panel/businesses?status=new');
    // Таблица на десктопе, карточки на мобильном — берём видимый вариант.
    const first = page.getByRole('checkbox', { name: /^Выбрать «/ }).locator('visible=true').first();
    await first.check();
    await page.getByLabel('Сменить статус на…').selectOption('archived');
    await page.getByRole('button', { name: /^Применить \(1\)/ }).click();
    await expectToast(page, 'Сервер не ответил', 'alert');
    // Optimistic «Архив» откатился к исходному статусу, error boundary нет, строка осталась выбранной.
    await expect(page.getByRole('heading', { name: 'Что-то пошло не так' })).toHaveCount(0);
    await expect(first).toBeChecked();
    await expect(page.getByRole('button', { name: /^Применить \(1\)/ })).toBeEnabled();
    await expect(page.getByText('Архив', { exact: true }).locator('visible=true')).toHaveCount(0);
  });

  test('ручное добавление: ошибки под полями, фокус на первом невалидном', async ({ page }) => {
    const form = page.getByRole('form', { name: 'Добавить бизнес вручную' });
    await form.getByLabel('Название').fill('A');
    await form.getByLabel('Телефон').fill('123');
    await form.getByRole('button').last().click();
    const name = form.getByLabel('Название');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Телефон')).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();
    await expectToast(page, 'Проверьте поля формы', 'alert');
  });

  test('ручное добавление и карточка с историей', async ({ page }) => {
    requireWrites();
    const name = `E2E Барбершоп ${runId()}`;
    const form = page.getByRole('form', { name: 'Добавить бизнес вручную' });
    await form.getByLabel('Название').fill(name);
    await form.getByLabel('Город').fill('Тестоград');
    await form.getByRole('button').last().click();
    await expectToast(page, `Добавлено: ${name}`);
    // Без email — «Нет контакта», ищем по названию.
    await page.goto(`/panel/businesses?q=${encodeURIComponent(name)}`);
    await page.getByRole('link', { name: new RegExp(name) }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    // История изменений из audit_log (History.tsx, подписи — _lib/audit-labels.ts).
    await expect(page.getByText('Бизнес добавлен вручную').first()).toBeVisible();
  });
});
