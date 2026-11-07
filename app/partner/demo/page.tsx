// app/partner/demo/page.tsx — вход в демо-кабинет партнёра.
// Никакой отдельной витрины: сразу открываем настоящий кабинет /partner с демо-сессией.
// «Демо» остаётся только в названии аккаунта (DEMO Партнёр) и бейдже.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PartnerDemoPage() {
  redirect('/api/demo/partner');
}
