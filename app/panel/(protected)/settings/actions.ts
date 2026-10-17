'use server';
// app/panel/(protected)/settings/actions.ts — настройки платформы: реквизиты, тарифы, цены, rate limit, флаги (ТЗ §13.1, §15.5).
// Каждое действие: права (guarded) → zod → чтение старого значения + upsert → audit с перечнем изменённых полей.
// Реквизиты — персональные данные оператора: в audit пишутся только имена полей, без значений.
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { guarded, ok, zodFail, type ActionResult } from '../_lib/action';
import {
  changedPaths,
  defaultPriceSchema,
  flagsSchema,
  rateLimitsSchema,
  REQUISITE_FIELDS,
  requisitesSchema,
  tariffsSchema,
  type SettingsKey,
} from './schema';

const PATH = '/panel/settings';
type Result = ActionResult<{ changed: string[] }>;

// Сохранение ключа. Одинаковое значение не пишется и не попадает в audit (повторное нажатие «Сохранить»).
async function saveKey(key: SettingsKey, value: Record<string, unknown>, withValues: boolean): Promise<Result> {
  const db = adminClient();
  const { data: prev, error: readErr } = await db.from('settings').select('value').eq('key', key).maybeSingle<{ value: unknown }>();
  if (readErr) throw new Error(readErr.message);
  const changed = changedPaths(prev?.value ?? null, value);
  if (!changed.length) return ok('Изменений нет', { changed });
  const { error } = await db.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  // entityId — ключ настройки: не UUID, lib/audit перенесёт его в payload.ref.
  await audit('settings_save', 'settings', key, withValues ? { changed, value } : { changed });
  revalidatePath(PATH);
  return ok(`Сохранено. Изменено полей: ${changed.length}`, { changed });
}

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
}

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): { ok: true; data: z.output<S> } | { ok: false; res: Result } {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, res: zodFail(r.error) };
}

export async function saveRequisites(_prev: Result | null, fd: FormData): Promise<Result> {
  return await guarded('settings.requisites', async () => {
    const p = parse(requisitesSchema, Object.fromEntries(REQUISITE_FIELDS.map((k) => [k, field(fd, k)])));
    if (!p.ok) return p.res;
    return await saveKey('platform_requisites', p.data, false);
  });
}

export async function saveTariffs(_prev: Result | null, fd: FormData): Promise<Result> {
  return await guarded('settings.tariffs', async () => {
    const p = parse(tariffsSchema, {
      basic: { name: field(fd, 'basic.name'), price: field(fd, 'basic.price') },
      pro: { name: field(fd, 'pro.name'), price: field(fd, 'pro.price') },
    });
    if (!p.ok) return p.res;
    return await saveKey('tariffs', p.data, true);
  });
}

export async function saveDefaultPrice(_prev: Result | null, fd: FormData): Promise<Result> {
  return await guarded('settings.default_price', async () => {
    const p = parse(defaultPriceSchema, { initial: field(fd, 'initial'), monthly: field(fd, 'monthly') });
    if (!p.ok) return p.res;
    return await saveKey('default_price', p.data, true);
  });
}

export async function saveRateLimits(_prev: Result | null, fd: FormData): Promise<Result> {
  return await guarded('settings.rate_limits', async () => {
    const p = parse(rateLimitsSchema, { booking_per_10min: field(fd, 'booking_per_10min'), cancel_per_15min: field(fd, 'cancel_per_15min') });
    if (!p.ok) return p.res;
    return await saveKey('rate_limits', p.data, true);
  });
}

// Флаги: чекбоксы (снятый чекбокс в FormData отсутствует → false).
export async function saveFlags(_prev: Result | null, fd: FormData): Promise<Result> {
  return await guarded('settings.flags', async () => {
    const p = parse(flagsSchema, { ai_assistant: fd.get('ai_assistant') === '1', telegram_clients: fd.get('telegram_clients') === '1' });
    if (!p.ok) return p.res;
    return await saveKey('feature_flags', p.data, true);
  });
}
