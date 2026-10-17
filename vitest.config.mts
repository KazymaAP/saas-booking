// vitest.config.mts — unit-тесты lib/ и server actions супер-админки (агент 7).
// Алиас @/ совпадает с tsconfig.json. Playwright-спеки (tests/*.spec.ts) исключены — их запускает playwright.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  // JSX как в Next (automatic runtime): server components страниц можно вызывать в тестах без import React.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    exclude: ['node_modules', 'tests/**'],
  },
});
