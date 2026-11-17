'use server';

import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { revalidatePath } from 'next/cache';
import { getNicheThemeBySlug } from '@/шаблоны/_shared/themes';
import { imageSize } from 'image-size';
import { basename } from 'node:path';
import { adminClient } from '@/lib/supabase';
import { BUCKET as PHOTOS_BUCKET, MAX_UPLOAD_BYTES, PHOTO_TYPES } from '@/lib/photo-rules';
import { logError } from '@/lib/log';
import { listAllPartnersOverview } from '@/lib/partners';
import {
  ingestLeads, generateSitesForNiche, listReadyServices, setReadyStatus,
  listReadyNiches, deleteReadyServices, deleteReadyServicesByFilter,
  getNicheDefaultServices, saveNicheDefaultServices, saveReadyServices, setReadyCover,
  listPartnerAccounts, updatePartnerName, setPartnerBanned, adjustPartnerMoney,
  sendPartnerMessage, listPartnerMessages,
  type ParsedLead, type ParsedService, type ReadyCategory, type ReadyStatus,
} from '@/lib/ready-services';
import { requireSuperAdminAction } from '@/lib/admin-session';

// Server actions — отдельные POST-эндпоинты: проверка layout/страницы их не защищает.
async function guardOk(): Promise<{ ok: false; error: string } | null> {
  return (await requireSuperAdminAction()) ? null : { ok: false, error: 'Доступ запрещён' };
}

// Обзор по всем партнёрам для супер-админки (операционная сводка платформы).
export async function getPartnersOverviewAction() {
  if (!(await requireSuperAdminAction())) return [];
  return listAllPartnersOverview();
}

// ---------- парсинг загружаемого файла выгрузки ----------
function parseServicesText(value: unknown): ParsedService[] {
  if (Array.isArray(value)) {
    return value.map((s) => ({
      name: String((s as ParsedService)?.name ?? ''),
      price: Number((s as ParsedService)?.price ?? 0) || null,
      duration_minutes: Number((s as ParsedService)?.duration_minutes ?? 0) || null,
    })).filter((s) => s.name);
  }
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.*?)\s*\((\d[\d\s]*)\s*₽?\)/);
    return m ? { name: m[1].trim(), price: Number(m[2].replace(/\s/g, '')) } : { name: p };
  }).filter((s) => s.name);
}

function normalizeLead(raw: Record<string, unknown>): ParsedLead {
  // Ключи бывают английскими (leads.json / outreach.csv) или русскими (XLSX-экспорт:
  // «Название», «Сфера», «Город», «Адрес», «Телефон», «Почта», «Оценка», «Отзывы», «Фото (файл)»).
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw)) map.set(k.trim().toLowerCase(), v);
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      const v = map.get(k.toLowerCase());
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return undefined;
  };
  const str = (v: unknown): string | undefined => (v === undefined || v === null || String(v).trim() === '' ? undefined : String(v).trim());
  const strList = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.map((item) => String(item)).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return v.split(';').map((item) => item.trim()).filter(Boolean);
    return undefined;
  };
  const phonesRaw = pick('phones');
  // Страховка: если заголовок названия не распознан, берём первое осмысленное
  // текстовое значение строки (не номер, не URL) — обычно это как раз название.
  let pickedName = str(pick('name', 'название', 'наименование', 'title', 'организация'));
  if (!pickedName) {
    for (const v of Object.values(raw)) {
      const s = str(v);
      if (s && !/^https?:\/\//i.test(s) && !/^\d+([.,]\d+)?$/.test(s)) { pickedName = s; break; }
    }
  }
  return {
    name: pickedName,
    city: str(pick('city', 'город')),
    category: str(pick('category', 'сфера', 'категория', 'рубрика')),
    address: str(pick('address', 'адрес')),
    phone: str(pick('phone', 'телефон')),
    phones: Array.isArray(phonesRaw) ? (phonesRaw as string[]) : undefined,
    email: str(pick('email', 'почта', 'e-mail')),
    site: str(pick('site', 'сайт', 'website', 'url')),
    description: str(pick('description', 'описание')),
    working_hours: str(pick('working_hours', 'часы работы', 'график', 'режим работы')),
    photo_url: str(pick('photo_url', 'фото url', 'фото_url', 'image', 'image_url')),
    photo_file: str(pick('photo_file', 'фото (файл)', 'фото файл', 'фото')),
    photo_urls: strList(pick('photo_urls', 'фото (все ссылки)')),
    photo_files: strList(pick('photo_files', 'фото (все файлы)')),
    rating: (pick('rating', 'оценка', 'рейтинг') as number | string | undefined) ?? undefined,
    reviews: (pick('reviews', 'отзывы') as number | string | undefined) ?? undefined,
    services: parseServicesText(pick('services', 'услуги')),
    slug: str(pick('slug', 'слаг')),
    status: str(pick('status', 'статус')),
    org_id: str(pick('org_id', 'id организации')),
    source_system: str(pick('source_system', 'источник')),
    map_url: str(pick('map_url', 'карта')),
    telegram: str(pick('telegram')),
    vk: str(pick('vk')),
    instagram: str(pick('instagram')),
    whatsapp: str(pick('whatsapp')),
    max: str(pick('max', 'макс')),
    raw,
  };
}

// Раскладывает фото из ZIP в Supabase Storage (bucket photos, префикс ready/<batch>/) и привязывает к строкам.
// Сопоставление: по имени файла из photo_file, иначе по префиксу «источник_id»
// (парсер называет файлы yandex_<org_id>_<hash>.ext / 2gis_<org_id>_<hash>.ext).
//
// Почему Storage, а не public/uploads: на Vercel файловая система только для чтения (кроме /tmp),
// поэтому writeFileSync в public/uploads падал с EROFS — импорт обрывался целиком. Storage работает
// одинаково локально и в облаке, а ссылка получается публичной (bucket photos публичный).
// Форматы и лимит берём из общего модуля правил: bucket photos принимает только jpeg/png/webp
// до 5 МБ (0003_seed.sql). Раньше здесь был свой список с gif/avif — такие файлы Storage
// отклонял, и они молча пропадали из галереи.
const MIME_BY_EXT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PHOTO_TYPES).map(([mime, ext]) => [ext, mime])),
  jpeg: 'image/jpeg', // расширение .jpeg — тот же формат, что .jpg
};
const IMAGE_EXT = new RegExp(`\\.(${Object.keys(MIME_BY_EXT).join('|')})$`, 'i');

async function storePhotosFromZip(
  zipBuffer: Buffer,
  leads: ParsedLead[],
): Promise<{ matched: number; unmatched: number; failed: number }> {
  const MAX_ENTRIES = 3000;
  const MAX_UNCOMPRESSED = 600 * 1024 * 1024;

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  // Число файлов проверяем до распаковки: 3000 записей — предел, дальше это уже архив-бомба.
  if (entries.length > MAX_ENTRIES) throw new Error(`В архиве больше ${MAX_ENTRIES} файлов`);

  const byName = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) byName.set(basename(entry.entryName).toLowerCase(), entry);

  const batchId = `b${Date.now().toString(36)}`;
  const storage = adminClient().storage.from(PHOTOS_BUCKET);
  // Один файл может подойти нескольким строкам — грузим его ровно один раз (и помним вердикт по размеру).
  const uploaded = new Map<string, { url: string; bad: boolean }>();

  let matched = 0;
  let unmatched = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const lead of leads) {
    const base = lead.photo_file ? basename(String(lead.photo_file)).toLowerCase() : '';
    // Префикс организации: yandex_<org_id>_ / 2gis_<org_id>_ — из имени файла или полей.
    let prefix = '';
    const stemMatch = base.match(/^(.+_)[0-9a-f]{8}\.[^.]+$/);
    if (stemMatch) prefix = stemMatch[1];
    if (!prefix && lead.org_id) {
      const sys = String(lead.source_system ?? '').toLowerCase();
      prefix = `${sys}_${lead.org_id}_`.toLowerCase();
    }

    let picked = prefix
      ? entries.filter((entry) => basename(entry.entryName).toLowerCase().startsWith(prefix))
      : [];
    if (picked.length === 0 && base) {
      const exact = byName.get(base);
      if (exact) picked = [exact];
    }
    if (picked.length === 0) { unmatched += 1; continue; }

    const urls: string[] = [];
    let allBad = true;
    let overLimit = false;
    for (const entry of picked) {
      // В галерею пишем только изображения — иначе можно залить HTML/JS (stored XSS).
      if (!IMAGE_EXT.test(entry.entryName)) continue;

      const fileName = basename(entry.entryName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const cached = uploaded.get(fileName);
      if (cached) {
        urls.push(cached.url);
        if (!cached.bad) allBad = false;
        continue;
      }

      let data: Buffer;
      try {
        data = entry.getData();
      } catch {
        failed += 1; // битый или зашифрованный entry — остальные файлы не страдают
        continue;
      }
      // Считаем РЕАЛЬНЫЙ распакованный размер: header.size берётся из оглавления ZIP и подделывается,
      // поэтому лимит по нему архив-бомба обходила.
      totalBytes += data.length;
      if (totalBytes > MAX_UNCOMPRESSED) { overLimit = true; break; }
      // Bucket photos не принимает файлы больше 5 МБ — отсекаем до загрузки, а не после отказа Storage.
      if (data.length > MAX_UPLOAD_BYTES) { failed += 1; continue; }

      let bad = true;
      try {
        const dim = imageSize(data);
        bad = !(dim.width >= 500 && dim.height >= 350);
      } catch {
        continue; // битый файл или не картинка — не сохраняем
      }

      const ext = (fileName.split('.').pop() ?? '').toLowerCase();
      const path = `ready/${batchId}/${fileName}`;
      const { error } = await storage.upload(path, data, {
        contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
        upsert: true,
      });
      if (error) { failed += 1; continue; }
      const { data: pub } = storage.getPublicUrl(path);
      uploaded.set(fileName, { url: pub.publicUrl, bad });
      urls.push(pub.publicUrl);
      if (!bad) allBad = false;
    }
    if (overLimit) break;
    if (urls.length === 0) { unmatched += 1; continue; }
    lead.photo_urls = urls;
    lead.photo_url = urls[0] ?? '';
    lead.photo_bad = allBad;
    matched += 1;
  }
  // Не роняем импорт из-за фото: строки без картинок всё равно полезны. Итог — в журнал.
  if (failed > 0) await logError('import', 'ready-upload: часть фото не сохранена', { batch: batchId, failed });
  return { matched, unmatched, failed };
}

function parseCsv(text: string): Record<string, unknown>[] {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
    const obj: Record<string, unknown> = {};
    header.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    return obj;
  });
}

function parseLeadsFile(fileName: string, buffer: Buffer): ParsedLead[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(buffer.toString('utf8'));
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.leads) ? parsed.leads : [parsed];
    return arr.filter(Boolean).map((r: Record<string, unknown>) => normalizeLead(r));
  }
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) {
    return buffer.toString('utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => normalizeLead(JSON.parse(l)));
  }
  if (lower.endsWith('.csv')) {
    return parseCsv(buffer.toString('utf8').replace(/^\ufeff/, '')).map(normalizeLead);
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    return rows.map(normalizeLead);
  }
  throw new Error('Поддерживаются .json, .jsonl, .csv, .xlsx');
}

export async function ingestReadyUploadAction(formData: FormData) {
  const denied = await guardOk();
  if (denied) return denied;
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: 'Файл не выбран' };
  if (file.size > 50 * 1024 * 1024) return { ok: false as const, error: 'Файл больше 50 МБ' };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const leads = parseLeadsFile(file.name, buffer);
    if (leads.length === 0) return { ok: false as const, error: 'В файле не найдено строк' };

    // Архив с фото (необязательно): раскладываем и привязываем к строкам.
    const photosFile = formData.get('photos');
    let photoStats: { matched: number; unmatched: number; failed: number } | null = null;
    if (photosFile instanceof File && photosFile.size > 0) {
      if (photosFile.size > 200 * 1024 * 1024) return { ok: false as const, error: 'Архив с фото больше 200 МБ' };
      try {
        const zipBuffer = Buffer.from(await photosFile.arrayBuffer());
        photoStats = await storePhotosFromZip(zipBuffer, leads);
      } catch (e) {
        // Фото — необязательная часть: строки импортируем и без них, но причину пишем в журнал.
        await logError('import', 'ready-upload: архив с фото не разобран', {
          reason: e instanceof Error ? e.message : String(e),
        });
        photoStats = null;
      }
    }

    // Ниша определяется автоматически по каждой строке (категория/название/услуги).
    const res = await ingestLeads(leads, 'auto', 'upload');
    if (res.inserted === 0) {
      return {
        ok: false as const,
        error: res.error
          ? `Данные прочитаны (${leads.length} строк), но запись в базу не удалась: ${res.error}. Скорее всего не применена миграция 0018 — таблица ready_services.`
          : `Прочитано ${leads.length} строк, но ни одна не подошла: не найдено название (name / «Название»). Проверьте заголовки файла.`,
      };
    }
    return { ok: true as const, total: leads.length, inserted: res.inserted, skipped: res.skipped, byNiche: res.byNiche, photos: photoStats };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getReadyServicesAction(filter?: { niche?: string; status?: ReadyStatus; category?: ReadyCategory }) {
  if (!(await requireSuperAdminAction())) return [];
  return listReadyServices(filter ?? {});
}

export async function setReadyStatusAction(id: string, status: ReadyStatus) {
  const denied = await guardOk();
  if (denied) return denied;
  await setReadyStatus(id, status);
  return { ok: true as const };
}

export async function generateSitesAction(niche: string, category: ReadyCategory | 'all') {
  const denied = await guardOk();
  if (denied) return denied;
  try {
    const res = await generateSitesForNiche(niche, category, 300);
    const theme = getNicheThemeBySlug(niche);
    for (const url of res.urls) {
      revalidatePath(url);
      const slug = url.split('/').pop();
      if (theme && slug) revalidatePath(`/${theme.prefix}/${slug}`);
    }
    return { ok: true as const, ...res };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- партнёрские аккаунты ----------
export async function getPartnerAccountsAction() {
  if (!(await requireSuperAdminAction())) return [];
  return listPartnerAccounts();
}

export async function updatePartnerNameAction(id: string, name: string) {
  const denied = await guardOk();
  if (denied) return denied;
  if (name.length > 120) return { ok: false as const, error: 'Слишком длинное имя' };
  await updatePartnerName(id, name);
  return { ok: true as const };
}

export async function banPartnerAction(id: string, banned: boolean) {
  const denied = await guardOk();
  if (denied) return denied;
  await setPartnerBanned(id, banned);
  return { ok: true as const };
}

export async function adjustPartnerMoneyAction(id: string, amount: number, kind: 'bonus' | 'payout' | 'adjust', note?: string) {
  const denied = await guardOk();
  if (denied) return denied;
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
    return { ok: false as const, error: 'Некорректная сумма' };
  }
  await adjustPartnerMoney(id, amount, kind, note);
  return { ok: true as const };
}

export async function messagePartnerAction(id: string, body: string) {
  const denied = await guardOk();
  if (denied) return denied;
  if (!body.trim()) return { ok: false as const, error: 'Пустое сообщение' };
  if (body.length > 2000) return { ok: false as const, error: 'Сообщение длиннее 2000 символов' };
  await sendPartnerMessage(id, body);
  return { ok: true as const };
}

export async function getPartnerMessagesAction(id: string) {
  if (!(await requireSuperAdminAction())) return [];
  return listPartnerMessages(id);
}

// ---------- ниши из таблицы, удаление, прайс ниш, обложки ----------
export async function getReadyNichesAction() {
  if (!(await requireSuperAdminAction())) return [];
  return listReadyNiches();
}

export async function deleteReadyServicesAction(ids: string[], alsoDeleteSites: boolean) {
  const denied = await guardOk();
  if (denied) return denied;
  if (ids.length > 1000) return { ok: false as const, error: 'Слишком много записей за раз' };
  try {
    const res = await deleteReadyServices(ids, alsoDeleteSites);
    return { ok: true as const, ...res };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteReadyServicesByFilterAction(
  filter: { niche?: string; status?: ReadyStatus; category?: ReadyCategory },
  alsoDeleteSites: boolean,
) {
  const denied = await guardOk();
  if (denied) return denied;
  try {
    const res = await deleteReadyServicesByFilter(filter, alsoDeleteSites);
    return { ok: true as const, ...res };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getNicheDefaultsAction(niche: string) {
  if (!(await requireSuperAdminAction())) return [];
  return getNicheDefaultServices(niche);
}

export async function saveNicheDefaultsAction(niche: string, services: { name: string; price: number; duration: number }[]) {
  const denied = await guardOk();
  if (denied) return denied;
  if (services.length > 50) return { ok: false as const, error: 'Слишком много услуг' };
  try {
    await saveNicheDefaultServices(niche, services);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

function revalidateSite(niche: string, slug: string) {
  revalidatePath(`/${niche}/${slug}`);
  const theme = getNicheThemeBySlug(niche);
  if (theme) revalidatePath(`/${theme.prefix}/${slug}`);
}

export async function saveReadyServicesAction(id: string, services: { name: string; price: number; duration_minutes: number }[]) {
  const denied = await guardOk();
  if (denied) return denied;
  if (services.length > 50) return { ok: false as const, error: 'Слишком много услуг' };
  try {
    const res = await saveReadyServices(id, services);
    revalidateSite(res.niche, res.slug);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setReadyCoverAction(id: string, useCover: boolean) {
  const denied = await guardOk();
  if (denied) return denied;
  try {
    const res = await setReadyCover(id, useCover);
    revalidateSite(res.niche, res.slug);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
