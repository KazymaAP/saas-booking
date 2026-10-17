// app/[prefix]/[slug]/panel/(protected)/services/page.tsx — услуги бизнеса (ТЗ §4.7, §5.3, §13.10).
// Серверный: один запрос списка. Владелец редактирует, менеджер — только просмотр.
import { adminClient } from '@/lib/supabase';
import { isOwner, requirePageAccess } from '../_lib/access';
import { OnboardingTip } from '../_components/OnboardingTip';
import type { ServiceRow } from './schema';
import { ServiceList } from './ServiceList';

export const dynamic = 'force-dynamic';

export default async function ServicesPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requirePageAccess(params);
  const { data, error } = await adminClient()
    .from('services')
    .select('id, name, description, price, duration_minutes, is_active')
    .eq('business_id', access.business.id)
    .order('sort_order')
    .order('name')
    .returns<ServiceRow[]>();
  if (error) throw new Error('services: load failed'); // → error.tsx с кнопкой повтора

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="!mb-1">Услуги</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">Название, цена и длительность видны клиентам при записи.</p>
      </header>
      {isOwner(access) && (
        <OnboardingTip slug={params.slug} tip="services" title="Скрыть, а не удалить">
          Услугу можно скрыть с сайта и вернуть позже — прошлые записи на неё сохранятся.
        </OnboardingTip>
      )}
      {/* price в БД numeric: Supabase может вернуть строку — приводим к числу на сервере. */}
      <ServiceList
        slug={params.slug}
        canEdit={isOwner(access)}
        rows={(data ?? []).map((s) => ({ ...s, price: Number(s.price) || 0 }))}
      />
    </div>
  );
}
