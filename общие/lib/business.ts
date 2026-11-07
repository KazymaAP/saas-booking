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
// Префикс ниши бизнеса по его vertical_template_id. Кэш на рендер: не больше одного запроса.
const canonicalPrefixFor = cache(async (business: Business): Promise<string | null> => {
  if (!business.vertical_template_id) return null;
  const { data } = await adminClient()
    .from('vertical_templates')
    .select('url_prefix')
    .eq('id', business.vertical_template_id)
    .maybeSingle();
  const prefix = (data as { url_prefix?: string } | null)?.url_prefix ?? '';
  return prefix.trim() ? prefix.trim() : null;
});

/**
 * Ключ ниши (slug темы) по id шаблона бизнеса. Нужен оформлению: у бизнеса нет ниши в строке,
 * только ссылка на vertical_templates. cache() — не больше одного запроса на рендер.
 */
export const nicheOfTemplate = cache(async (templateId: string | null | undefined): Promise<string | null> => {
  if (!templateId) return null;
  const { data } = await adminClient()
    .from('vertical_templates')
    .select('slug')
    .eq('id', templateId)
    .maybeSingle();
  const key = (data as { slug?: string } | null)?.slug ?? null;
  return key && key.trim() ? key.trim() : null;
});

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

    // Канонический адрес: бизнес живёт под префиксом своей ниши.
    // Раньше любой неизвестный префикс (/x/slug) отдавал ту же страницу — дубли для поисковиков,
    // а чужой существующий префикс (/b/ для маникюра) давал 404. Теперь — 308 на верный адрес.
    const canonicalPrefix = await canonicalPrefixFor(business);
    if (canonicalPrefix && canonicalPrefix !== prefix) {
      return { kind: 'redirect', to: `/${canonicalPrefix}/${business.slug}` };
    }

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
