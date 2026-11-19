// app/robots.ts — правила для поисковиков (ТЗ §3.4: прототипы закрыты).
//
// ВАЖНО про /test/ful/sts: этого пути здесь НЕТ и быть не должно.
// Раздел копий открыт для чтения ИИ-агентам, а робот-парсеры читают файл по-разному:
// часть берёт первую группу, не сверяя User-Agent, и тогда Disallow для /test/ закрывает
// раздел всем подряд — именно так Claude получал ROBOTS_DISALLOWED на отдельной группе ботов.
// Поэтому список запретов один и общий, без /test/.
import type { MetadataRoute } from 'next';

import { SITE_URL as BASE } from '@/lib/site';

// Служебные пути: в индексе им делать нечего.
const SERVICE_PATHS = [
  '/preview/',     // предпросмотр шаблонов
  '/admin',        // студия супер-админа
  '/dev/',         // dev-экраны
  '/partner',      // партнёрский кабинет
  '/api/',         // API
  '/booking/',     // персональные токены записей
  '/unsubscribe/', // персональные токены отписки
  '/GERA',         // внутренняя база лидов
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: SERVICE_PATHS,
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
