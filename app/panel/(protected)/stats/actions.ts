'use server';
// app/panel/(protected)/stats/actions.ts — ручной пересчёт статистики (кнопка «Пересчитать»). Права — guarded.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { fail, guarded, ok, type ActionResult } from '../_lib/action';
import { PERIODS, getStats } from './compute';

const periodSchema = z.coerce.number().refine((n): n is (typeof PERIODS)[number] => (PERIODS as readonly number[]).includes(n));

export async function refreshStats(_prev: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return await guarded('stats.refresh', async () => {
    const p = periodSchema.safeParse(formData.get('period'));
    if (!p.success) return fail('Неизвестный период');
    const { snapshot } = await getStats(p.data, true);
    await audit('stats_refresh', 'settings', `stats_cache_${p.data}`, { period: p.data });
    revalidatePath('/panel/stats');
    return ok(`Пересчитано: ${new Date(snapshot.computed_at).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' })}`, null);
  });
}
