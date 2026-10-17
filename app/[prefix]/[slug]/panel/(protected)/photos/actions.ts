// app/[prefix]/[slug]/panel/(protected)/photos/actions.ts — фото работ (ТЗ §4.8, §45, §13.10).
// Файл не проходит через server action (лимит тела 1 МБ в Next 14): браузер грузит его напрямую в Storage
// по подписанной ссылке с прогрессом. Сервер выдаёт ссылку (проверив роль, тип, размер, лимит 50)
// и подтверждает загрузку (проверив сам объект в Storage). Только владелец: фото меняют сайт.
'use server';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { actionAccess, OWNER_ONLY } from '../_lib/access';
import { ERR, fail, ok, UUID_RE, type ActionResult } from '../_lib/result';
import {
  AltSchema, BUCKET, MAX_PHOTOS, MAX_UPLOAD_BYTES, PHOTO_TYPES,
  isOwnPhotoPath, isPhotoMime, uploadFileError,
} from './rules';

export type PhotoRow = { id: string; url: string | null; alt: string | null };
export type UploadTicket = { path: string; signedUrl: string };

const LIMIT_TEXT = `Не больше ${MAX_PHOTOS} фото. Удалите лишние, чтобы добавить новые`;

const TicketInput = z.object({
  type: z.string().refine(isPhotoMime, 'Нужен JPG, PNG или WebP'),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
const ConfirmInput = z.object({ path: z.string().max(200), alt: AltSchema });
const Id = z.string().regex(UUID_RE);

function revalidate(): void {
  revalidatePath('/[prefix]/[slug]/panel', 'layout'); // сетка фото и чек-лист дашборда
  revalidatePath('/[prefix]/[slug]', 'page'); // галерея публичного сайта
}

async function photoCount(businessId: string): Promise<number | null> {
  const { count, error } = await adminClient().from('photos').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  return error ? null : count ?? 0;
}

// Шаг 1: ссылка на загрузку одного файла.
export async function createPhotoUpload(slug: string, input: { type: string; size: number }): Promise<ActionResult<UploadTicket>> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const parsed = TicketInput.safeParse(input);
  if (!parsed.success) return fail(uploadFileError(input) ?? ERR.invalid);

  const count = await photoCount(access.business.id);
  if (count === null) return fail(ERR.server);
  if (count >= MAX_PHOTOS) return fail(LIMIT_TEXT);

  const ext = isPhotoMime(parsed.data.type) ? PHOTO_TYPES[parsed.data.type] : 'jpg';
  const path = `${access.business.id}/${randomUUID()}.${ext}`;
  const { data, error } = await adminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    await logError('import', 'panel: signed upload url failed', { business_id: access.business.id });
    return fail(ERR.server);
  }
  return ok(undefined, { path, signedUrl: data.signedUrl });
}

// Шаг 2: файл уже в Storage — проверяем его и создаём запись. Неподходящий объект удаляем.
export async function confirmPhotoUpload(slug: string, input: { path: string; alt: string }): Promise<ActionResult<PhotoRow>> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const parsed = ConfirmInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? ERR.invalid);
  const { path, alt } = parsed.data;
  if (!isOwnPhotoPath(path, access.business.id)) return fail(ERR.forbidden);

  const storage = adminClient().storage.from(BUCKET);
  const { data: info, error: infoError } = await storage.info(path);
  if (infoError || !info) return fail('Файл не дошёл до сервера. Попробуйте ещё раз');
  // Подписанная ссылка не ограничивает содержимое — проверяем то, что реально загрузили.
  const problem = uploadFileError({ type: info.contentType ?? '', size: info.size ?? 0 });
  if (problem) {
    await storage.remove([path]);
    return fail(problem);
  }

  // Один запрос — и лимит, и идемпотентность. Фото у бизнеса не больше 50, поэтому читаем их пути целиком.
  // Идемпотентность: клиент повторяет action при сетевой ошибке (callAction). Если первый вызов успел
  // создать запись, а ответ потерялся, повтор вернёт её же — без дубля в галерее и без удаления файла.
  const { data: existing, error: listError } = await adminClient()
    .from('photos').select('id, url, alt, path').eq('business_id', access.business.id)
    .returns<(PhotoRow & { path: string | null })[]>();
  if (listError || !existing) return fail(ERR.server);
  const same = existing.find((p) => p.path === path);
  if (same) return ok('Фото добавлено', { id: same.id, url: same.url, alt: same.alt });
  // Повторная проверка лимита: две вкладки могли получить ссылки одновременно.
  const count = existing.length;
  if (count >= MAX_PHOTOS) {
    await storage.remove([path]);
    return fail(LIMIT_TEXT);
  }

  const { data: pub } = storage.getPublicUrl(path);
  const { data, error } = await adminClient()
    .from('photos')
    .insert({ business_id: access.business.id, url: pub.publicUrl, path, alt, sort_order: count + 1 })
    .select('id, url, alt')
    .returns<PhotoRow[]>();
  const row = data?.[0];
  if (error || !row) {
    await storage.remove([path]);
    return fail(ERR.server);
  }
  revalidate();
  return ok('Фото добавлено', row);
}

export async function updatePhotoAlt(slug: string, id: string, alt: string): Promise<ActionResult> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const parsedAlt = AltSchema.safeParse(alt);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);
  if (!parsedAlt.success) return fail(parsedAlt.error.issues[0]?.message ?? ERR.invalid, { alt: parsedAlt.error.issues[0]?.message ?? ERR.invalid });

  const { data, error } = await adminClient()
    .from('photos').update({ alt: parsedAlt.data }).eq('id', id).eq('business_id', access.business.id)
    .select('id').returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  revalidate();
  return ok('Подпись сохранена');
}

// Удаление: один DELETE ... RETURNING path (права — business_id в WHERE), затем объект из Storage.
export async function deletePhoto(slug: string, id: string): Promise<ActionResult> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('photos').delete().eq('id', id).eq('business_id', access.business.id)
    .select('path').returns<{ path: string | null }[]>();
  if (error) return fail(ERR.server);
  const photo = data?.[0];
  if (!photo) return fail(ERR.notFound);
  // Ошибка Storage не возвращает фото на сайт: запись уже удалена, сирота-файл виден в журнале.
  if (photo.path) {
    const { error: rmError } = await adminClient().storage.from(BUCKET).remove([photo.path]);
    if (rmError) await logError('import', 'panel: photo object not removed', { business_id: access.business.id, photo_id: id });
  }
  revalidate();
  return ok('Фото удалено');
}
