// app/admin/page.tsx — супер-админ-студия (SuperAdmin.tsx) с реальными разделами:
// шаблоны (просмотр), готовые сервисы (загрузка/генерация/одобрение), партнёры.
// Доступ только супер-админу; вход — /panel/login.
import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin-session';
import { SuperAdmin } from '@/главная/SuperAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminStudioPage() {
  if (!(await isSuperAdmin())) redirect('/panel/login');
  return <SuperAdmin />;
}
