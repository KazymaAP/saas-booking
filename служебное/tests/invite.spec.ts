// tests/invite.spec.ts — e2e приглашения /invite/{token} (ТЗ §5.6).
import { expect, test } from '@playwright/test';
import { addMember, clearAuthRateLimits, createBusiness, createInviteToken, createUser, STAND, STAND_SKIP_REASON, uniqueEmail } from './stand';
import { formAlert } from './ui';

const PASSWORD = 'invite-strong-password';

test.describe('приглашение: без стенда', () => {
  test('битый токен: понятное сообщение, формы нет, токен не уходит в Referer', async ({ page }) => {
    await page.goto('/invite/not-a-token');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Приглашение недоступно');
    await expect(formAlert(page)).toHaveText(/не найдено/);
    await expect(page.locator('form')).toHaveCount(0);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin');
  });
});

test.describe('приглашение: стенд', () => {
  test.skip(!STAND, STAND_SKIP_REASON);
  test.beforeEach(async () => { await clearAuthRateLimits(); });

  test('новый менеджер: форма с почтой, пароль, вход в кабинет; ссылка одноразовая', async ({ page }) => {
    const biz = await createBusiness();
    const email = uniqueEmail('invitee');
    const token = await createInviteToken(biz.id, email, 'manager');
    await page.goto(`/invite/${token}`);
    await expect(page.getByLabel('Почта')).toHaveValue(email);
    await expect(page.getByLabel('Пароль', { exact: true })).toBeFocused();
    await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Пароль ещё раз').fill(PASSWORD);
    await page.getByRole('button', { name: 'Принять приглашение' }).click();
    await expect(page).toHaveURL(new RegExp(`${biz.panel}$`));
    await page.goto(`/invite/${token}`);
    await expect(formAlert(page)).toHaveText(/уже использовано/);
  });

  test('короткий пароль и несовпадение: ошибка, приглашение остаётся рабочим', async ({ page }) => {
    const biz = await createBusiness();
    const token = await createInviteToken(biz.id, uniqueEmail('short'), 'manager');
    await page.goto(`/invite/${token}`);
    await page.getByLabel('Пароль', { exact: true }).fill('short');
    await page.getByLabel('Пароль ещё раз').fill('short');
    // minLength в разметке остановит браузер — снимаем, чтобы проверить серверную проверку.
    await page.evaluate(() => document.querySelectorAll('input').forEach((i) => i.removeAttribute('minlength')));
    await page.getByRole('button', { name: 'Принять приглашение' }).click();
    await expect(formAlert(page)).toHaveText(/не меньше 8 символов/);
    await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Пароль ещё раз').fill(`${PASSWORD}-x`);
    await page.getByRole('button', { name: 'Принять приглашение' }).click();
    await expect(formAlert(page)).toHaveText(/не совпадают/);
  });

  test('истёкшее приглашение: сообщение про 7 дней', async ({ page }) => {
    const biz = await createBusiness();
    const token = await createInviteToken(biz.id, uniqueEmail('expired'), 'manager', -1);
    await page.goto(`/invite/${token}`);
    await expect(formAlert(page)).toHaveText(/истёк/);
  });

  test('существующий аккаунт: нужен текущий пароль, чужим приглашением аккаунт не перехватить', async ({ page }) => {
    const first = await createBusiness();
    const second = await createBusiness();
    const email = uniqueEmail('existing');
    await addMember(first.id, await createUser(email, PASSWORD), email, 'owner');
    const token = await createInviteToken(second.id, email, 'manager');
    await page.goto(`/invite/${token}`);
    await page.getByLabel('Пароль', { exact: true }).fill('another-password-1');
    await page.getByLabel('Пароль ещё раз').fill('another-password-1');
    await page.getByRole('button', { name: 'Принять приглашение' }).click();
    await expect(formAlert(page)).toHaveText(/текущий пароль/);
    await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Пароль ещё раз').fill(PASSWORD);
    await page.getByRole('button', { name: 'Принять приглашение' }).click();
    await expect(page).toHaveURL(new RegExp(`${second.panel}$`));
  });
});
