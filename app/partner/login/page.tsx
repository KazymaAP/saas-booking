// app/partner/login/page.tsx — старый адрес входа партнёра.
// Теперь единая страница входа/регистрации: /auth (партнёр или предприниматель).
import { redirect } from 'next/navigation';
import { redirectHref } from '@/lib/copy-mode';

export const dynamic = 'force-dynamic';

export default function PartnerLoginPage() {
  redirect(redirectHref('/auth'));
}
