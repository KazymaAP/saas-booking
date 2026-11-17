// app/partner/demo/page.tsx — вход в демо-кабинет партнёра.
// Никакой отдельной витрины: сразу открываем настоящий кабинет /partner с демо-сессией.
// «Демо» остаётся только в названии аккаунта (DEMO Партнёр) и бейдже.
// Демо выключено (нет DEMO_ENABLED=1) — отдаём 404 на странице, а не редиректим в JSON-ошибку API.
import { notFound, redirect } from 'next/navigation';
import { demoEnabled } from '@/lib/demo-gate';

export const dynamic = 'force-dynamic';

export default function PartnerDemoPage() {
  if (!demoEnabled()) notFound();
  redirect('/api/demo/partner');
}
