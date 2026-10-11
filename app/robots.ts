// app/robots.ts — правила для поисковиков (ТЗ §3.4: прототипы закрыты).
import type { MetadataRoute } from 'next';

import { SITE_URL as BASE } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/preview/', '/panel', '/api/', '/booking/'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
