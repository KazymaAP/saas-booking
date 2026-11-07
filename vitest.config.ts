// vitest.config.ts — unit-тесты (общие/lib, главная, телеграмм-бот, app).
// E2E живут в служебное/tests/*.spec.ts и запускаются Playwright, поэтому здесь исключены.
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
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    // auth-тесты подключают общие/lib/__test__/setup.ts сами (import первой строкой); глобально — нельзя.
    restoreMocks: true,
    include: ['общие/lib/**/*.test.ts', 'главная/**/*.test.ts', 'телеграмм-бот/**/*.test.ts', 'app/**/*.test.ts', 'служебное/tests/unit/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'служебное/tests/*.spec.*'],
    // Unit-тесты не ходят в сеть и БД: Supabase мокается в каждом тесте.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    },
    coverage: {
      provider: 'v8',
      include: [
        'общие/lib/phone.ts', 'общие/lib/slots.ts', 'общие/lib/availability.ts', 'общие/lib/rate-limit.ts', 'общие/lib/schemas.ts',
        'общие/lib/booking-actions.ts', 'общие/lib/booking-http.ts',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
