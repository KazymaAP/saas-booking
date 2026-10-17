// playwright.config.mts — e2e (tests/*.spec.mts). Файл .mts не входит в tsconfig (include: **/*.ts), поэтому
// next build и typecheck не требуют @playwright/test, пока зависимость не добавлена в package.json.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.mts',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
});
