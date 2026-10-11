// app/sitemap.ts — карта сайта (ТЗ §0.3, §5.1). Только бизнесы со status='client'.
import type { MetadataRoute } from 'next';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

import { SITE_URL as BASE } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await adminClient()
    .from('businesses')
    .select('slug, created_at, vertical_templates(url_prefix)')
    .eq('status', 'client');

  const sites = (data ?? []).map((b: any) => ({
    url: `${BASE}/${b.vertical_templates?.url_prefix ?? 'x'}/${b.slug}`,
    lastModified: new Date(b.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    { url: BASE, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE}/oferta`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    ...sites,
  ];
}
