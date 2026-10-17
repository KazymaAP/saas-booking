// vitest.config.ts — unit-тесты чистой логики зоны бронирования (lib/*.test.ts).
// E2E живут в tests/*.spec.ts и запускаются Playwright, поэтому здесь исключены.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // auth-тесты подключают lib/__test__/setup.ts сами (import первой строкой); глобально — нельзя.
    restoreMocks: true,
    include: ['lib/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests/**'],
    // Unit-тесты не ходят в сеть и БД: Supabase мокается в каждом тесте.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    },
    coverage: {
      provider: 'v8',
      include: [
        'lib/phone.ts', 'lib/slots.ts', 'lib/availability.ts', 'lib/rate-limit.ts', 'lib/schemas.ts',
        'lib/booking-actions.ts', 'lib/booking-http.ts',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
