// app/sw.js/route.ts — service worker PWA (ТЗ §5.1: без Workbox).
// Тело и правила кэширования: lib/sw-source.ts и lib/sw-rules.ts (покрыты тестами).
// Кэшируются только публичные страницы; токенные, персональные и служебные маршруты не трогаются.
import { buildServiceWorker } from '@/lib/sw-source';

export const runtime = 'edge';

const SW = buildServiceWorker();

export function GET() {
  return new Response(SW, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
}
