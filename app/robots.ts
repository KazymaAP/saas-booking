// app/robots.ts — правила для поисковиков (ТЗ §3.4: прототипы закрыты).
//
// Раздел копий /test/ful/sts открыт намеренно: его должны читать ИИ-агенты (ClaudeBot и подобные).
// Поисковые боты при этом в него не ходят — для них правило вынесено отдельной группой.
// Так мы не зависим от заголовка X-Robots-Tag: часть агентов трактует noindex как «не читать».
import type { MetadataRoute } from 'next';

import { SITE_URL as BASE } from '@/lib/site';

// Служебные пути: в индексе им делать нечего.
const SERVICE_PATHS = [
  '/preview/',   // предпросмотр шаблонов
  '/admin',      // студия супер-админа
  '/dev/',       // dev-экраны
  '/partner',    // партнёрский кабинет
  '/api/',       // API
  '/booking/',   // персональные токены записей
  '/unsubscribe/', // персональные токены отписки
  '/GERA',       // внутренняя база лидов
];

// Поисковые системы, которым копии не нужны: дубли страниц и открытые админки в выдаче.
const SEARCH_BOTS = ['Googlebot', 'Yandex', 'Bingbot', 'Mail.RU_Bot', 'Applebot', 'DuckDuckBot'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: SEARCH_BOTS,
        allow: '/',
        disallow: [...SERVICE_PATHS, '/test/'],
      },
      {
        // Все остальные, включая ИИ-агентов: раздел копий читать можно.
        userAgent: '*',
        allow: ['/', '/test/'],
        disallow: SERVICE_PATHS,
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
