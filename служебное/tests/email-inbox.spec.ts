// tests/email-inbox.spec.ts — входящие: доступ, фильтры, отметки, валидация ответа, a11y.
import { expect, test } from '@playwright/test';
import { E2E, E2E_READY, SKIP_REASON, loginAsAdmin } from './email-helpers';

test.describe('/panel/inbox', () => {
  test.skip(!E2E_READY, SKIP_REASON);

  test('без входа — редирект на логин', async ({ page }) => {
    await page.goto(`${E2E.baseUrl}/panel/inbox`);
    await expect(page).toHaveURL(/\/panel\/login/);
  });

  test.describe('после входа', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
    });

    test('фильтры: активный отмечен aria-current, неизвестный фильтр = «Все»', async ({ page }) => {
      await page.goto(`${E2E.baseUrl}/panel/inbox?filter=unread`);
      const nav = page.getByRole('navigation', { name: 'Фильтр писем' });
      await expect(nav.getByRole('link', { name: /Непрочитанные/ })).toHaveAttribute('aria-current', 'page');
      await nav.getByRole('link', { name: 'Отвеченные' }).click();
      await expect(page).toHaveURL(/filter=answered/);
      await page.goto(`${E2E.baseUrl}/panel/inbox?filter=<script>`);
      await expect(nav.getByRole('link', { name: 'Все' })).toHaveAttribute('aria-current', 'page');
    });

    test('отметка прочитанным/непрочитанным меняется сразу', async ({ page }) => {
      await page.goto(`${E2E.baseUrl}/panel/inbox?filter=all`);
      const thread = page.getByRole('article').first();
      test.skip((await thread.count()) === 0, 'Во входящих нет писем');
      const toggle = thread.getByRole('button', { name: /нить/ });
      const before = await toggle.textContent();
      await toggle.click();
      await expect(toggle).not.toHaveText(before ?? '');
      await toggle.click();
      await expect(toggle).toHaveText(before ?? '');
    });

    test('у поля ответа есть label, пустой ответ не отправляется', async ({ page }) => {
      await page.goto(`${E2E.baseUrl}/panel/inbox?filter=all`);
      const thread = page.getByRole('article').first();
      test.skip((await thread.count()) === 0, 'Во входящих нет писем');
      const field = thread.getByLabel(/Ответ \(уйдёт с того же ящика/);
      await expect(field).toBeVisible();
      await thread.getByRole('button', { name: 'Ответить' }).click();
      // required + minLength: браузер не отправляет форму, статуса «поставлен в очередь» нет.
      await expect(thread.getByRole('status').filter({ hasText: 'поставлен в очередь' })).toHaveCount(0);
      expect(await field.evaluate((el) => (el as HTMLTextAreaElement).validity.valid)).toBe(false);
    });
  });
});
