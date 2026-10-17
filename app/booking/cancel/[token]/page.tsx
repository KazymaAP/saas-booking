// app/booking/cancel/[token]/page.tsx — короткий адрес из письма (ТЗ §10.4). Переводит на страницу на сайте бизнеса,
// где показаны брендинг и детали записи. Неверный или чужой токен → 404 без подсказок о формате.
import { notFound, redirect } from 'next/navigation';
import { bookingSitePath } from '@/lib/booking-view';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function CancelShortPage({ params }: { params: { token: string } }) {
  const path = await bookingSitePath(params.token, 'cancel');
  if (path === null) notFound();
  redirect(path);
}
