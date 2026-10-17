// app/[prefix]/[slug]/panel/(protected)/photos/page.tsx — фото работ (ТЗ §4.8, §5.3, §45).
// Серверный: один запрос списка. Владелец загружает и удаляет, менеджер — только просмотр.
import { adminClient } from '@/lib/supabase';
import { isOwner, requirePageAccess } from '../_lib/access';
import { OnboardingTip } from '../_components/OnboardingTip';
import type { PhotoRow } from './actions';
import { PhotoGallery } from './PhotoGallery';
import { MAX_PHOTOS } from './rules';

export const dynamic = 'force-dynamic';

export default async function PhotosPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requirePageAccess(params);
  const { data, error } = await adminClient()
    .from('photos')
    .select('id, url, alt')
    .eq('business_id', access.business.id)
    .order('sort_order')
    .limit(MAX_PHOTOS)
    .returns<PhotoRow[]>();
  if (error) throw new Error('photos: load failed'); // → error.tsx с кнопкой повтора

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="!mb-1">Фото работ</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">Фото показываются в галерее на сайте в том же порядке.</p>
      </header>
      {isOwner(access) && (
        <OnboardingTip slug={params.slug} tip="photos" title="Подпись обязательна">
          Коротко опишите, что на фото («Маникюр с дизайном»): подпись читают незрячие посетители и поисковики.
        </OnboardingTip>
      )}
      <PhotoGallery slug={params.slug} rows={data ?? []} canEdit={isOwner(access)} />
    </div>
  );
}
