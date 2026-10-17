// app/domain-site/by-domain/[[...rest]]/page.tsx — главная сайта клиента на кастомном домене (ТЗ §3.2, §40).
// В промте путь app/_site/...: папки с «_» в Next приватные и не маршрутизируются, поэтому domain-site.
// middleware переписывает сюда только «/» без cookie domain_map (боты, первый визит). Подпути обслуживает
// middleware по подписанной cookie. Рендерится тот же BusinessPage, что и на /{prefix}/{slug}: логика не дублируется.
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { adminClient } from '@/lib/supabase';
import { normalizeHost } from '@/lib/site';
import { findBusinessByDomain } from '@/lib/custom-domain';
import BusinessPage, { generateMetadata as businessMetadata } from '@/app/[prefix]/[slug]/page';

export const dynamic = 'force-dynamic';

type Props = { params: { rest?: string[] }; searchParams: { domain?: string } };
type Target = { prefix: string; slug: string };

// Бизнес по домену (общий запрос с resolve-domain) и legacy-редирект (§53) — параллельно.
async function resolveTarget(domain: string): Promise<Target> {
  const [{ data: legacy }, business] = await Promise.all([
    adminClient().from('legacy_redirects').select('to_url').eq('from_domain', domain).maybeSingle<{ to_url: string }>(),
    findBusinessByDomain(domain),
  ]);
  if (legacy?.to_url) permanentRedirect(legacy.to_url);
  if (!business || business.status !== 'client') notFound();
  return { prefix: business.prefix, slug: business.slug };
}

function domainOf(props: Props): string {
  // Подпути сюда не попадают (см. middleware); прямой заход с подпутём — 404, а не подмена главной.
  if (props.params.rest?.length) notFound();
  const domain = normalizeHost(props.searchParams.domain);
  if (!domain) notFound();
  return domain;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const domain = domainOf(props);
  const target = await resolveTarget(domain);
  const meta = await businessMetadata({ params: target });
  // Канонический адрес — кастомный домен: основной адрес /{prefix}/{slug} не конкурирует в поиске.
  return { ...meta, alternates: { canonical: `https://${domain}/` } };
}

export default async function CustomDomainPage(props: Props) {
  const target = await resolveTarget(domainOf(props));
  return BusinessPage({ params: target });
}
