// app/[prefix]/[slug]/admin/(protected)/staff/page.tsx — сотрудники на сайте (витрина, не доступы).
import { adminClient } from '@/lib/supabase';
import { canWriteSection, requireSectionAccess } from '../_lib/access';
import type { StaffRow } from './actions';
import { StaffManager } from './StaffManager';

export const dynamic = 'force-dynamic';

export default async function StaffPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requireSectionAccess(params, 'staff');
  const canEdit = await canWriteSection(access, 'staff');
  const { data, error } = await adminClient()
    .from('staff')
    .select('id, name, position, photo_url, experience_years, description, is_active, sort_order')
    .eq('business_id', access.business.id)
    .order('sort_order')
    .returns<StaffRow[]>();
  if (error) throw new Error('staff: load failed');

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="!mb-1">Сотрудники</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">
          Карточки команды на сайте: имя, должность, фото, стаж. Это витрина, а не доступы — права сотрудника
          на кабинет настраиваются в разделе «Команда».
        </p>
      </header>
      <StaffManager slug={params.slug} rows={data ?? []} canEdit={canEdit} />
    </div>
  );
}
