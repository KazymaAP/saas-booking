// lib/__test__/helpers.ts — общие помощники unit-тестов auth: сессия провайдера, токен из письма, сброс подмен.
import { vi } from 'vitest';
import * as harness from './harness';
import * as provider from '../auth-provider';

export type TestSession = { user: { id: string; email: string }; tokens: { accessToken: string; refreshToken: string } };

export function sessionFor(email: string, id = 'user-1'): TestSession {
  return { user: { id, email }, tokens: { accessToken: `access-${id}`, refreshToken: `refresh-${id}` } };
}

const UUID_V4_IN_TEXT = /([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/;

// Токен из последнего письма: в БД его нет (там только дайджест), поэтому тесты, как и пользователь, берут его из письма.
export function tokenFromLastMail(): string {
  const text = harness.sentMails.at(-1)?.text ?? '';
  const m = UUID_V4_IN_TEXT.exec(text);
  if (!m?.[1]) throw new Error('в письме нет токена');
  return m[1];
}

// Чистое состояние перед каждым тестом: cookie, заголовки, таблицы, письма, моки провайдера.
export function resetAll(): void {
  harness.resetHarness();
  harness.tables.clear();
  harness.sentMails.length = 0;
  for (const fn of Object.values(provider)) {
    if (vi.isMockFunction(fn)) fn.mockReset();
  }
  process.env.SUPERADMIN_EMAILS = 'Boss@Example.com, second@example.com ,not-an-email';
}
