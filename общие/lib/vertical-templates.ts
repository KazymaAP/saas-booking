// lib/vertical-templates.ts — ниша бизнеса: префикс публичного адреса и шаблон по умолчанию.
// Публичный сайт открывается, только когда ниша бизнеса совпадает с префиксом в адресе
// (lib/business.ts → resolveBusiness). Бизнес без vertical_template_id не виден ни по одному адресу:
// шаблон для префикса находится, а сверка `vertical_template_id !== template.id` даёт 404.
// Поэтому все сценарии создания бизнеса обязаны проставлять нишу.
import { adminClient } from './supabase';

// Ниша по умолчанию для «сайт-визитки» без выбранной ниши — детейлинг (url_prefix 'd').
// Тот же префикс исторически использовали партнёрские ссылки, поэтому поведение совместимо.
export const DEFAULT_SITE_PREFIX = 'd';

export async function defaultTemplateId(): Promise<string | null> {
  const { data } = await adminClient()
    .from('vertical_templates')
    .select('id')
    .eq('url_prefix', DEFAULT_SITE_PREFIX)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// Публичный путь сайта: префикс из ниши бизнеса, а не хардкод. null — бизнес не найден.
export async function getBusinessSitePath(businessId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from('businesses')
    .select('slug, vertical_templates(url_prefix)')
    .eq('id', businessId)
    .maybeSingle();
  const row = data as { slug?: string | null; vertical_templates?: { url_prefix?: string | null } | null } | null;
  const slug = row?.slug;
  if (!slug) return null;
  const prefix = row?.vertical_templates?.url_prefix?.trim() || DEFAULT_SITE_PREFIX;
  return `/${prefix}/${slug}`;
}
