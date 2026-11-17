// app/[prefix]/[slug]/booking/my/[token]/page.tsx — «Моя запись» по токену,
// порт эталонного MyBooking.tsx без аккаунта клиента.
import { permanentRedirect, notFound } from 'next/navigation';
import { resolveBusiness } from '@/lib/business';
import { loadMyBooking } from '@/lib/booking-view';
import { NicheUtilityShell } from '@/шаблоны/_shared/NicheUtilityShell';
import { MyBookingCard } from '@/шаблоны/_shared/MyBookingCard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Моя запись', robots: { index: false, follow: false } };

type Params = { prefix: string; slug: string; token: string };

export default async function MyBookingPage({ params }: { params: Params }) {
  const r = await resolveBusiness(params.prefix, params.slug);
  if (r.kind === 'redirect') permanentRedirect(r.to);
  if (r.kind === 'notfound') notFound();

  const view = await loadMyBooking(params.token, params.slug);
  const base = `/${params.prefix}/${params.slug}`;

  return (
    <NicheUtilityShell name={r.business.name} prefix={params.prefix} slug={params.slug}>
      <MyBookingCard view={view} base={base} />
    </NicheUtilityShell>
  );
}
