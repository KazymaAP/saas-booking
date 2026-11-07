// общие/lib/ready-services.ts — готовые сайты-визитки из выгрузки парсера и раздача партнёрам.
// Всё через adminClient() (service_role); новые таблицы (ready_services, partner_messages,
// partner_payouts) не в сгенерированных типах, поэтому обращения кастуются к any.
import { adminClient } from './supabase';
import { getNicheThemeBySlug } from '@/шаблоны/_shared/themes';
import { listAllPartnersOverview } from './partners';

export type ReadyCategory = 'new' | 'full' | 'no_photos' | 'no_services' | 'no_template';
export type ReadyStatus = 'draft' | 'approved' | 'rejected';
export type AssignmentStatus = 'available' | 'in_process' | 'written';
export type PartnerOutcome = 'written' | 'refused' | 'no_answer';

export interface ReadyService {
  id: string;
  niche: string;
  name: string;
  slug: string;
  business_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  category: ReadyCategory;
  source: string;
  payload: Record<string, unknown> | null;
  status: ReadyStatus;
  assigned_partner_id: string | null;
  assignment_status: AssignmentStatus;
  taken_at: string | null;
  refusal_count: number;
  no_answer_count: number;
  last_outcome: PartnerOutcome | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedService { name: string; price?: number | null; duration_minutes?: number | null }
export interface ParsedLead {
  name?: string;
  address?: string;
  city?: string;
  phone?: string;
  phones?: string[];
  email?: string;
  site?: string;
  category?: string;
  description?: string;
  working_hours?: string;
  photo_url?: string;
  photo_file?: string;
  photo_urls?: string[];
  photo_files?: string[];
  services?: ParsedService[];
  slug?: string;
  status?: string;
  org_id?: string;
  source_system?: string;
  map_url?: string;
  telegram?: string;
  vk?: string;
  instagram?: string;
  whatsapp?: string;
  max?: string;
  raw?: Record<string, unknown>;
  photo_bad?: boolean;
  use_cover?: boolean;
  [key: string]: unknown;
}

const MAX_IN_PROCESS = 5;
const OVERDUE_DAYS = 3;
const DEFAULT_HOURS = {
  mon: [{ open: '09:00', close: '21:00' }],
  tue: [{ open: '09:00', close: '21:00' }],
  wed: [{ open: '09:00', close: '21:00' }],
  thu: [{ open: '09:00', close: '21:00' }],
  fri: [{ open: '09:00', close: '21:00' }],
  sat: [{ open: '10:00', close: '20:00' }],
  sun: [{ open: '10:00', close: '18:00' }],
};

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugifyRu(value: unknown): string {
  const text = String(value ?? '').toLowerCase();
  let out = '';
  for (const ch of text) out += TRANSLIT[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
}

// Ключевые слова для автоопределения ниши по категории/названию/описанию/услугам.
// Чем длиннее совпавшее слово, тем выше вклад (специфичные слова важнее общих).
const NICHE_KEYWORDS: Record<string, string[]> = {
  detailing: ['детейлинг', 'детейл', 'автомойк', 'мойк', 'химчистк салон', 'полиров', 'керамик', 'кузов', 'ppf', 'тониров', 'автосервис', 'автодетейлинг'],
  beauty: ['салон красот', 'красот', 'парикмахер', 'стрижк', 'маникюр', 'педикюр', 'бров', 'ресниц', 'косметолог', 'спа', 'массаж', 'барбершоп', 'барбер', 'nail', 'визаж'],
  dentist: ['стоматолог', 'зуб', 'имплант', 'ортодонт', 'отбелив', 'кариес', 'dental'],
  fitness: ['фитнес', 'тренажёр', 'тренажер', 'спортзал', 'йог', 'кроссфит', 'тренировк', 'gym', 'пилатес', 'единоборств'],
  tutor: ['репетитор', 'курсы', 'школ', 'обучени', 'егэ', 'огэ', 'уроки', 'английск', 'математик', 'tutor', 'образован'],
  photographer: ['фотостуди', 'фотосъёмк', 'фотосесс', 'фотограф', 'съёмк', 'portrait'],
  lawyer: ['юрист', 'адвокат', 'юридическ', 'правов', 'нотариус', 'law'],
  vet: ['ветеринар', 'ветклиник', 'питом', 'животн', 'зоо', 'вет'],
  cleaning: ['клининг', 'уборк', 'чистк', 'cleaning', 'уборщ', 'химчистк мебел'],
  repair: ['ремонт техник', 'ремонт', 'сервис', 'ноутбук', 'смартфон', 'бытов', 'мастерск', 'repair'],
};

export function detectNiche(lead: ParsedLead): string | null {
  const parts = [
    lead.category,
    lead.name,
    lead.description,
    ...(Array.isArray(lead.services) ? lead.services.map((s) => s.name) : []),
  ].filter(Boolean).map(String).join(' ').toLowerCase();
  if (!parts) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const [key, words] of Object.entries(NICHE_KEYWORDS)) {
    let score = 0;
    for (const w of words) if (parts.includes(w)) score += w.length;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return bestScore > 0 ? best : null;
}

export function detectCategory(niche: string, lead: ParsedLead): ReadyCategory {
  if (!getNicheThemeBySlug(niche)) return 'no_template';
  const services = Array.isArray(lead.services) ? lead.services : [];
  if (services.length === 0) return 'no_services';
  // Фото берём только по веб-URL (photo_url); локальные photo_file серверу недоступны.
  return lead.photo_url ? 'full' : 'no_photos';
}

function firstPhone(lead: ParsedLead): string | null {
  const list = Array.isArray(lead.phones) ? lead.phones.filter(Boolean) : [];
  return (lead.phone && String(lead.phone).trim()) || (list[0] ?? null);
}

// ---------- загрузка выгрузки парсера ----------
// nicheOrAuto = 'auto' → ниша определяется для каждой строки по данным (категория/название/услуги).
export async function ingestLeads(
  leads: ParsedLead[],
  nicheOrAuto: string = 'auto',
  source: 'parser' | 'upload' | 'manual' = 'upload',
): Promise<{ inserted: number; skipped: number; byNiche: Record<string, number>; error: string | null }> {
  const db = adminClient() as any;
  const auto = !nicheOrAuto || nicheOrAuto === 'auto';
  const used = new Set<string>();
  const rows: any[] = [];
  let skipped = 0;
  const byNiche: Record<string, number> = {};

  for (const lead of leads) {
    const name = String(lead.name ?? '').trim();
    if (!name) { skipped += 1; continue; }
    const rowNiche = auto ? (detectNiche(lead) ?? 'unknown') : nicheOrAuto;
    const cat = detectCategory(rowNiche, lead);
    let slug = slugifyRu(lead.slug || name);
    let candidate = slug;
    let n = 2;
    while (used.has(`${rowNiche}:${candidate}`)) candidate = `${slug}-${n++}`;
    used.add(`${rowNiche}:${candidate}`);
    slug = candidate;
    rows.push({
      niche: rowNiche,
      name,
      slug,
      phone: firstPhone(lead),
      email: lead.email ? String(lead.email) : null,
      address: lead.address ? String(lead.address) : null,
      city: lead.city ? String(lead.city) : null,
      category: cat,
      source,
      payload: lead as Record<string, unknown>,
      status: 'draft',
      assignment_status: 'available',
    });
    byNiche[rowNiche] = (byNiche[rowNiche] ?? 0) + 1;
  }

  if (rows.length === 0) return { inserted: 0, skipped, byNiche, error: null };

  // Батчами по 200, чтобы не упереться в лимит тела запроса.
  let inserted = 0;
  let lastError: string | null = null;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db.from('ready_services').upsert(chunk, { onConflict: 'niche,slug' });
    if (error) lastError = error.message;
    else inserted += chunk.length;
  }
  return { inserted, skipped, byNiche, error: inserted === 0 ? lastError : null };
}

export async function listReadyServices(opts: { niche?: string; status?: ReadyStatus; category?: ReadyCategory } = {}): Promise<ReadyService[]> {
  const db = adminClient() as any;
  try {
    let q = db.from('ready_services').select('*').order('created_at', { ascending: false }).limit(1000);
    if (opts.niche) q = q.eq('niche', opts.niche);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.category) q = q.eq('category', opts.category);
    const { data } = await q;
    return (data ?? []) as ReadyService[];
  } catch {
    return [];
  }
}

/** Ниши, которые реально есть в таблице, с количеством строк. */
export async function listReadyNiches(): Promise<{ niche: string; count: number }[]> {
  const db = adminClient() as any;
  try {
    const { data } = await db.from('ready_services').select('niche').limit(5000);
    const counts = new Map<string, number>();
    for (const row of (data ?? []) as { niche: string }[]) {
      counts.set(row.niche, (counts.get(row.niche) ?? 0) + 1);
    }
    return [...counts.entries()].map(([niche, count]) => ({ niche, count })).sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

export async function deleteReadyServices(ids: string[], alsoDeleteSites: boolean): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const db = adminClient() as any;
  let businessIds: string[] = [];
  if (alsoDeleteSites) {
    const { data } = await db.from('ready_services').select('business_id').in('id', ids);
    businessIds = ((data ?? []) as { business_id: string | null }[])
      .map((row) => row.business_id)
      .filter((value): value is string => Boolean(value));
  }
  const { error } = await db.from('ready_services').delete().in('id', ids);
  if (error) throw new Error(error.message);
  if (businessIds.length > 0) {
    await db.from('businesses').delete().in('id', businessIds);
  }
  return { deleted: ids.length };
}

export async function deleteReadyServicesByFilter(
  filter: { niche?: string; status?: ReadyStatus; category?: ReadyCategory },
  alsoDeleteSites: boolean,
): Promise<{ deleted: number }> {
  const rows = await listReadyServices(filter);
  return deleteReadyServices(rows.map((row) => row.id), alsoDeleteSites);
}

export async function setReadyStatus(id: string, status: ReadyStatus): Promise<void> {
  const db = adminClient() as any;
  await db.from('ready_services').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
}

// ---------- генерация сайтов из данных ----------
async function getTemplateId(prefix: string): Promise<string | null> {
  const { data } = await adminClient().from('vertical_templates').select('id').eq('url_prefix', prefix).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ---------- прайс по нишам (редактируемые дефолты) ----------
export async function getNicheDefaultServices(niche: string): Promise<{ name: string; price: number; duration: number }[]> {
  const theme = getNicheThemeBySlug(niche);
  const db = adminClient() as any;
  try {
    const { data } = await db.from('settings').select('value').eq('key', `niche_defaults:${niche}`).maybeSingle();
    const value = data?.value;
    if (Array.isArray(value)) {
      return (value as { name?: string; price?: number; duration?: number }[])
        .filter((item) => item && item.name)
        .map((item) => ({ name: String(item.name), price: Number(item.price ?? 0) || 0, duration: Number(item.duration ?? 60) || 60 }));
    }
  } catch { /* fallback на тему */ }
  return theme?.defaultServices ?? [];
}

export async function saveNicheDefaultServices(niche: string, services: { name: string; price: number; duration: number }[]): Promise<void> {
  const db = adminClient() as any;
  const clean = services
    .filter((item) => item.name.trim())
    .map((item) => ({ name: item.name.trim(), price: Number(item.price) || 0, duration: Number(item.duration) || 60 }));
  await db.from('settings').upsert(
    { key: `niche_defaults:${niche}`, value: clean, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
}

export async function saveReadyServices(id: string, services: { name: string; price: number; duration_minutes: number }[]): Promise<{ niche: string; slug: string }> {
  const db = adminClient() as any;
  const { data: row } = await db.from('ready_services').select('payload, business_id, niche, slug').eq('id', id).maybeSingle();
  if (!row) throw new Error('Сервис не найден');
  const payload = { ...(row.payload ?? {}), services };
  await db.from('ready_services').update({ payload, updated_at: new Date().toISOString() }).eq('id', id);
  // Если сайт уже сгенерирован — обновляем его услуги, чтобы они появились на сайте.
  if (row.business_id) {
    await db.from('services').delete().eq('business_id', row.business_id);
    if (services.length > 0) {
      await db.from('services').insert(services.map((service, index) => ({
        business_id: row.business_id,
        name: service.name,
        price: Number(service.price) || 0,
        duration_minutes: Number(service.duration_minutes) || 60,
        is_active: true,
        sort_order: index,
      })));
    }
  }
  return { niche: row.niche, slug: row.slug };
}

export async function setReadyCover(id: string, useCover: boolean, partnerId?: string | null): Promise<{ niche: string; slug: string }> {
  const db = adminClient() as any;
  if (partnerId) await assertPartnerReadyAccess(db, partnerId, id);
  const { data: row } = await db.from('ready_services').select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Сервис не найден');
  const payload = { ...(row.payload ?? {}), use_cover: useCover };
  await db.from('ready_services').update({ payload, updated_at: new Date().toISOString() }).eq('id', id);
  if (row.business_id) {
    const original = (payload as { photo_url?: string }).photo_url;
    const url = useCover ? `/media/covers/${row.niche}.svg` : (original || `/media/covers/${row.niche}.svg`);
    const { data: existing } = await db.from('photos').select('id').eq('business_id', row.business_id).eq('is_main', true).maybeSingle();
    if (existing?.id) await db.from('photos').update({ url }).eq('id', existing.id);
    else await db.from('photos').insert({ business_id: row.business_id, url, alt: row.name, sort_order: 0, is_main: true });
  }
  return { niche: row.niche, slug: row.slug };
}

export async function generateSitesForNiche(
  niche: string,
  category: ReadyCategory | 'all',
  limit = 200,
): Promise<{ generated: number; failed: number; urls: string[] }> {
  const theme = getNicheThemeBySlug(niche);
  if (!theme) throw new Error(`Неизвестная ниша: ${niche}`);
  const db = adminClient() as any;
  const templateId = await getTemplateId(theme.prefix);
  const nicheDefaults = await getNicheDefaultServices(niche);

  let query = db
    .from('ready_services')
    .select('*')
    .eq('niche', niche)
    .eq('status', 'draft')
    .is('business_id', null);
  if (category !== 'all') query = query.eq('category', category);
  const { data } = await query.limit(Math.min(Math.max(limit, 1), 500));
  const rows = (data ?? []) as ReadyService[];

  // Предвычисляем уникальные slug заранее — без гонок и коллизий.
  const { data: existing } = await db.from('businesses').select('slug').limit(20000);
  const usedSlugs = new Set<string>(((existing ?? []) as { slug: string }[]).map((x) => x.slug));
  const prepared = rows.map((r) => {
    const base = r.slug || slugifyRu(r.name);
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);
    return { r, slug };
  });

  let generated = 0;
  let failed = 0;
  const urls: string[] = [];

  const processRow = async ({ r, slug }: { r: ReadyService; slug: string }) => {
    try {
      const payload = (r.payload ?? {}) as ParsedLead;
      const payloadServices = Array.isArray(payload.services) ? payload.services.slice(0, 40) : [];
      // Если в данных нет услуг (источник их не отдаёт) — подставляем типовой прайс ниши.
      const services = payloadServices.length > 0
        ? payloadServices
        : nicheDefaults.map((s) => ({ name: s.name, price: s.price, duration_minutes: s.duration }));

      const { data: ins, error } = await db
        .from('businesses')
        .insert({
          name: r.name,
          slug,
          description: payload.description ? String(payload.description) : `${r.name} — онлайн-запись`,
          status: 'client',
          subscription_active: true,
          subscription_until: '2099-12-31',
          brand_color: theme.accent,
          phones: r.phone ? [r.phone] : [],
          emails: r.email ? [r.email] : [],
          address: r.address ?? null,
          city: r.city ?? null,
          working_hours: DEFAULT_HOURS,
          vertical_template_id: templateId,
          custom_texts: { hero_title: r.name },
          timezone: 'Europe/Moscow',
          rating: payload.rating != null ? Number(payload.rating) : null,
          reviews_count: payload.reviews != null ? Number(payload.reviews) : null,
        })
        .select('id')
        .single();
      if (error || !ins) throw new Error(error?.message ?? 'business insert failed');
      const businessId = ins.id as string;

      if (services.length > 0) {
        await db.from('services').insert(
          services.map((s, i) => ({
            business_id: businessId,
            name: String(s.name ?? 'Услуга'),
            price: Number(s.price ?? 0) || 0,
            duration_minutes: Number(s.duration_minutes ?? 60) || 60,
            is_active: true,
            sort_order: i,
          })),
        );
      }

      // Все фото строки; если их нет / все плохие / выбрана обложка — первой ставим обложку.
      const photoUrls = Array.isArray(payload.photo_urls) && payload.photo_urls.length > 0
        ? payload.photo_urls.map(String).filter(Boolean)
        : (payload.photo_url ? [String(payload.photo_url)] : []);
      const useCover = payload.use_cover === true || photoUrls.length === 0 || payload.photo_bad === true;
      const photosToInsert: { url: string; is_main: boolean; sort_order: number }[] = [];
      if (useCover) photosToInsert.push({ url: `/media/covers/${niche}.svg`, is_main: true, sort_order: 0 });
      photoUrls.slice(0, 12).forEach((url, index) => {
        photosToInsert.push({ url, is_main: !useCover && index === 0, sort_order: useCover ? index + 1 : index });
      });
      if (photosToInsert.length === 0) photosToInsert.push({ url: `/media/covers/${niche}.svg`, is_main: true, sort_order: 0 });
      await db.from('photos').insert(
        photosToInsert.map((item) => ({ business_id: businessId, url: item.url, alt: r.name, sort_order: item.sort_order, is_main: item.is_main })),
      );

      await db.from('ready_services').update({ business_id: businessId, slug, updated_at: new Date().toISOString() }).eq('id', r.id);
      generated += 1;
      urls.push(`/${niche}/${slug}`);
    } catch {
      failed += 1;
    }
  };

  const CONCURRENCY = 5;
  for (let i = 0; i < prepared.length; i += CONCURRENCY) {
    await Promise.all(prepared.slice(i, i + CONCURRENCY).map(processRow));
  }

  return { generated, failed, urls };
}

// ---------- кабинет партнёра ----------
function needsOutcome(r: ReadyService): boolean {
  if (r.assignment_status !== 'in_process' || !r.taken_at) return false;
  return Date.now() - Date.parse(r.taken_at) > OVERDUE_DAYS * 24 * 60 * 60 * 1000;
}

export async function listPartnerReadyServices(partnerId: string): Promise<{
  available: ReadyService[];
  mine: ReadyService[];
  overdue: ReadyService[];
  inProcessCount: number;
}> {
  const db = adminClient() as any;
  try {
    const [avail, mine] = await Promise.all([
      db.from('ready_services').select('*').eq('status', 'approved').eq('assignment_status', 'available').not('business_id', 'is', null).order('created_at', { ascending: false }).limit(300),
      db.from('ready_services').select('*').eq('assigned_partner_id', partnerId).in('assignment_status', ['in_process', 'written']).order('taken_at', { ascending: false }).limit(100),
    ]);
    const available = (avail.data ?? []) as ReadyService[];
    const mineRows = (mine.data ?? []) as ReadyService[];
    const inProcessCount = mineRows.filter((r) => r.assignment_status === 'in_process').length;
    return {
      available,
      mine: mineRows,
      overdue: mineRows.filter(needsOutcome),
      inProcessCount,
    };
  } catch {
    return { available: [], mine: [], overdue: [], inProcessCount: 0 };
  }
}

export async function takeReadyService(partnerId: string, id: string): Promise<void> {
  const db = adminClient() as any;
  const { data: partner } = await db.from('partners').select('status').eq('id', partnerId).maybeSingle();
  if (!partner) throw new Error('Партнёр не найден');
  if (partner.status === 'blocked') throw new Error('Аккаунт заблокирован');

  const { count } = await db
    .from('ready_services')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_partner_id', partnerId)
    .eq('assignment_status', 'in_process');
  if ((count ?? 0) >= MAX_IN_PROCESS) {
    throw new Error(`Лимит: не более ${MAX_IN_PROCESS} сервисов в процессе. Завершите текущие.`);
  }

  const { data: svc } = await db.from('ready_services').select('*').eq('id', id).maybeSingle();
  if (!svc) throw new Error('Сервис не найден');
  if (svc.status !== 'approved') throw new Error('Сервис ещё не одобрен');
  if (svc.assignment_status !== 'available' || svc.assigned_partner_id) throw new Error('Сервис уже взят');

  await db.from('ready_services').update({
    assigned_partner_id: partnerId,
    assignment_status: 'in_process',
    taken_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export async function setPartnerOutcome(partnerId: string, id: string, outcome: PartnerOutcome): Promise<void> {
  const db = adminClient() as any;
  const { data: svc } = await db.from('ready_services').select('*').eq('id', id).maybeSingle();
  if (!svc) throw new Error('Сервис не найден');
  if (svc.assigned_partner_id !== partnerId) throw new Error('Сервис закреплён не за вами');
  if (svc.assignment_status !== 'in_process') throw new Error('Сервис уже не в процессе');

  if (outcome === 'written') {
    await db.from('ready_services').update({ assignment_status: 'written', updated_at: new Date().toISOString() }).eq('id', id);
    return;
  }
  const patch: Record<string, unknown> = {
    assignment_status: 'available',
    assigned_partner_id: null,
    taken_at: null,
    last_outcome: outcome,
    updated_at: new Date().toISOString(),
  };
  if (outcome === 'refused') patch.refusal_count = Number(svc.refusal_count ?? 0) + 1;
  else patch.no_answer_count = Number(svc.no_answer_count ?? 0) + 1;
  await db.from('ready_services').update(patch).eq('id', id);
}

// ---------- админ: партнёрские аккаунты ----------
export interface PartnerAccountRow {
  id: string;
  name: string | null;
  email: string;
  referral_code: string;
  status: string;
  createdAt: string | null;
  leadsCount: number;
  checkoutsCount: number;
  paidCount: number;
  earningsAccrued: number;
  balance: number;
  inProcess: number;
  messages: number;
}

export async function listPartnerAccounts(): Promise<PartnerAccountRow[]> {
  const db = adminClient() as any;
  const base = await listAllPartnersOverview();
  const ids = base.map((b) => b.id);
  if (ids.length === 0) return [];

  const [{ data: payouts }, { data: assigned }, { data: partners }, { data: msgs }] = await Promise.all([
    db.from('partner_payouts').select('partner_id, amount').in('partner_id', ids),
    db.from('ready_services').select('assigned_partner_id, assignment_status').in('assigned_partner_id', ids).eq('assignment_status', 'in_process'),
    db.from('partners').select('id, status, created_at').in('id', ids),
    db.from('partner_messages').select('partner_id').in('partner_id', ids),
  ]);

  const payoutSum = new Map<string, number>();
  for (const p of (payouts ?? []) as { partner_id: string; amount: number }[]) {
    payoutSum.set(p.partner_id, (payoutSum.get(p.partner_id) ?? 0) + Number(p.amount));
  }
  const inProc = new Map<string, number>();
  for (const a of (assigned ?? []) as { assigned_partner_id: string }[]) {
    inProc.set(a.assigned_partner_id, (inProc.get(a.assigned_partner_id) ?? 0) + 1);
  }
  const statusMap = new Map<string, string>();
  const createdMap = new Map<string, string | null>();
  for (const p of (partners ?? []) as { id: string; status: string; created_at: string | null }[]) {
    statusMap.set(p.id, p.status);
    createdMap.set(p.id, p.created_at);
  }
  const msgCount = new Map<string, number>();
  for (const m of (msgs ?? []) as { partner_id: string }[]) msgCount.set(m.partner_id, (msgCount.get(m.partner_id) ?? 0) + 1);

  return base.map((b) => {
    const accrued = Number(b.earningsAccrued ?? 0);
    return {
      id: b.id,
      name: b.name ?? null,
      email: b.email,
      referral_code: b.referral_code,
      status: statusMap.get(b.id) ?? 'active',
      createdAt: createdMap.get(b.id) ?? null,
      leadsCount: b.leadsCount,
      checkoutsCount: b.checkoutsCount,
      paidCount: b.paidCount,
      earningsAccrued: accrued,
      balance: accrued + (payoutSum.get(b.id) ?? 0),
      inProcess: inProc.get(b.id) ?? 0,
      messages: msgCount.get(b.id) ?? 0,
    };
  });
}

export async function updatePartnerName(id: string, name: string): Promise<void> {
  const db = adminClient() as any;
  await db.from('partners').update({ name: name.trim() || null, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function setPartnerBanned(id: string, banned: boolean): Promise<void> {
  const db = adminClient() as any;
  await db.from('partners').update({ status: banned ? 'blocked' : 'active', updated_at: new Date().toISOString() }).eq('id', id);
}

export async function adjustPartnerMoney(id: string, amount: number, kind: 'bonus' | 'payout' | 'adjust', note?: string): Promise<void> {
  const db = adminClient() as any;
  await db.from('partner_payouts').insert({ partner_id: id, amount, kind, note: note?.trim() || null });
}

export async function sendPartnerMessage(id: string, body: string): Promise<void> {
  const db = adminClient() as any;
  await db.from('partner_messages').insert({ partner_id: id, body: body.trim(), from_admin: true });
}

export async function listPartnerMessages(id: string): Promise<{ id: string; body: string; from_admin: boolean; created_at: string }[]> {
  const db = adminClient() as any;
  try {
    const { data } = await db.from('partner_messages').select('*').eq('partner_id', id).order('created_at', { ascending: false }).limit(100);
    return (data ?? []) as { id: string; body: string; from_admin: boolean; created_at: string }[];
  } catch {
    return [];
  }
}

/**
 * Право партнёра править готовый сервис: сервис одобрен платформой и либо ещё свободен,
 * либо закреплён за этим партнёром. Без проверки любой авторизованный партнёр мог бы
 * подменить фото чужого сервиса, просто передав его id (IDOR).
 * Чистая функция — решение проверяется юнит-тестами, БД здесь не нужна.
 */
export type ReadyAccessRow = {
  status: string;
  assignment_status: string;
  assigned_partner_id: string | null;
};

export function canPartnerEditReady(
  partner: { status: string } | null,
  svc: ReadyAccessRow | null,
  partnerId: string,
): string | null {
  if (!partner || partner.status === 'blocked') return 'Аккаунт заблокирован';
  if (!svc) return 'Сервис не найден';
  if (svc.status !== 'approved') return 'Сервис ещё не одобрен';
  const free = svc.assignment_status === 'available' && !svc.assigned_partner_id;
  const mine = svc.assigned_partner_id === partnerId;
  if (!free && !mine) return 'Сервис закреплён за другим партнёром';
  return null;
}

async function assertPartnerReadyAccess(db: any, partnerId: string, id: string): Promise<void> {
  const { data: partner, error: partnerError } = await db
    .from('partners').select('status').eq('id', partnerId).maybeSingle();
  if (partnerError) throw new Error('Не удалось проверить доступ');

  const { data: svc, error } = await db
    .from('ready_services')
    .select('status, assignment_status, assigned_partner_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Не удалось проверить сервис');

  const denied = canPartnerEditReady(partner, svc, partnerId);
  if (denied) throw new Error(denied);
}

// ---------- фото готового сервиса: выбор партнёром ----------
//
// Партнёр видит все фото сервиса (из выгрузки парсера) плюс шаблонную обложку ниши
// и выбирает, что попадёт на сайт. Порядок = порядок в галерее, первый — обложка.

export type ReadyPhotoOptions = {
  /** Что стоит на сайте сейчас. */
  current: { url: string; alt: string | null }[];
  /** Из чего выбирать: фото сервиса из выгрузки + обложка ниши. */
  candidates: { url: string; label: string }[];
};

export function photoCandidates(row: { niche: string; payload: Record<string, unknown> | null }): { url: string; label: string }[] {
  const payload = (row.payload ?? {}) as { photo_urls?: unknown; photo_url?: unknown };
  const urls: string[] = [];
  if (Array.isArray(payload.photo_urls)) {
    for (const item of payload.photo_urls) {
      const url = String(item ?? '').trim();
      if (url) urls.push(url);
    }
  }
  if (typeof payload.photo_url === 'string' && payload.photo_url.trim()) urls.unshift(payload.photo_url.trim());
  const unique = [...new Set(urls)];
  const list = unique.map((url, i) => ({ url, label: i === 0 ? 'Фото сервиса (главное)' : `Фото сервиса ${i + 1}` }));
  list.push({ url: `/media/covers/${row.niche}.svg`, label: 'Шаблонная обложка' });
  return list;
}

export async function listReadyPhotos(partnerId: string, id: string): Promise<ReadyPhotoOptions> {
  const db = adminClient() as any;
  await assertPartnerReadyAccess(db, partnerId, id);
  const { data: row } = await db.from('ready_services').select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Сервис не найден');
  const { data: photos } = row.business_id
    ? await db.from('photos').select('url, alt, sort_order').eq('business_id', row.business_id).order('sort_order')
    : { data: [] };
  return {
    current: ((photos ?? []) as { url: string; alt: string | null }[]).map((p) => ({ url: p.url, alt: p.alt })),
    candidates: photoCandidates(row),
  };
}

/** Заменяет галерею сайта выбранными фото (первое становится обложкой). */
export async function setReadyPhotos(partnerId: string, id: string, urls: string[]): Promise<{ niche: string; slug: string }> {
  const db = adminClient() as any;
  await assertPartnerReadyAccess(db, partnerId, id);
  const { data: row } = await db.from('ready_services').select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Сервис не найден');
  if (!row.business_id) throw new Error('Сайт ещё не сгенерирован');

  const allowed = new Set(photoCandidates(row).map((c) => c.url));
  const clean = [...new Set(urls.map((u) => String(u ?? '').trim()).filter((u) => u && allowed.has(u)))].slice(0, 20);
  if (clean.length === 0) throw new Error('Выберите хотя бы одно фото');

  // Порядок важен: сначала вставляем новые, потом удаляем старые. Раньше было наоборот —
  // при сбое INSERT галерея исчезала целиком, хотя экшен отвечал «успех». Теперь неудачная
  // замена оставляет прежние фото на месте. Уникального индекса на (business_id, sort_order)
  // в схеме нет (только обычный idx_photos_business_sort), поэтому пересечение безопасно.
  const { data: existing } = await db.from('photos').select('id').eq('business_id', row.business_id);
  const oldIds = ((existing ?? []) as { id: string }[]).map((p) => p.id);

  const { error: insertError } = await db.from('photos').insert(
    clean.map((url, index) => ({ business_id: row.business_id, url, alt: row.name, sort_order: index, is_main: index === 0 })),
  );
  if (insertError) throw new Error('Не удалось сохранить фото');

  if (oldIds.length > 0) {
    const { error: deleteError } = await db.from('photos').delete().in('id', oldIds);
    // Дубли хуже потери: сайт покажет и старое, и новое, но данные не исчезнут. Сообщаем явно.
    if (deleteError) throw new Error('Новые фото добавлены, но старые не удалились — обновите страницу');
  }
  await db.from('ready_services').update({ payload: { ...(row.payload ?? {}), use_cover: false }, updated_at: new Date().toISOString() }).eq('id', id);
  return { niche: row.niche, slug: row.slug };
}

// ---------- текст для первого сообщения ----------
//
// Готовое сообщение, которое партнёр копирует одной кнопкой. Шаблон можно переопределить
// в настройках (settings.outreach_template:<ниша>), подстановки — {name}, {city}, {niche}, {link}, {partner}.

const DEFAULT_OUTREACH =
  'Здравствуйте! Это «{name}»? Меня зовут {partner}. Я помогаю бизнесу в нише «{niche}» получать записи без звонков — делаю сайт с онлайн-записью. Для вас уже готов вариант: {link} Посмотрите, пожалуйста, 30 секунд. Если понравится — подключу и покажу, как это работает.';

export async function outreachText(input: {
  name: string;
  city: string | null;
  niche: string;
  slug: string;
  siteUrl: string;
  partnerName: string | null;
}): Promise<string> {
  const { data } = await adminClient()
    .from('settings')
    .select('value')
    .eq('key', `outreach_template:${input.niche}`)
    .maybeSingle();
  const custom = (data as { value?: { text?: string } } | null)?.value?.text;
  const template = (custom && custom.trim()) || DEFAULT_OUTREACH;
  return template
    .replace(/\{name\}/g, input.name)
    .replace(/\{city\}/g, input.city ?? '')
    .replace(/\{niche\}/g, input.niche)
    .replace(/\{link\}/g, input.siteUrl)
    .replace(/\{partner\}/g, input.partnerName ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Тексты первых сообщений для набора сервисов: одна выборка шаблонов на все ниши списка. */
export async function outreachForRows(
  rows: { id: string; name: string; city: string | null; niche: string; slug: string }[],
  partnerName: string | null,
  siteUrl: string,
): Promise<Record<string, string>> {
  const niches = [...new Set(rows.map((r) => r.niche))];
  const { data } = await adminClient()
    .from('settings')
    .select('key, value')
    .in('key', niches.map((n) => `outreach_template:${n}`));
  const templates = new Map<string, string>();
  for (const row of (data ?? []) as { key: string; value?: { text?: string } }[]) {
    const niche = row.key.replace('outreach_template:', '');
    if (row.value?.text?.trim()) templates.set(niche, row.value.text.trim());
  }

  const out: Record<string, string> = {};
  for (const r of rows) {
    const template = templates.get(r.niche) ?? DEFAULT_OUTREACH;
    out[r.id] = template
      .replace(/\{name\}/g, r.name)
      .replace(/\{city\}/g, r.city ?? '')
      .replace(/\{niche\}/g, r.niche)
      .replace(/\{link\}/g, `${siteUrl}/${r.niche}/${r.slug}`)
      .replace(/\{partner\}/g, partnerName ?? '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return out;
}
