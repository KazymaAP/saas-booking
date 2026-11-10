// tests/owner-roles.spec.ts — матрица ролей: видимость разделов и запрет мутаций.
import { expect, test } from '@playwright/test';
import { hasOwner, panelUrl, requireOwner } from './owner-helpers';
import { BUILTIN_ROLES, STAFF_ROLES } from '@/lib/auth-roles';
import { sectionsForRole, canWrite, SECTION_KEYS } from '@/lib/sections';

test.describe('роли сотрудников', () => {
  test('встроенных ролей 14, сотрудников 13', () => {
    expect(BUILTIN_ROLES).toHaveLength(14);
    expect(STAFF_ROLES).toHaveLength(13);
  });

  // Параметризованная проверка матрицы: ни одной роли вручную не перечисляем.
  for (const role of BUILTIN_ROLES) {
    test(`${role}: видит только разрешённые разделы`, () => {
      const keys = sectionsForRole(role);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of SECTION_KEYS) {
        if (!keys.includes(key)) expect(canWrite(role, key), `${role}/${key}`).toBe(false);
      }
    });
  }

  test.describe('живой кабинет', () => {
    test.beforeEach(requireOwner);

    test('receptionist не может записаться в services.write (403)', async ({ request }) => {
      test.skip(!hasOwner, 'Нет E2E_PANEL_PATH и данных владельца');
      const res = await request.post(panelUrl('services'), { data: { name: 'Тест' } });
      expect(res.status()).toBe(403);
    });
  });
});
