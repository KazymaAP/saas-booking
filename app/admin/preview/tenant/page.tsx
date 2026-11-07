// app/admin/preview/tenant/page.tsx — предпросмотр кабинета предпринимателя для супер-админа.
// Доступ только супер-админу; сама разметка — в TenantPreview (read-only, без server actions).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/admin-session';
import { TenantPreview } from './TenantPreview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TenantPreviewPage() {
  if (!(await isSuperAdmin())) redirect('/panel/login');
  return <TenantPreview />;
}
