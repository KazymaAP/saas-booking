// app/panel/page.tsx — корень админки: ведём в новую студию /admin.
// Старые страницы /panel/funnel, /panel/businesses и т.д. остаются доступны напрямую.
import { redirect } from 'next/navigation';

export default function PanelRoot() {
  redirect('/admin');
}
