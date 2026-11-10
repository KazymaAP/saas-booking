// общие/lib/custom-roles.test.ts — разрешение встроенных и кастомных ролей в матрицу доступа (шаг 5).
import { describe, expect, it, vi } from 'vitest';

// Мок adminClient: возвращает сохранённую строку business_custom_roles. Реальный клиент не нужен.
type MockRow = { data: { matrix: unknown } | null; error: unknown };
const state = vi.hoisted<{ row: MockRow }>(() => ({
  row: { data: { matrix: { bookings: 'write', services: 'read', unknown_section: 'read' } }, error: null },
}));

vi.mock('./supabase', async (importActual) => {
  const actual = await importActual<typeof import('./supabase')>();
  return {
    ...actual,
    adminClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => state.row,
            }),
          }),
        }),
      }),
    }),
  };
});

import { resolveMatrix } from './custom-roles';
import {
  isCustomRole, customRoleId, parseMatrix, canReadMatrix, canWriteMatrix, sectionsForMatrix,
  ROLE_MATRIX, type RoleMatrix,
} from './sections';

describe('кастомные роли: чистые помощники', () => {
  it('isCustomRole / customRoleId распознают формат custom:<uuid>', () => {
    const id = '12345678-1234-1234-1234-1234567890ab';
    expect(isCustomRole(`custom:${id}`)).toBe(true);
    expect(customRoleId(`custom:${id}`)).toBe(id);
    expect(isCustomRole('manager')).toBe(false);
    expect(isCustomRole('custom:not-a-uuid')).toBe(false);
    expect(isCustomRole('custom:')).toBe(false);
    expect(customRoleId('manager')).toBe(null);
  });

  it('parseMatrix отбрасывает неизвестные разделы и недопустимые права', () => {
    const m = parseMatrix({ bookings: 'write', bogus: 'read', services: 'weird' });
    expect(m).toEqual({ bookings: 'write' });
  });

  it('матричные хелперы эквивалентны встроенным', () => {
    const matrix: RoleMatrix = { bookings: 'write', services: 'read' };
    expect(canReadMatrix(matrix, 'bookings')).toBe(true);
    expect(canWriteMatrix(matrix, 'bookings')).toBe(true);
    expect(canReadMatrix(matrix, 'services')).toBe(true);
    expect(canWriteMatrix(matrix, 'services')).toBe(false);
    expect(canReadMatrix(matrix, 'photos')).toBe(false);
    expect(sectionsForMatrix(matrix)).toEqual(['bookings', 'services']);
  });
});

describe('resolveMatrix', () => {
  it('встроенная роль — из ROLE_MATRIX, без обращения к БД', async () => {
    const m = await resolveMatrix('manager', 'biz-1');
    expect(m).toEqual(ROLE_MATRIX.manager);
  });

  it('кастомная роль — из БД, неизвестные разделы отфильтрованы', async () => {
    const m = await resolveMatrix('custom:12345678-1234-1234-1234-1234567890ab', 'biz-1');
    expect(m).toBeTruthy();
    expect(m?.bookings).toBe('write');
    expect(m?.services).toBe('read');
    expect(sectionsForMatrix(m ?? {})).toEqual(['bookings', 'services']);
  });

  it('удалённая/чужая кастомная роль — null (доступ запрещён)', async () => {
    state.row = { data: null, error: null };
    const m = await resolveMatrix('custom:12345678-1234-1234-1234-1234567890ab', 'biz-1');
    expect(m).toBeNull();
    state.row = { data: { matrix: { bookings: 'write' } }, error: null };
  });

  it('неизвестная строка роли — null', async () => {
    expect(await resolveMatrix('ghost', 'biz-1')).toBeNull();
  });
});
