// app/panel/(protected)/loading.tsx — скелетон списков супер-админки (ТЗ §13.12).
// Показывается при переходе между разделами, пока сервер готовит страницу.
// Задержка 300 мс (CSS) — короткие переходы не мигают скелетоном (промт: «скелетон только если > 300мс»).
import { Skeleton } from '@/главная/components/Skeleton';

export default function PanelLoading() {
  return <Skeleton rows={8} />;
}
