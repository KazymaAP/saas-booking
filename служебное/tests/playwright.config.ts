// tests/playwright.config.ts — e2e кабинета владельца. Запуск: npx playwright test -c tests
// Конфиг лежит в tests/, чтобы не менять корень проекта; Vitest-файлы (*.test.ts) сюда не попадают.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /owner-.*\.spec\.ts$/,
  // Тесты меняют данные одного тестового бизнеса — последовательно, чтобы не мешали друг другу.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
