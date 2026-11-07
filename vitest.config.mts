// vitest.config.mts — unit-тесты lib/ и server actions супер-админки (агент 7).
// Алиас @/ совпадает с tsconfig.json. Playwright-спеки (tests/*.spec.ts) исключены — их запускает playwright.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@/lib': fileURLToPath(new URL('./общие/lib', import.meta.url)),
      '@/components': fileURLToPath(new URL('./общие/components', import.meta.url)),
      '@/types': fileURLToPath(new URL('./общие/types', import.meta.url)),
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  // JSX как в Next (automatic runtime): server components страниц можно вызывать в тестах без import React.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['общие/lib/**/*.test.ts', 'главная/**/*.test.ts', 'телеграмм-бот/**/*.test.ts', 'app/**/*.test.ts', 'служебное/tests/unit/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'служебное/tests/*.spec.*'],
  },
});
