'use client';
// components/CookieBannerLazy.tsx — ленивое подключение CookieBanner: код баннера грузится отдельным чанком после
// гидрации и не участвует в SSR, поэтому не влияет на LCP. 'use client' обязателен для dynamic(..., { ssr: false }).
import dynamic from 'next/dynamic';

export const CookieBannerLazy = dynamic(
  () => import('./CookieBanner').then((module) => module.CookieBanner),
  { ssr: false, loading: () => null },
);
