// app/[prefix]/[slug]/admin/(protected)/faq/page.tsx — частые вопросы на сайте.
import { adminClient } from '@/lib/supabase';
import { canWriteSection, requireSectionAccess } from '../_lib/access';
import type { FaqRow } from './actions';
import { FaqManager } from './FaqManager';

export const dynamic = 'force-dynamic';

export default async function FaqPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requireSectionAccess(params, 'faq');
  const canEdit = await canWriteSection(access, 'faq');
  const { data, error } = await adminClient()
    .from('faq_items')
    .select('id, question, answer, is_published, sort_order')
    .eq('business_id', access.business.id)
    .order('sort_order')
    .returns<FaqRow[]>();
  if (error) throw new Error('faq: load failed');

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="!mb-1">Вопросы</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">
          Блок «Частые вопросы» на сайте. Отвечайте на то, что чаще спрашивают по телефону: сроки, гарантия, запись без брони.
        </p>
      </header>
      <FaqManager slug={params.slug} rows={data ?? []} canEdit={canEdit} />
    </div>
  );
}
