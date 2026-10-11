// lib/generate.ts — генератор прототипов (ТЗ §5.6, шаг 2 воронки §5.4).
// Для бизнеса без услуг создаёт услуги из шаблона ниши, назначает slug, токен и ссылку прототипа,
// SVG-логотип с инициалами и brand_color. Фото из og:image не тянем: ТЗ допускает пустые фото (§5.6 п.6).
import { randomUUID } from 'crypto';
import { adminClient } from './supabase';
import { ensureUniqueSlug } from './slug';
import type { Business, VerticalTemplate } from './database.types';

import { SITE_URL as SITE } from './site';

// Логотип из og:image сайта клиента (§5.6 п.3). Таймаут 4 с. Нет сайта или картинки — null.
export async function fetchOgImage(site: string | undefined): Promise<string | null> {
  if (!site) return null;
  const url = /^https?:\/\//.test(site) ? site : `https://${site}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return null;
    return new URL(m[1], url).toString();
  } catch {
    return null;
  }
}

export function initialsLogo(name: string, color: string): string {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-size="56" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Генерирует прототип одного бизнеса. Возвращает ссылку прототипа.
export async function generatePrototype(business: Business, template: VerticalTemplate | null): Promise<string> {
  const db = adminClient();

  const slug = await ensureUniqueSlug(business.slug ?? business.name, async (candidate) => {
    const { data } = await db
      .from('businesses').select('id')
      .or(`slug.eq.${candidate},slug_history.cs.{${candidate}}`)
      .neq('id', business.id)
      .limit(1);
    return (data?.length ?? 0) > 0;
  });

  const token = randomUUID();
  const color = business.brand_color || template?.default_colors?.primary || '#111111';
  const previewUrl = `${SITE}/preview/${slug}?token=${token}`;

  const { count } = await db.from('services').select('id', { count: 'exact', head: true }).eq('business_id', business.id);
  if (!count && template?.default_services?.length) {
    await db.from('services').insert(
      template.default_services.map((s, i) => ({
        business_id: business.id,
        name: s.name,
        price: s.price,
        duration_minutes: s.duration,
        sort_order: i + 1,
        is_active: true,
      })),
    );
  }

  await db
    .from('businesses')
    .update({
      slug,
      logo_url: business.logo_url ?? (await fetchOgImage(business.websites?.[0])) ?? initialsLogo(business.name, color),
      brand_color: color,
      preview_token: token,
      preview_url: previewUrl,
      status: 'preview_ready',
    })
    .eq('id', business.id);

  return previewUrl;
}
