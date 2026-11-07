// lib/__test__/setup.ts — подмены для auth-тестов (lib/auth*.test.ts).
// Подключается ПЕРВОЙ строкой в тесте: import './__test__/setup';
// Не глобальный setupFiles: иначе подмены ломают тесты, которым нужны реальные audit/log/notify/rate-limit.
// Подмены частичные: реальные экспорты модуля сохраняются, переопределяются только нужные функции.
import { vi } from 'vitest';

vi.mock('next/headers', async () => {
  const h = await import('./harness');
  return { cookies: () => h.cookiesMock, headers: () => h.headersMock };
});

vi.mock('../rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rate-limit')>();
  const h = await import('./harness');
  return { ...actual, hitRateLimit: h.fakeHitRateLimit };
});

vi.mock('../audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audit')>();
  const h = await import('./harness');
  return { ...actual, audit: h.fakeAudit };
});

vi.mock('../supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase')>();
  const h = await import('./harness');
  return { ...actual, adminClient: () => h.fakeDb };
});

vi.mock('../notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../notify')>();
  const h = await import('./harness');
  return { ...actual, sendMail: h.fakeSendMail };
});

vi.mock('../log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../log')>();
  return { ...actual, logError: vi.fn(async () => undefined) };
});

vi.mock('../auth-provider', () => ({
  passwordSignIn: vi.fn(),
  refreshTokens: vi.fn(),
  verifyAccessToken: vi.fn(),
  sessionWithoutPassword: vi.fn(),
  setUserPassword: vi.fn(),
  createUserWithPassword: vi.fn(),
  revokeAllSessions: vi.fn(),
  revokeSession: vi.fn(),
}));
