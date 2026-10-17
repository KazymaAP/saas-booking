// playwright.config.ts — E2E полного flow бронирования (tests/*.spec.ts) против локального production-build.
// БД — только тестовый Supabase из TEST_SUPABASE_* (прод-ключи сюда не попадают: переменные переименовываются
// в NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY только для процесса тестового сервера).
//
// Запуск:  TEST_SUPABASE_URL=… TEST_SUPABASE_SERVICE_ROLE_KEY=… pnpm test:e2e
// Сервер:  `next build && next start -p 3100` (или уже запущенный — E2E_BASE_URL / reuseExistingServer).
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const IS_CI = Boolean(process.env.CI);

// Переменные тестового сервера: Supabase — из TEST_*, внешние каналы (Telegram, лицензия) выключены.
function serverEnv(): Record<string, string> {
  return {
    NEXT_PUBLIC_SITE_URL: BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? '',
    ENCRYPTION_KEY: process.env.TEST_ENCRYPTION_KEY ?? '0'.repeat(64),
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_BUSINESS_BOT_TOKEN: '',
    LICENSE_ID: '',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // Тесты создают свои бизнесы и брони (уникальный slug и IP на тест), поэтому параллельны по файлам.
  fullyParallel: false,
  workers: IS_CI ? 2 : 1,
  retries: IS_CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: IS_CI,
  reporter: IS_CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/support/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    locale: 'ru-RU',
    timezoneId: 'Asia/Novosibirsk', // браузер в другом поясе: календарь и время должны быть по поясу бизнеса
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start -p ${PORT}`,
        url: `${BASE_URL}/privacy`,
        reuseExistingServer: IS_CI === false,
        timeout: 300_000,
        env: serverEnv(),
      },
});
