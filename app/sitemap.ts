// app/sitemap.ts — карта сайта (ТЗ §0.3, §5.1). Только бизнесы со status='client'.
import type { MetadataRoute } from 'next';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

import { LEGAL_DOCS } from '@/lib/legal';
import { requestOrigin } from '@/lib/request-origin';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Хост берём из запроса, а не из NEXT_PUBLIC_SITE_URL: env указывает на apex, который
  // 308-редиректит на www, и все 100 адресов карты оказывались редиректами — поисковик
  // тратил краулинговый бюджет впустую (подробности в lib/request-origin.ts).
  const BASE = requestOrigin();

  const { data } = await adminClient()
    .from('businesses')
    .select('slug, created_at, vertical_templates(url_prefix)')
    .eq('status', 'client')
    // Приостановленная подписка отдаёт заглушку (404 для сайта) — такие адреса в карту не кладём.
    .eq('subscription_active', true);

  const sites = (data ?? []).map((b: any) => ({
    url: `${BASE}/${b.vertical_templates?.url_prefix ?? 'x'}/${b.slug}`,
    lastModified: new Date(b.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    { url: BASE, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    // Юрдокументы: lastModified = дата редакции, а не «сейчас» — поисковик видит реальные изменения текста.
    ...Object.values(LEGAL_DOCS).map((doc) => ({
      url: `${BASE}${doc.path}`, lastModified: new Date(doc.version), changeFrequency: 'yearly' as const, priority: 0.3,
    })),
    ...sites,
  ];
}
