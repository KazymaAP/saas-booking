// tests/owner-helpers.ts — общие шаги e2e кабинета владельца (Playwright).
// Нужен тестовый бизнес в Supabase. Переменные окружения:
//   E2E_BASE_URL       — адрес приложения (по умолчанию http://localhost:3000)
//   E2E_PANEL_PATH     — путь кабинета без /panel, например /s/e2e-studio
//   E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD     — владелец тестового бизнеса
//   E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD — менеджер (необязательно, тесты ролей пропускаются)
// Без E2E_PANEL_PATH и данных владельца спеки помечаются skipped, а не падают.
import { expect, test, type Page } from '@playwright/test';

export const PANEL_PATH = process.env.E2E_PANEL_PATH ?? '';
export const OWNER = { email: process.env.E2E_OWNER_EMAIL ?? '', password: process.env.E2E_OWNER_PASSWORD ?? '' };
export const MANAGER = { email: process.env.E2E_MANAGER_EMAIL ?? '', password: process.env.E2E_MANAGER_PASSWORD ?? '' };

export const hasOwner = Boolean(PANEL_PATH && OWNER.email && OWNER.password);
export const hasManager = Boolean(PANEL_PATH && MANAGER.email && MANAGER.password);

export function panelUrl(section = ''): string {
  return section ? `${PANEL_PATH}/panel/${section}` : `${PANEL_PATH}/panel`;
}

export function requireOwner(): void {
  test.skip(!hasOwner, 'Нет E2E_PANEL_PATH / E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD');
}

export async function login(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto(panelUrl('login'));
  await page.getByPlaceholder('Email').fill(who.email);
  await page.getByPlaceholder('Пароль').fill(who.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeRe(panelUrl())}/?$`));
}

// Уникальная метка: тесты можно гонять повторно на одном бизнесе, не путаясь в старых данных.
export function uniq(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Тост результата: успех — role=status, ошибка — role=alert (см. _components/Toast.tsx).
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible();
}
