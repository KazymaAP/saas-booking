// app/[prefix]/[slug]/panel/(protected)/photos/actions.ts — фото работ (ТЗ §45: bucket photos, 5 МБ, jpg/jpeg/png/webp).
'use server';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const BUCKET = 'photos';

export async function uploadPhoto(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access) return;
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return;
  const ext = TYPES[file.type];
  if (!ext || file.size > MAX_BYTES) return;

  const db = adminClient();
  const path = `${access.business.id}/${randomUUID()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
  });
  if (error) return;

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
  const { count } = await db.from('photos').select('id', { count: 'exact', head: true }).eq('business_id', access.business.id);
  await db.from('photos').insert({
    business_id: access.business.id,
    url: pub.publicUrl,
    path,
    alt: String(formData.get('alt') ?? '').slice(0, 120) || access.business.name,
    sort_order: (count ?? 0) + 1,
  });
  revalidatePath(`/${prefix}/${slug}/panel/photos`);
}

export async function deletePhoto(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access) return;
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = adminClient();
  const { data: photo } = await db.from('photos').select('id, path').eq('id', id).eq('business_id', access.business.id).maybeSingle();
  if (!photo) return;
  if (photo.path) await db.storage.from(BUCKET).remove([photo.path]);
  await db.from('photos').delete().eq('id', photo.id);
  revalidatePath(`/${prefix}/${slug}/panel/photos`);
}
