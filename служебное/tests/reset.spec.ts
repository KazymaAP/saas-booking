// tests/reset.spec.ts — e2e сброса пароля: /panel/forgot-password → /reset-password?token=... (ТЗ §5.5).
import { expect, test } from '@playwright/test';
import { addMember, clearAuthRateLimits, createAuthToken, createBusiness, createUser, STAND, STAND_SKIP_REASON, uniqueEmail } from './stand';
import { formAlert, formStatus } from './ui';

const OLD_PASSWORD = 'old-strong-password';
const NEW_PASSWORD = 'new-strong-password';

test.describe('сброс пароля: без стенда', () => {
  test('форма запроса: подпись, автофокус, ссылка назад ко входу нужной области', async ({ page }) => {
    await page.goto('/panel/forgot-password');
    await expect(page.getByLabel('Почта')).toBeFocused();
    await expect(page.getByRole('link', { name: 'Вернуться ко входу' })).toHaveAttribute('href', '/panel/login');
    await page.goto(`/panel/forgot-password?next=${encodeURIComponent('/s/tire/panel/bookings')}`);
    await expect(page.getByRole('link', { name: 'Вернуться ко входу' })).toHaveAttribute('href', '/s/tire/panel/login');
  });

  test('/reset-password без токена ведёт на форму запроса; битый токен — сообщение', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page).toHaveURL(/\/panel\/forgot-password/);
    await page.goto('/reset-password?token=garbage');
    await expect(formAlert(page)).toHaveText(/недействительна/);
    await expect(page.getByLabel('Новый пароль', { exact: true })).toHaveCount(0);
  });

  test('magic-link: форма запроса и битая ссылка', async ({ page }) => {
    await page.goto('/magic-link');
    await expect(page.getByLabel('Почта')).toBeFocused();
    await page.goto('/magic-link?token=garbage');
    await expect(formAlert(page)).toHaveText(/недействительна/);
  });
});

test.describe('сброс пароля: стенд', () => {
  test.skip(!STAND, STAND_SKIP_REASON);
  test.beforeEach(async () => { await clearAuthRateLimits(); });

  test('ответ одинаков для зарегистрированного и неизвестного адреса', async ({ page }) => {
    for (const email of [uniqueEmail('ghost'), uniqueEmail('ghost2')]) {
      await page.goto('/panel/forgot-password');
      await page.getByLabel('Почта').fill(email);
      await page.getByRole('button', { name: 'Отправить ссылку' }).click();
      await expect(formStatus(page)).toHaveText(/Если адрес зарегистрирован/);
      expect(page.url()).not.toContain('ghost');
    }
  });

  test('владелец: новый пароль, вход в кабинет, старый пароль больше не работает, ссылка одноразовая', async ({ page }) => {
    const biz = await createBusiness();
    const email = uniqueEmail('reset');
    await addMember(biz.id, await createUser(email, OLD_PASSWORD), email, 'owner');
    const token = await createAuthToken('reset', email, 'owner', biz.panel);
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel('Новый пароль', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Новый пароль ещё раз').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Сохранить пароль' }).click();
    await expect(page).toHaveURL(new RegExp(`${biz.panel}$`));

    await page.context().clearCookies();
    await page.goto(`${biz.panel}/login`);
    await page.getByLabel('Почта').fill(email);
    await page.getByLabel('Пароль').fill(OLD_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(formAlert(page)).toHaveText(/Неверная почта или пароль/);

    await page.goto(`/reset-password?token=${token}`);
    await expect(formAlert(page)).toHaveText(/недействительна/);
  });

  test('истёкшая ссылка (старше 1 часа)', async ({ page }) => {
    const token = await createAuthToken('reset', uniqueEmail('late'), 'admin', '/panel/funnel', -1);
    await page.goto(`/reset-password?token=${token}`);
    await expect(formAlert(page)).toHaveText(/истёк/);
  });
});
