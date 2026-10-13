'use server';
// app/panel/(protected)/verticals/actions.ts — ниши: создание, правка, включение, импорт JSON (ТЗ §5.4 /panel/verticals, §14).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';

const UUID = /^[0-9a-f-]{36}$/i;

function parseJson<T>(raw: string, fallback: T | null): T | null {
  try {
    return raw.trim() ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return null;
  }
}

function fieldsFrom(formData: FormData) {
  const services = parseJson<{ name: string; price: number; duration: number }[]>(String(formData.get('default_services') ?? ''), []);
  const texts = parseJson<Record<string, string>>(String(formData.get('default_texts') ?? ''), {});
  if (!services || !texts) return null;
  return {
    name: String(formData.get('name') ?? '').trim().slice(0, 80),
    slug: String(formData.get('slug') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40),
    url_prefix: String(formData.get('url_prefix') ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4),
    icon: String(formData.get('icon') ?? '').trim().slice(0, 4) || null,
    description: String(formData.get('description') ?? '').trim().slice(0, 300) || null,
    default_services: services,
    default_texts: texts,
    is_active: formData.get('is_active') === '1',
  };
}

export async function saveVertical(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const row = fieldsFrom(formData);
  if (!row || !row.name || !row.slug || !row.url_prefix) return;
  const db = adminClient();
  if (UUID.test(id)) {
    await db.from('vertical_templates').update(row).eq('id', id);
    await audit('vertical_save', 'vertical', id, { slug: row.slug });
  } else {
    await db.from('vertical_templates').insert(row);
    await audit('vertical_create', 'vertical', null, { slug: row.slug });
  }
  revalidatePath('/panel/verticals');
}

// Импорт набора ниш из JSON (массив объектов с теми же полями). Существующие по slug обновляются.
export async function importVerticals(formData: FormData) {
  const arr = parseJson<Record<string, unknown>[]>(String(formData.get('json') ?? ''), null);
  if (!Array.isArray(arr)) return;
  const db = adminClient();
  for (const v of arr) {
    if (!v.slug || !v.url_prefix || !v.name) continue;
    await db.from('vertical_templates').upsert(v, { onConflict: 'slug' });
  }
  await audit('vertical_import', 'vertical', null, { count: arr.length });
  revalidatePath('/panel/verticals');
}
