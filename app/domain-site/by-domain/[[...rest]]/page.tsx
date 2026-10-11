// app/_site/by-domain/[[...rest]]/page.tsx — сайт клиента на кастомном домене (ТЗ §3.3 п.1, §40).
// middleware переписывает запрос сюда с параметром domain. Дальше рендерится тот же сайт, что и на /{prefix}/{slug}.
import { notFound, permanentRedirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase';
import BusinessPage from '@/app/[prefix]/[slug]/page';

export const dynamic = 'force-dynamic';

export default async function CustomDomainPage({ searchParams }: { searchParams: { domain?: string } }) {
  const domain = (searchParams.domain ?? '').toLowerCase().replace(/:\d+$/, '');
  if (!domain) notFound();
  // §53: старый домен legacy-клиента → новый адрес (301)
  const { data: legacy } = await adminClient().from('legacy_redirects').select('to_url').eq('from_domain', domain).maybeSingle();
  if (legacy?.to_url) permanentRedirect(legacy.to_url);

  const db = adminClient();
  const { data: business } = await db
    .from('businesses').select('slug, status, vertical_template_id').eq('custom_domain', domain).maybeSingle();
  if (!business || business.status !== 'client') notFound();

  const { data: template } = await db
    .from('vertical_templates').select('url_prefix').eq('id', business.vertical_template_id).maybeSingle();
  if (!template) notFound();

  // Рендерим тот же сайт; prefix и slug берём из БД, а не из адреса.
  return BusinessPage({ params: { prefix: template.url_prefix, slug: business.slug } });
}
