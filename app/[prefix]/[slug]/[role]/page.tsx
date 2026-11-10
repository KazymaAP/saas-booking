// app/[prefix]/[slug]/[role]/page.tsx — единый маршрут всех встроенных ролей сотрудников.
// Проверяет роль из URL по матрице прав и показывает только разрешённые разделы.
import { notFound, redirect } from 'next/navigation';
import { currentOwner } from '@/lib/owner-session';
import { isRole } from '@/lib/auth-roles';
import { sectionsForRole, SECTION_LABELS } from '@/lib/sections';
import { panelBase } from '../admin/(protected)/_lib/sections';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

type Params = { readonly prefix: string; readonly slug: string; readonly role: string };

export default async function StaffRolePage({ params }: { params: Params }) {
  if (!isRole(params.role) || params.role === 'owner') notFound();
  const access = await currentOwner(params.slug);
  if (!access) redirect(`${panelBase(params)}/login`);
  if (access.role !== params.role) notFound();

  const sections = sectionsForRole(params.role);
  return (
    <main className="mx-auto max-w-[900px] px-4 py-8">
      <h1 className="text-xl font-semibold">Кабинет сотрудника: {params.role}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Доступные разделы</p>
      <ul className="mt-4 grid gap-2">
        {sections.map((key) => (
          <li key={key} className="rounded-md border border-[var(--line)] px-3 py-2">
            <a className="text-[var(--brand-color)] underline" href={`${panelBase(params)}/${key === 'home' ? '' : key}`}>
              {SECTION_LABELS[key]}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
