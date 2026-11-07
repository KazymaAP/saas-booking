// app/[prefix]/[slug]/page.tsx — публичный сайт бизнеса (ТЗ §5.1, §3.3, §3.4).
import { permanentRedirect, notFound } from 'next/navigation';
import type { Metadata, Viewport } from 'next';
import { resolveBusiness, activeServices } from '@/lib/business';
import { jsonLdSafe } from '@/lib/json-ld';
import { adminClient } from '@/lib/supabase';
import { BookingForm } from './BookingForm';
import { SwRegister } from './SwRegister';
import { StudioTemplate } from '@/components/templates/StudioTemplate';
import { NicheSite } from '@/шаблоны/_shared/NicheSite';
import { buildNicheTenant } from '@/шаблоны/_shared/niche-tenant';
import { getNicheTheme, getNicheThemeBySlug } from '@/шаблоны/_shared/themes';
import { SITE_THEME_KEY, appearanceByKey } from '@/lib/appearance';

export const revalidate = 3600; // кэш сайта клиента на 1 час: слоты брони всё равно живые (клиентский API),
// а HTML/услуги/фото меняются редко — реже запросы в базу и быстрее ответ на cache-hit.
// Подогрев БД (cron /api/cron/warmup) держит Supabase в тепле, поэтому cache-miss тоже быстрый.

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
  };
}

// Next 14: themeColor живёт в viewport, а не в metadata — иначе цвет панели браузера
// на мобильном не применяется, а в консоли висит предупреждение. resolveBusiness кеширован,
// поэтому второй вызов внутри одного рендера не добавляет запроса к БД.
export async function generateViewport({ params }: { params: { prefix: string; slug: string } }): Promise<Viewport> {
  const r = await resolveBusiness(params.prefix, params.slug);
  return r.kind === 'found' && r.business.brand_color
    ? { themeColor: r.business.brand_color }
    : { themeColor: '#ffffff' };
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
  // Ниша определяется по url-префиксу (или slug шаблона). Совпадение → отрисовываем
  // готовый нишевой сайт через общий движок; иначе — универсальный StudioTemplate.
  const baseTheme = getNicheTheme(params.prefix) ?? (r.template?.slug ? getNicheThemeBySlug(r.template.slug) : null);
  // Владелец может отдельно сменить стиль сайта (независимо от стиля кабинета).
  // Наложение палитры на тему ниши: раскладка и тексты остаются свои, меняются цвета и режим.
  const styleOverride = appearanceByKey(texts[SITE_THEME_KEY]);
  const theme = baseTheme && styleOverride
    ? {
        ...baseTheme,
        mode: styleOverride.mode,
        bg: styleOverride.bg,
        surface: styleOverride.surface,
        border: styleOverride.line,
        borderHover: styleOverride.line,
        text: styleOverride.ink,
        textMuted: styleOverride.muted,
        textSubtle: styleOverride.muted,
        accent: business.brand_color || styleOverride.accent,
      }
    : baseTheme;

  const jsonLd = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdSafe({
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
  );

  return (
    <>
      {theme ? (
        <NicheSite
          tenant={buildNicheTenant(business, services, photos ?? [], texts, theme)}
          prefix={params.prefix}
          slug={params.slug}
        />
      ) : (
        <StudioTemplate
          business={business}
          services={services}
          photos={photos ?? []}
          title={texts.hero_title || business.name}
          subtitle={texts.hero_subtitle || business.description || undefined}
          about={texts.about || undefined}
          texts={texts}
          appearance={styleOverride}
          bookingForm={<BookingForm prefix={params.prefix} slug={params.slug} services={services.map((s) => ({ id: s.id, name: s.name }))} />}
        />
      )}
      {jsonLd}
      <SwRegister />
    </>
  );
}
