'use client';
// общие/components/CookieBannerGate.tsx — баннер cookie везде, кроме публичных сайтов ниш.
// Эталонный детальный сайт (D:\Clode\Детейленг) не показывает согласие поверх витрины:
// чтобы получить «в точь в точь», убираем глобальный баннер только на маршрутах
// /{префикс ниши}/{slug}. На главной, в админке и на /privacy баннер остаётся.
import { usePathname } from 'next/navigation';
import { CookieBannerLazy } from './CookieBannerLazy';

const NICHE_PREFIXES: ReadonlySet<string> = new Set([
  't', 'd', 'm', 'sa', 'b', 'av', 'p', 'r', 'c', 'st', 'v',
]);

export function CookieBannerGate(): React.JSX.Element | null {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 2 && NICHE_PREFIXES.has(parts[0] ?? '')) return null;
  return <CookieBannerLazy />;
}
