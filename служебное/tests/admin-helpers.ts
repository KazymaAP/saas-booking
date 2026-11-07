// tests/admin-helpers.ts — общие шаги e2e супер-админки: вход, ожидание тоста, флаги окружения.
import { expect, type Page, test } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
export const HAS_ADMIN = Boolean(process.env.E2E_BASE_URL && ADMIN_EMAIL && ADMIN_PASSWORD);
export const HAS_APP = Boolean(process.env.E2E_BASE_URL);
export const ALLOW_WRITES = process.env.E2E_ALLOW_WRITES === '1';

// Пропуск без учётки: в отчёте видно, почему тест не выполнялся. Вызывать в теле test.describe (не в beforeEach):
// тогда skip срабатывает до фикстур и браузер вообще не запускается.
export function requireAdmin(): void {
  test.skip(!HAS_ADMIN, 'Нужны E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD');
}

export function requireApp(): void {
  test.skip(!HAS_APP, 'Нужен E2E_BASE_URL запущенного приложения');
}

// Вызывается внутри теста (до действий): пропускает только изменяющий тест.
export function requireWrites(): void {
  test.skip(!ALLOW_WRITES, 'Изменяющий тест: включается E2E_ALLOW_WRITES=1 (только на тестовой базе)');
}

// Вход через /panel/login (зона агента 12). Поля ищем по name — у формы входа нет <label>.
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/panel/login');
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(/\/panel\/funnel/), page.getByRole('button', { name: 'Войти' }).click()]);
}

// Тост успеха — role=status, ошибки — role=alert (Toast.tsx). Next добавляет свой пустой role=alert (route announcer),
// поэтому ищем по тексту.
export async function expectToast(page: Page, text: string | RegExp, kind: 'status' | 'alert' = 'status'): Promise<void> {
  await expect(page.getByRole(kind).filter({ hasText: text }).first()).toBeVisible();
}

// Уникальный суффикс для тестовых записей: повторный запуск не упирается в unique.
export function runId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Узкий экран: навигация спрятана за burger (PanelNav.tsx).
export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}
