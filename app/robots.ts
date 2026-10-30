// app/robots.ts — правила для поисковиков (ТЗ §3.4: прототипы закрыты).
import type { MetadataRoute } from 'next';

import { SITE_URL as BASE } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /unsubscribe/ — персональные токены отписки не должны попадать в индекс (страница ещё и noindex).
        disallow: ['/preview/', '/panel', '/api/', '/booking/', '/unsubscribe/'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
