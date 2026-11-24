// app/[prefix]/[slug]/booking/my/[token]/page.tsx — «Моя запись» по токену,
// порт эталонного MyBooking.tsx без аккаунта клиента.
import { permanentRedirect, notFound } from 'next/navigation';
import { resolveBusiness } from '@/lib/business';
import { loadMyBooking } from '@/lib/booking-view';
import { NicheUtilityShell } from '@/шаблоны/_shared/NicheUtilityShell';
import { MyBookingCard } from '@/шаблоны/_shared/MyBookingCard';
import { resolveSiteTheme } from '@/шаблоны/_shared/theme-for';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Моя запись', robots: { index: false, follow: false } };

type Params = { prefix: string; slug: string; token: string };

export default async function MyBookingPage({ params }: { params: Params }) {
  const r = await resolveBusiness(params.prefix, params.slug);
  // Редирект на канонический префикс должен сохранить путь: r.to — это только /{prefix}/{slug},
  // и без хвоста клиент по ссылке из письма попадал на главную сайта, теряя свою запись.
  if (r.kind === 'redirect') permanentRedirect(`${r.to}/booking/my/${params.token}`);
  if (r.kind === 'notfound') notFound();

  const view = await loadMyBooking(params.token, params.slug);
  const base = `/${params.prefix}/${params.slug}`;
  // Та же тема, что у витрины: акцент бизнеса, светлый/тёмный режим и глиф ниши.
  const theme = resolveSiteTheme({
    prefix: params.prefix,
    templateSlug: r.template?.slug,
    texts: (r.business.custom_texts ?? {}) as Record<string, string>,
    brandColor: r.business.brand_color,
  });

  return (
    <NicheUtilityShell
      name={r.business.name}
      prefix={params.prefix}
      slug={params.slug}
      theme={theme}
      logo={r.business.logo_url}
    >
      <MyBookingCard view={view} base={base} />
    </NicheUtilityShell>
  );
}
