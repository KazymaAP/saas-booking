import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { isSuperAdmin } from '@/lib/admin-session';
import { GeraTable } from './GeraTable';

export const metadata: Metadata = {
  title: 'GERA — база сервисов',
  description: 'Внутренняя таблица организаций для рассылки.',
  robots: { index: false, follow: false },
};

// Внутренний инструмент: база лидов с телефонами. Без сессии супер-админа страница
// не рендерится — раньше она отдавалась всем (данные при этом тянулись из открытого JSON).
export const dynamic = 'force-dynamic';

export default async function GeraPage() {
  if (!(await isSuperAdmin())) redirect('/admin/login');
  return <GeraTable />;
}
