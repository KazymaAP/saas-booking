// lib/custom-domain.ts — поиск бизнеса по кастомному домену (ТЗ §3.3, §40). Только серверный код (service_role).
// Общий для app/api/resolve-domain (cookie для middleware) и app/domain-site/by-domain (главная без cookie):
// один запрос, одна проверка prefix/slug — логика не дублируется.
import { adminClient } from './supabase';
import { isValidPrefix, isValidSlug } from './domain-map';

export type CustomDomainBusiness = { host: string; prefix: string; slug: string; status: string };

type BusinessRow = {
  slug: string;
  status: string;
  // PostgREST отдаёт связь many-to-one объектом, но при неоднозначной схеме — массивом.
  vertical_templates: { url_prefix: string } | { url_prefix: string }[] | null;
};

function urlPrefixOf(row: BusinessRow): string | null {
  const vt = row.vertical_templates;
  if (Array.isArray(vt)) return vt[0]?.url_prefix ?? null;
  return vt?.url_prefix ?? null;
}

// null — домен не привязан или данные некорректны (prefix/slug не пройдут в путь). Ошибка БД — исключение.
export async function findBusinessByDomain(host: string): Promise<CustomDomainBusiness | null> {
  const { data, error } = await adminClient()
    .from('businesses')
    .select('slug, status, vertical_templates(url_prefix)')
    .eq('custom_domain', host)
    .maybeSingle<BusinessRow>();
  if (error) throw new Error(`custom-domain: ${error.message}`);
  if (!data) return null;
  const prefix = urlPrefixOf(data);
  if (!prefix || !isValidPrefix(prefix) || !isValidSlug(data.slug)) return null;
  return { host, prefix, slug: data.slug, status: data.status };
}
