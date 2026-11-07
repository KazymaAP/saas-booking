// lib/import2gis-apply.ts — запись кандидатов в БД: сопоставление с существующими, подбор slug, пачки по 100 с retry.
import { type Candidate, indexExisting, matchExisting, safePatch, toNewBusiness, verticalFor } from './import2gis-parse';
import type { ImportStore, NewBusiness, SafePatch, StoreError, WriteResult } from './import2gis-store';
import { chunk, withRetry, type RetryOptions } from './retry';
import { pickUniqueSlug, slugify } from './slug';

export const BATCH_SIZE = 100;
export const MAX_ERROR_MESSAGES = 50;
// Нет уникального индекса под ON CONFLICT (миграция 0003 не применена) — откат на конфликт по slug.
const NO_UNIQUE_INDEX = '42P10';
// Ошибки данных (нарушение ограничений, неверный тип) — повтор не поможет.
const NON_RETRYABLE_CODE = /^(22|23|42)/;
// unique_violation: при ON CONFLICT (source_2gis_url) конфликт по slug не гасится — slug занял параллельный импорт.
const UNIQUE_VIOLATION = '23505';

export type ApplyStats = { created: number; updated: number; unchanged: number; errors: string[] };

export function pushError(stats: { errors: string[] }, message: string): void {
  if (stats.errors.length < MAX_ERROR_MESSAGES) stats.errors.push(message.slice(0, 300));
}

class BatchError extends Error {
  readonly code?: string;
  constructor(e: StoreError) {
    super(e.message);
    this.code = e.code;
  }
}

const retryable = (e: unknown): boolean => !(e instanceof BatchError && e.code && NON_RETRYABLE_CODE.test(e.code));

async function writeWithRetry<R extends WriteResult>(op: () => Promise<R>, retry: RetryOptions): Promise<R> {
  return withRetry(async () => {
    const res = await op();
    if (res.error) throw new BatchError(res.error);
    return res;
  }, { ...retry, shouldRetry: retryable });
}

const errorCode = (e: unknown): string | undefined => (e instanceof BatchError ? e.code : undefined);
const errText = (e: unknown): string => (e instanceof Error ? e.message : 'ошибка');

// Вставка одной части пачки. Особые случаи:
// 42P10 — нет уникального индекса source_2gis_url (0003 не применена): повтор с ON CONFLICT (slug);
// 23505 — slug успел занять параллельный импорт: переподбираем slug для этой части и пробуем ещё раз.
// reserved — slug остальных строк импорта: новый slug не должен совпасть с ещё не вставленными.
type Part = { rows: NewBusiness[]; column: 'source_2gis_url' | 'slug'; reserved: ReadonlySet<string> };

async function insertPart(store: ImportStore, part: Part, retry: RetryOptions): Promise<WriteResult & { column: Part['column'] }> {
  const { rows, column } = part;
  try {
    return { ...(await writeWithRetry(() => store.insertBatch(rows, column), retry)), column };
  } catch (e) {
    if (errorCode(e) === NO_UNIQUE_INDEX && column === 'source_2gis_url') return insertPart(store, { ...part, column: 'slug' }, retry);
    if (errorCode(e) !== UNIQUE_VIOLATION || column !== 'source_2gis_url') throw e;
    // Свои slug этой части не резервируем: свободные из них подтвердит БД, занятые она же и отсеет.
    const own = new Set(rows.map((r) => r.slug));
    const slugs = await assignSlugs(store, rows.map((r) => r.name), new Set([...part.reserved].filter((s) => !own.has(s))));
    const res = await writeWithRetry(() => store.insertBatch(rows.map((r, i) => ({ ...r, slug: slugs[i] })), column), retry);
    return { ...res, column };
  }
}

async function insertAll(store: ImportStore, rows: NewBusiness[], stats: ApplyStats, retry: RetryOptions): Promise<void> {
  const reserved = new Set(rows.map((r) => r.slug));
  for (const batch of chunk(rows, BATCH_SIZE)) {
    const withUrl = batch.filter((r) => r.source_2gis_url);
    const withoutUrl = batch.filter((r) => !r.source_2gis_url);
    for (const [part, column] of [[withUrl, 'source_2gis_url'], [withoutUrl, 'slug']] as const) {
      if (part.length === 0) continue;
      try {
        const res = await insertPart(store, { rows: part, column, reserved }, retry);
        stats.created += res.written;
        const skipped = part.length - res.written;
        // По 2GIS URL пропуск значит «эту фирму только что создал параллельный импорт» — это не потеря.
        // По slug пропуск значит «slug заняли» — строка не записана, повторный импорт её добавит.
        if (res.column === 'source_2gis_url') stats.unchanged += skipped;
        else if (skipped > 0) pushError(stats, `Вставка: ${skipped} строк пропущено (slug занят параллельно), запустите импорт ещё раз`);
      } catch (e) {
        pushError(stats, `Вставка ${part.length} строк: ${errText(e)}`);
      }
    }
  }
}

async function updateAll(store: ImportStore, rows: SafePatch[], stats: ApplyStats, retry: RetryOptions): Promise<void> {
  for (const batch of chunk(rows, BATCH_SIZE)) {
    try {
      stats.updated += (await writeWithRetry(() => store.updateBatch(batch), retry)).written;
    } catch (e) {
      pushError(stats, `Обновление ${batch.length} строк: ${errText(e)}`);
    }
  }
}

// Сколько раз переподбираем slug, если суффиксные варианты нашлись в чужом slug_history.
const MAX_SLUG_ROUNDS = 5;

// Подбор slug для всей пачки: 2 запроса на 100 имён вместо одного запроса на каждый кандидат.
async function assignSlugs(store: ImportStore, names: readonly string[], reserved: ReadonlySet<string> = new Set()): Promise<string[]> {
  const roots = names.map(slugify);
  const blocked = new Set<string>(reserved);
  for (const part of chunk([...new Set(roots)], BATCH_SIZE)) {
    (await store.loadTakenSlugs(part)).forEach((s) => blocked.add(s));
    (await store.findSlugConflicts(part)).forEach((s) => blocked.add(s));
  }
  for (let round = 0; round < MAX_SLUG_ROUNDS; round++) {
    // Каждый раунд — с нуля по порядку строк: одинаковые названия получают -2, -3 ... без «дыр» и перестановок.
    const taken = new Set(blocked);
    const slugs = names.map((name) => pickUniqueSlug(name, taken));
    // Выданные суффиксные slug могли оказаться в чужом slug_history — проверяем и переподбираем.
    const conflicts = await store.findSlugConflicts(slugs.filter((s, i) => s !== roots[i] && !blocked.has(s)));
    if (conflicts.size === 0) return slugs;
    conflicts.forEach((s) => blocked.add(s));
  }
  throw new Error('Не удалось подобрать уникальные slug: слишком много конфликтов в slug_history');
}

export async function applyCandidates(store: ImportStore, unique: readonly Candidate[], stats: ApplyStats, retry: RetryOptions = {}): Promise<void> {
  const urls = unique.flatMap((c) => (c.source_2gis_url ? [c.source_2gis_url] : []));
  const phones = unique.flatMap((c) => (c.phones[0] ? [c.phones[0]] : []));
  const [templates, existing] = await Promise.all([
    withRetry(() => store.loadTemplates(), retry),
    withRetry(() => store.findExisting(urls, phones), retry),
  ]);
  const { byUrl, byPhone } = indexExisting(existing);
  const patches = new Map<string, SafePatch>();
  const fresh: Candidate[] = [];
  for (const c of unique) {
    const hit = matchExisting(c, byUrl, byPhone);
    if (!hit) {
      fresh.push(c);
      continue;
    }
    // Две строки файла указывают на одну запись БД — накапливаем изменения в одном патче.
    const base = patches.get(hit.id);
    const patch = safePatch(base ? { ...hit, ...base } : hit, c);
    if (patch) patches.set(hit.id, patch);
    else if (!base) stats.unchanged++;
  }
  const slugs = await withRetry(() => assignSlugs(store, fresh.map((c) => c.name)), retry);
  const rows = fresh.map((c, i) => {
    const vertical = verticalFor(c.category);
    return toNewBusiness(c, slugs[i], vertical ? templates.get(vertical) ?? null : null);
  });
  await insertAll(store, rows, stats, retry);
  await updateAll(store, [...patches.values()], stats, retry);
}
