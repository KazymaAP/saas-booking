// app/[prefix]/[slug]/page.tsx — публичный сайт бизнеса (ТЗ §5.1, §3.3, §3.4).
import { permanentRedirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveBusiness, activeServices } from '@/lib/business';
import { adminClient } from '@/lib/supabase';
import { BookingForm } from './BookingForm';
import { SwRegister } from './SwRegister';
import { StudioTemplate } from '@/components/templates/StudioTemplate';

export const revalidate = 60; // кэш сайта клиента на 60 секунд, быстрее ответ без похода в базу

// PWA: манифест и заголовок страницы (ТЗ §5.1, §5.1 SEO).
export async function generateMetadata({ params }: { params: { prefix: string; slug: string } }): Promise<Metadata> {
  const r = await resolveBusiness(params.prefix, params.slug);
  if (r.kind !== 'found') return { robots: { index: false, follow: false } };
  const b = r.business;
  return {
    title: b.name,
    description: b.description ?? undefined,
    manifest: `/${params.prefix}/${params.slug}/manifest.webmanifest`,
    openGraph: { title: b.name, description: b.description ?? undefined, type: 'website' },
    themeColor: b.brand_color,
  };
}

export default async function BusinessPage({ params }: { params: { prefix: string; slug: string } }) {
  const r = await resolveBusiness(params.prefix, params.slug);
  if (r.kind === 'redirect') permanentRedirect(r.to); // 308 Permanent (Next 14), ближе всего к 301 из ТЗ §3.3
  if (r.kind === 'notfound') notFound();

  const { business } = r;
  const [services, { data: photos }] = await Promise.all([
    activeServices(business.id),
    adminClient().from('photos').select('url, alt').eq('business_id', business.id).order('sort_order'),
  ]);
  const texts = (business.custom_texts ?? {}) as Record<string, string>;

  return (
    <>
      <StudioTemplate
        business={business}
        services={services}
        photos={photos ?? []}
        title={texts.hero_title || business.name}
        subtitle={texts.hero_subtitle || business.description || undefined}
        about={texts.about || undefined}
        texts={texts}
        bookingForm={<BookingForm prefix={params.prefix} slug={params.slug} services={services.map((s) => ({ id: s.id, name: s.name }))} />}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: business.name,
            description: business.description ?? undefined,
            telephone: business.phones?.[0] ?? undefined,
            address: business.address ? { '@type': 'PostalAddress', streetAddress: business.address, addressLocality: business.city ?? undefined } : undefined,
            aggregateRating: business.rating ? { '@type': 'AggregateRating', ratingValue: business.rating, reviewCount: business.reviews_count ?? 0 } : undefined,
            image: business.logo_url ?? undefined,
          }),
        }}
      />
      <SwRegister />
    </>
  );
}
