// lib/entrepreneur.ts — заявка предпринимателя с публичной страницы /auth.
// Создаёт бизнес в статусе 'new' (виден в /panel/businesses) с уникальным slug.
// Аккаунт Supabase Auth создаётся отдельно в server action (email+password).
import { adminClient } from './supabase';

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(value: string): string {
  let out = '';
  for (const ch of value.toLowerCase()) out += TRANSLIT[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'business';
}

export async function createEntrepreneurRequest(input: { name: string; email: string }): Promise<{ id: string; slug: string }> {
  const db = adminClient() as any;
  const base = slugify(input.name);
  let slug = base;
  let n = 2;
  for (;;) {
    const { data } = await db.from('businesses').select('id').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${n++}`;
  }
  const { data, error } = await db
    .from('businesses')
    .insert({
      name: input.name.trim().slice(0, 160),
      slug,
      status: 'new',
      emails: [input.email],
      notes: 'Заявка с /auth (предприниматель)',
      subscription_active: false,
    })
    .select('id, slug')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Не удалось создать заявку');
  return { id: data.id as string, slug: data.slug as string };
}
