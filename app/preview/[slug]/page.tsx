// app/preview/[slug]/page.tsx — прототип для просмотра по токену (ТЗ §3.4, §48).
// Без правильного токена — 404. Всегда noindex. Бронирование в прототипе отключено.
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { adminClient } from '@/lib/supabase';
import { activeServices } from '@/lib/business';
import { StudioTemplate } from '@/components/templates/StudioTemplate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? '';
  const db = adminClient();
  const { data: business } = await db.from('businesses').select('*').eq('slug', params.slug).maybeSingle();

  if (!business || !token || business.preview_token !== token || business.status === 'client') {
    notFound();
  }

  const [services, { data: photos }] = await Promise.all([
    activeServices(business.id),
    db.from('photos').select('url, alt').eq('business_id', business.id).order('sort_order'),
  ]);
  const texts = (business.custom_texts ?? {}) as Record<string, string>;

  return (
    <StudioTemplate
      business={business}
      services={services}
      photos={photos ?? []}
      title={texts.hero_title || business.name}
      subtitle={texts.hero_subtitle || business.description || undefined}
      about={texts.about || undefined}
      texts={texts}
      preview
    />
  );
}
