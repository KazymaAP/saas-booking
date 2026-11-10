// team/schema.test.ts — схема приглашения принимает встроенные и кастомные роли (шаг 5).
import { describe, expect, it } from 'vitest';
import { InviteSchema } from './schema';

describe('InviteSchema: роль', () => {
  const base = { email: 'a@b.com' };
  const custom = 'custom:12345678-1234-1234-1234-1234567890ab';

  it('принимает встроенную роль', () => {
    expect(InviteSchema.safeParse({ ...base, role: 'manager' }).success).toBe(true);
    expect(InviteSchema.safeParse({ ...base, role: 'receptionist' }).success).toBe(true);
  });

  it('принимает кастомную роль custom:<uuid>', () => {
    expect(InviteSchema.safeParse({ ...base, role: custom }).success).toBe(true);
  });

  it('отвергает неизвестную/некорректную роль', () => {
    expect(InviteSchema.safeParse({ ...base, role: 'ghost' }).success).toBe(false);
    expect(InviteSchema.safeParse({ ...base, role: 'custom:not-uuid' }).success).toBe(false);
  });

  it('роль по умолчанию — manager', () => {
    expect(InviteSchema.parse(base).role).toBe('manager');
  });

  it('требует корректный email', () => {
    expect(InviteSchema.safeParse({ email: 'bad', role: 'manager' }).success).toBe(false);
  });
});
