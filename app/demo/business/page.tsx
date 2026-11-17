// app/demo/business/page.tsx — вход в демо-кабинет предпринимателя.
// Никакой отдельной витрины: сразу открываем настоящую панель /m/demo/admin с демо-сессией.
// «Демо» остаётся только в названии бизнеса (DEMO — Студия маникюра) и бейдже.
// Демо выключено (нет DEMO_ENABLED=1) — отдаём 404 на странице, а не редиректим в JSON-ошибку API.
import { notFound, redirect } from 'next/navigation';
import { demoEnabled } from '@/lib/demo-gate';

export const dynamic = 'force-dynamic';

export default function BusinessDemoPage() {
  if (!demoEnabled()) notFound();
  redirect('/api/demo/owner');
}
