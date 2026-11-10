// общие/lib/custom-roles.ts — серверное разрешение ролей в матрицу доступа (шаг 5).
// Чистые помощники (isCustomRole, customRoleId, parseMatrix, CUSTOM_ROLE_PREFIX) живут в sections.ts,
// чтобы их можно было использовать и на клиенте; здесь — только обращение к БД через service role.
import { adminClient } from './supabase';
import { customRoleId, parseMatrix, ROLE_MATRIX, type RoleMatrix } from './sections';
import { isRole, type Role } from './auth-roles';

// Разрешает строку роли в матрицу доступа.
//  - встроенная роль — из ROLE_MATRIX;
//  - кастомная ('custom:<uuid>') — из business_custom_roles (должна принадлежать бизнесу);
//  - всё прочее — null (доступ запрещён: неизвестная/удалённая роль не даёт ни одного раздела).
export async function resolveMatrix(role: string, businessId: string): Promise<RoleMatrix | null> {
  if (!role) return null;
  if (isRole(role)) return ROLE_MATRIX[role as Role];
  const id = customRoleId(role);
  if (!id) return null;
  const { data, error } = await adminClient()
    .from('business_custom_roles')
    .select('matrix')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle<{ matrix: unknown }>();
  if (error || !data) return null;
  return parseMatrix(data.matrix);
}
