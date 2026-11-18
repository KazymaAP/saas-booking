// app/[prefix]/[slug]/admin/(protected)/reviews/page.tsx — отзывы клиентов.
// Серверный: один запрос списка. Правка — роли с правом write на раздел (владелец, менеджер, контент).
import { adminClient } from '@/lib/supabase';
import { canWriteSection, requireSectionAccess } from '../_lib/access';
import type { ReviewRow } from './actions';
import { ReviewsManager } from './ReviewsManager';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requireSectionAccess(params, 'reviews');
  const canEdit = await canWriteSection(access, 'reviews');
  const { data, error } = await adminClient()
    .from('reviews')
    .select('id, author_name, rating, body, service_name, source, is_published, sort_order')
    .eq('business_id', access.business.id)
    .order('sort_order')
    .order('created_at', { ascending: false })
    .returns<ReviewRow[]>();
  if (error) throw new Error('reviews: load failed');

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="!mb-1">Отзывы</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">
          Блок «Отзывы» на сайте показывается, только если есть хотя бы один опубликованный отзыв. Средняя оценка считается по ним.
        </p>
      </header>
      <ReviewsManager slug={params.slug} rows={data ?? []} canEdit={canEdit} />
    </div>
  );
}
