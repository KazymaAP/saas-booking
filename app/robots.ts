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
        // /admin и /dev — служебные экраны (раньше админка была на /admin, и правило устарело:
        // /admin и предпросмотры шаблонов оставались открытыми для обхода).
        // /GERA — внутренняя база лидов, доступна только супер-админу; в индексе ей делать нечего.
        disallow: ['/preview/', '/admin', '/dev/', '/partner', '/api/', '/booking/', '/unsubscribe/', '/GERA'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
