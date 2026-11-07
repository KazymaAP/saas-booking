// tests/vitest.config.ts — unit-тесты (lib/hours, actions кабинета). Запуск: npx vitest run -c tests/vitest.config.ts
// Корень — проект: ищем только *.test.ts, Playwright-спеки (*.spec.ts) не трогаем.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  resolve: { alias: { '@': root } },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/hours.ts', 'app/\\[prefix\\]/\\[slug\\]/panel/**/*.ts'],
      // notifications/** — зона агента 9; upload-client/usePhotoUploads — браузерный код, покрыт e2e (owner-photos).
      exclude: ['**/*.tsx', '**/*.test.ts', '**/notifications/**', '**/upload-client.ts', '**/usePhotoUploads.ts'],
    },
  },
});
