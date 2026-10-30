// lib/business.ts — резолв бизнеса по префиксу и slug (ТЗ §3.3, п. 2 и 4). Запросы к базе выполняются параллельно.
import { cache } from 'react';
import { adminClient } from './supabase';
import type { Business, Service, VerticalTemplate } from './database.types';

export type Resolved =
  | { kind: 'found'; business: Business; template: VerticalTemplate | null }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

// Публичный сайт виден только для status='client'. Прототипы открываются через /preview/{slug}?token=.
// cache() дедуплицирует вызов в рамках одного рендера: generateMetadata и сама страница вызывают
// resolveBusiness по отдельности — без обёртки это 2 лишних запроса к БД на каждый промах кеша ISR.
export const resolveBusiness = cache(async (prefix: string, slug: string): Promise<Resolved> => {
  const db = adminClient();
  // Шаблон ниши и бизнес независимы друг от друга: два запроса параллельно вместо последовательных.
  const [{ data: template }, { data: business }] = await Promise.all([
    db.from('vertical_templates').select('*').eq('url_prefix', prefix).maybeSingle(),
    db.from('businesses').select('*').eq('slug', slug).maybeSingle(),
  ]);

  if (business) {
    // №23: публичный сайт виден только оплаченным клиентам.
    // При истечении подписки крон ставит subscription_active=false (заглушка),
    // а status остаётся 'client' — поэтому проверяем оба условия.
    if (business.status !== 'client') return { kind: 'notfound' };
    if (!business.subscription_active) return { kind: 'notfound' };
    if (template && business.vertical_template_id !== template.id) return { kind: 'notfound' };
    return { kind: 'found', business, template: template ?? null };
  }

  // §39: slug не найден среди актуальных — ищем в истории и редиректим 301.
  const { data: historical } = await db
    .from('businesses').select('slug, status, vertical_template_id').contains('slug_history', [slug]).maybeSingle();
  if (historical && historical.status === 'client') {
    return { kind: 'redirect', to: `/${prefix}/${historical.slug}` };
  }
  return { kind: 'notfound' };
});

// cache() дедуплицирует повторные вызовы в рамках рендера (например, при параллельной загрузке услуг и фото).
export const activeServices = cache(async (businessId: string): Promise<Service[]> => {
  const { data } = await adminClient()
    .from('services').select('*').eq('business_id', businessId).eq('is_active', true).order('sort_order');
  return (data ?? []) as Service[];
});
