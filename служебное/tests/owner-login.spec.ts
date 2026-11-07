// tests/owner-login.spec.ts — вход в кабинет, навигация, роли и выход (ТЗ §13.9–13.11).
import { expect, test } from '@playwright/test';
import { MANAGER, OWNER, hasManager, login, panelUrl, requireOwner } from './owner-helpers';

test.describe('вход и навигация', () => {
  test.beforeEach(requireOwner);

  test('без сессии кабинет ведёт на логин', async ({ page }) => {
    await page.goto(panelUrl('bookings'));
    await expect(page).toHaveURL(/\/panel\/login/);
  });

  test('неверный пароль — понятная ошибка', async ({ page }) => {
    await page.goto(panelUrl('login'));
    await page.getByPlaceholder('Email').fill(OWNER.email);
    await page.getByPlaceholder('Пароль').fill('wrong-password-123');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('alert')).toContainText('Неверная почта или пароль');
  });

  test('владелец видит все разделы, текущий отмечен aria-current', async ({ page }) => {
    await login(page, OWNER);
    const nav = page.getByRole('navigation', { name: 'Разделы кабинета' });
    for (const name of ['Главная', 'Брони', 'Услуги', 'Фото', 'Тексты', 'Настройки', 'Подписка', 'Команда', 'Данные']) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('link', { name: 'Брони' }).click();
    await expect(nav.getByRole('link', { name: 'Брони' })).toHaveAttribute('aria-current', 'page');
  });

  test('дашборд: карточки и чек-лист с прогрессом', async ({ page }) => {
    await login(page, OWNER);
    await expect(page.getByText('Записей сегодня')).toBeVisible();
    await expect(page.getByText('Записей на 7 дней')).toBeVisible();
    const progress = page.getByRole('progressbar');
    if (await progress.count()) await expect(progress.first()).toHaveAttribute('aria-valuenow', /\d+/);
  });

  test('подсказка на дашборде показывается один раз (localStorage)', async ({ page }) => {
    await login(page, OWNER);
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('panel-tip:')).forEach((k) => localStorage.removeItem(k)));
    await page.reload();
    const tip = page.getByRole('complementary', { name: 'Здесь — главное за день' });
    await expect(tip).toBeVisible();
    await tip.getByRole('button', { name: 'Понятно' }).click();
    await expect(tip).toBeHidden();
    await page.reload();
    await expect(page.getByText('Записей сегодня')).toBeVisible();
    await expect(tip).toHaveCount(0);
  });

  test('мобильный: бургер открывает меню, Esc закрывает', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await login(page, OWNER);
    const burger = page.getByRole('button', { name: /Меню/ });
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    await burger.click();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(burger).toHaveAttribute('aria-expanded', 'false');
    // Без горизонтального скролла на 375px.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('выход завершает сессию', async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole('button', { name: 'Выйти' }).first().click();
    await expect(page).toHaveURL(/\/panel\/login/);
    await page.goto(panelUrl());
    await expect(page).toHaveURL(/\/panel\/login/);
  });
});

test.describe('роль manager', () => {
  test.beforeEach(() => test.skip(!hasManager, 'Нет E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD'));

  test('не видит биллинг, настройки, команду, данные — ни в меню, ни по ссылке', async ({ page }) => {
    await login(page, MANAGER);
    const nav = page.getByRole('navigation', { name: 'Разделы кабинета' });
    for (const name of ['Настройки', 'Подписка', 'Команда', 'Данные']) await expect(nav.getByRole('link', { name })).toHaveCount(0);
    for (const section of ['settings', 'subscription', 'team', 'data']) {
      const res = await page.goto(panelUrl(section));
      expect(res?.status()).toBe(404);
    }
    const csv = await page.request.get(panelUrl('export'));
    expect(csv.status()).toBe(403);
  });
});
