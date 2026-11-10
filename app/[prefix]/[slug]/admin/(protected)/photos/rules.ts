// photos/rules.ts — ограничения фото (ТЗ §4.8, §45: bucket photos, jpg/png/webp, до 5 МБ, сжатие до 2 МБ).
// Чистый модуль: те же правила у загрузчика в браузере и у server actions. Покрыт тестами.
import { z } from 'zod';

const MB = 1024 * 1024;

// Файл, который уходит в Storage, — не больше 5 МБ (лимит bucket в 0003_seed.sql).
export const MAX_UPLOAD_BYTES = 5 * MB;
// Больше 2 МБ — сжимаем в браузере (ТЗ §45).
export const COMPRESS_FROM_BYTES = 2 * MB;
export const COMPRESS_TARGET_MB = 2;
export const COMPRESS_MAX_SIDE_PX = 2000;
// Исходник с телефона бывает 8–15 МБ: принимаем до 25 МБ, чтобы сжать, а не отказать. Больше — риск нехватки памяти в браузере.
export const MAX_SOURCE_BYTES = 25 * MB;
export const MAX_PHOTOS = 50;
export const ALT_MIN = 3;
export const ALT_MAX = 120;
export const BUCKET = 'photos';

export const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type PhotoMime = keyof typeof PHOTO_TYPES;
export const ACCEPT = Object.keys(PHOTO_TYPES).join(',');

export function isPhotoMime(v: string): v is PhotoMime {
  return Object.prototype.hasOwnProperty.call(PHOTO_TYPES, v);
}

export function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace('.', ',')} МБ`;
}

export const AltSchema = z
  .string()
  .trim()
  .min(ALT_MIN, `Подпись — от ${ALT_MIN} символов: что на фото`)
  .max(ALT_MAX, `Подпись — до ${ALT_MAX} символов`);

// Проверка исходного файла до сжатия. null — файл подходит.
export function sourceFileError(file: { type: string; size: number }): string | null {
  if (!isPhotoMime(file.type)) return 'Нужен JPG, PNG или WebP';
  if (file.size === 0) return 'Файл пустой';
  if (file.size > MAX_SOURCE_BYTES) return `Файл больше ${formatMb(MAX_SOURCE_BYTES)} — выберите другой`;
  return null;
}

// Проверка файла, который отправляем в Storage (после сжатия).
export function uploadFileError(file: { type: string; size: number }): string | null {
  if (!isPhotoMime(file.type)) return 'Нужен JPG, PNG или WebP';
  if (file.size === 0) return 'Файл пустой';
  if (file.size > MAX_UPLOAD_BYTES) return `После сжатия больше ${formatMb(MAX_UPLOAD_BYTES)} — выберите другое фото`;
  return null;
}

export function remainingSlots(count: number): number {
  return Math.max(0, MAX_PHOTOS - count);
}

// Путь объекта: «<business_id>/<uuid>.<ext>». Проверяем при подтверждении загрузки,
// чтобы нельзя было «подтвердить» чужой объект или путь с ../
const PATH_RE = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export function isOwnPhotoPath(path: string, businessId: string): boolean {
  const m = PATH_RE.exec(path);
  return Boolean(m) && m?.[1] === businessId;
}

// Подпись для второго и следующих фото пачки: «Маникюр», «Маникюр (2)», …
export function altForIndex(alt: string, index: number): string {
  const base = alt.trim();
  if (index === 0) return base;
  const suffix = ` (${index + 1})`;
  return `${base.slice(0, ALT_MAX - suffix.length)}${suffix}`;
}
