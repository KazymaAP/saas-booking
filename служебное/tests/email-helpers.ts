// tests/email-helpers.ts — общий вход в супер-админку для Playwright-спеков зоны email (агент 8).
// Спеки запускаются только при заданных E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD — иначе skip
// (без стенда с БД и SMTP проверять нечего, а падать красным из-за окружения нельзя).
import { expect, type Page } from '@playwright/test';

export const E2E = {
  baseUrl: process.env.E2E_BASE_URL ?? '',
  email: process.env.E2E_ADMIN_EMAIL ?? '',
  password: process.env.E2E_ADMIN_PASSWORD ?? '',
};

export const E2E_READY = Boolean(E2E.baseUrl && E2E.email && E2E.password);
export const SKIP_REASON = 'Нужны E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD';

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${E2E.baseUrl}/panel/login`);
  // На странице входа (зона агента 12) у полей нет label — ищем по name.
  await page.locator('input[name="email"]').fill(E2E.email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole('button', { name: /войти/i }).click();
  await expect(page).not.toHaveURL(/\/panel\/login/);
}

// Уникальная метка для данных теста: повторный прогон не конфликтует с прошлым.
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}
