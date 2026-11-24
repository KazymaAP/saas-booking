// общие/lib/request-origin.ts — абсолютный адрес сайта для текущего запроса.
//
// Зачем: NEXT_PUBLIC_SITE_URL указывает на apex (https://zapishisya.ru), а Vercel отдаёт
// сайт на www и с apex делает 308. Любой абсолютный адрес, собранный из SITE_URL, ведёт
// на редирект: карта сайта состояла из 100 таких адресов, и поисковик тратил краулинговый
// бюджет на переходы вместо обхода. Берём хост из заголовков запроса — он всегда тот,
// на котором сайт реально открылся. SITE_URL остаётся запасным вариантом: сборка,
// вызов без заголовков, неизвестный хост (кастомный домен клиента сюда не попадает).
import { headers } from 'next/headers';

import { SITE_URL, isMainHost, normalizeHost } from './site';

/** `https://<host>` текущего запроса, если хост основной; иначе — fallback (по умолчанию SITE_URL). */
export function requestOrigin(fallback: string = SITE_URL): string {
  const h = headers();
  // Vercel кладёт исходный хост в x-forwarded-host; host — запасной вариант для локального запуска.
  const host = normalizeHost(h.get('x-forwarded-host') ?? h.get('host'));
  if (!host || !isMainHost(host)) return fallback;
  return `https://${host}`;
}
