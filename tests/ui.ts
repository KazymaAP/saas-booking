// tests/ui.ts — локаторы сообщений формы. Next.js добавляет на каждую страницу пустой
// #__next-route-announcer__ с role="alert", поэтому ищем только внутри <main> страницы.
import type { Locator, Page } from '@playwright/test';

export function formAlert(page: Page): Locator {
  return page.locator('main').getByRole('alert');
}

export function formStatus(page: Page): Locator {
  return page.locator('main').getByRole('status');
}
