'use client';
// общие/components/CookieBannerGate.tsx — баннер cookie везде, кроме публичных сайтов ниш.
// Эталонный детальный сайт (D:\Clode\Детейленг) не показывает согласие поверх витрины:
// чтобы получить «в точь в точь», убираем глобальный баннер на маршрутах
// /{префикс ниши}/{slug} и их служебных страницах (/booking/... — «Моя запись»).
// На главной, в админке и на /privacy баннер остаётся.
import { usePathname } from 'next/navigation';
import { CookieBannerLazy } from './CookieBannerLazy';

const NICHE_PREFIXES: ReadonlySet<string> = new Set([
  't', 'd', 'm', 'sa', 'b', 'av', 'p', 'r', 'c', 'st', 'v',
]);

export function CookieBannerGate(): React.JSX.Element | null {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  // Внутренняя рабочая таблица GERA — без баннера, он перекрывает нижние строки.
  if (parts[0] === 'GERA') return null;
  if (parts.length === 2 && NICHE_PREFIXES.has(parts[0] ?? '')) return null;
  // Служебные страницы витрины: /{prefix}/{slug}/booking/... — тоже без баннера.
  if (parts.length >= 4 && NICHE_PREFIXES.has(parts[0] ?? '') && parts[2] === 'booking') return null;
  return <CookieBannerLazy />;
}
