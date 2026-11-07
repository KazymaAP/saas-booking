// app/demo/business/page.tsx — вход в демо-кабинет предпринимателя.
// Никакой отдельной витрины: сразу открываем настоящую панель /m/demo/panel с демо-сессией.
// «Демо» остаётся только в названии бизнеса (DEMO — Студия маникюра) и бейдже.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function BusinessDemoPage() {
  redirect('/api/demo/owner');
}
