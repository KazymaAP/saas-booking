// app/dev/super-admin/page.tsx — точка входа в студию супер-админа для локальной отладки.
// Доступ только супер-админу (та же проверка, что и в /admin), чтобы страница не стала обходом авторизации.
import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin-session';
import { SuperAdmin } from '@/главная/SuperAdmin';

export const dynamic = 'force-dynamic';

export default async function DevSuperAdminPage() {
  if (!(await isSuperAdmin())) redirect('/panel/login');
  return <SuperAdmin />;
}
