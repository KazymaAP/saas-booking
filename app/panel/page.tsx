// app/panel/page.tsx — корень супер-админки: отправляем на воронку (ТЗ §55: /panel).
import { redirect } from 'next/navigation';

export default function PanelRoot() {
  redirect('/panel/funnel');
}
