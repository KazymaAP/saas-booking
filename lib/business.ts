// lib/business.ts — резолв бизнеса по префиксу и slug (ТЗ §3.3, п. 2 и 4). Запросы к базе выполняются параллельно.
import { adminClient } from './supabase';
import type { Business, Service, VerticalTemplate } from './database.types';

export type Resolved =
  | { kind: 'found'; business: Business; template: VerticalTemplate | null }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

// Публичный сайт виден только для status='client'. Прототипы открываются через /preview/{slug}?token=.
export async function resolveBusiness(prefix: string, slug: string): Promise<Resolved> {
  const db = adminClient();
  // Шаблон ниши и бизнес независимы друг от друга: два запроса параллельно вместо последовательных.
  const [{ data: template }, { data: business }] = await Promise.all([
    db.from('vertical_templates').select('*').eq('url_prefix', prefix).maybeSingle(),
    db.from('businesses').select('*').eq('slug', slug).maybeSingle(),
  ]);

  if (business) {
    if (business.status !== 'client') return { kind: 'notfound' };
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
}

export async function activeServices(businessId: string): Promise<Service[]> {
  const { data } = await adminClient()
    .from('services').select('*').eq('business_id', businessId).eq('is_active', true).order('sort_order');
  return (data ?? []) as Service[];
}
