'use server';
// app/panel/(protected)/funnel/actions.ts — действия воронки (ТЗ §13.2, шаги 1–4).
// Перенесено из app/panel/(protected)/actions.ts (импортировалось только воронкой).
// Каждое действие: requireSuperAdmin → zod → один UPDATE … RETURNING id → auditMany → revalidatePath.
// UPDATE с условием на текущий статус делает операцию идемпотентной: повторный клик ничего не ломает,
// а строки, которые уже сменили статус, попадают в отчёт как «пропущено».
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { generatePrototype } from '@/lib/generate';
import { queueApproved } from '@/lib/outreach';
import { audit, auditMany } from '@/lib/audit';
import { errorMessage, logError } from '@/lib/log';
import type { Business, BusinessStatus, VerticalTemplate } from '@/lib/database.types';
import { bulkReport, fail, guarded, guardedBulk, ok, uuid, type ActionResult, type BulkResult } from '../_lib/action';
import { GENERATE_CHUNK, GENERATE_MAX } from './constants';

const FUNNEL_PATH = '/panel/funnel';

type Transition = { from: BusinessStatus; to: BusinessStatus; action: string; verb: string; patch?: Record<string, unknown> };

// Переход статуса пачкой: ровно один UPDATE … WHERE id IN (…) AND status = from RETURNING id.
async function transition(ids: string[], t: Transition): Promise<BulkResult> {
  const { data, error } = await adminClient()
    .from('businesses')
    .update({ status: t.to, ...t.patch })
    .in('id', ids)
    .eq('status', t.from)
    .select('id');
  if (error) throw new Error(error.message);
  const done = (data ?? []).map((r: { id: string }) => r.id);
  await auditMany(t.action, 'business', done, { from: t.from, to: t.to });
  revalidatePath(FUNNEL_PATH);
  return bulkReport(t.verb, done, ids);
}

// Шаг 1: «В работу» — new → in_progress.
export async function moveToInProgress(ids: string[]): Promise<BulkResult> {
  return await guardedBulk('funnel.move_to_in_progress', ids, (list) =>
    transition(list, { from: 'new', to: 'in_progress', action: 'funnel_in_progress', verb: 'Взято в работу' }),
  );
}

// Шаг 3: «Одобрить» — preview_ready → approved.
export async function approveSelected(ids: string[]): Promise<BulkResult> {
  return await guardedBulk('funnel.approve', ids, (list) =>
    transition(list, { from: 'preview_ready', to: 'approved', action: 'funnel_approve', verb: 'Одобрено' }),
  );
}

// Шаг 3: «На доработку» — preview_ready → in_progress. ТЗ §3.5: старая ссылка прототипа перестаёт работать
// (токен сбрасывается; новый уникальный токен выдаст генератор при повторной генерации).
export async function sendBackForRework(ids: string[]): Promise<BulkResult> {
  return await guardedBulk('funnel.rework', ids, (list) =>
    transition(list, {
      from: 'preview_ready',
      to: 'in_progress',
      action: 'funnel_rework',
      verb: 'Отправлено на доработку',
      patch: { preview_token: null, preview_url: null },
    }),
  );
}

type GenRow = Business & { vertical_templates: VerticalTemplate | null };

// Шаг 2: генерация пачки до GENERATE_CHUNK прототипов. Один SELECT с join шаблона ниши (без N+1),
// генерация параллельно; ошибка одного бизнеса не валит остальные — попадает в отчёт и журнал ошибок.
export async function generateBatch(ids: string[]): Promise<BulkResult> {
  return await guardedBulk('funnel.generate', ids, async (list) => {
    const chunk = list.slice(0, GENERATE_CHUNK);
    const { data, error } = await adminClient()
      .from('businesses')
      .select('*, vertical_templates(*)')
      .in('id', chunk)
      .eq('status', 'in_progress')
      .returns<GenRow[]>();
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const results = await Promise.allSettled(rows.map((b) => generatePrototype(b, b.vertical_templates)));
    const done: string[] = [];
    const failures: Promise<boolean>[] = [];
    results.forEach((r, i) => {
      const id = rows[i]?.id;
      if (!id) return;
      if (r.status === 'fulfilled') done.push(id);
      else failures.push(logError('generate', errorMessage(r.reason), { business: id }));
    });
    await Promise.all([...failures, auditMany('funnel_generate', 'business', done, { to: 'preview_ready' })]);
    return bulkReport('Сгенерировано', done, chunk);
  });
}

export type GenerationProgress = { ready: string[]; waiting: string[] };

const progressIds = z.array(uuid).max(GENERATE_MAX);

// Опрос прогресса раз в 2 секунды (ТЗ §13.2 шаг 2): реальный статус из БД, один SELECT.
export async function generationProgress(ids: string[]): Promise<ActionResult<GenerationProgress>> {
  return await guarded('funnel.progress', async () => {
    const parsed = progressIds.safeParse(ids);
    if (!parsed.success || parsed.data.length === 0) return ok('', { ready: [], waiting: [] });
    const { data, error } = await adminClient().from('businesses').select('id, status').in('id', parsed.data);
    if (error) throw new Error(error.message);
    const ready = new Set((data ?? []).filter((r: { status: string }) => r.status !== 'in_progress').map((r: { id: string }) => r.id));
    return ok('', { ready: parsed.data.filter((id) => ready.has(id)), waiting: parsed.data.filter((id) => !ready.has(id)) });
  });
}

const queueSchema = z.object({ template_id: z.union([z.literal(''), uuid]).default('') });

// Шаг 4: поставить все одобренные в очередь отправки (cron send-emails шлёт по одному, ТЗ §9).
export async function queueOutreach(_prev: ActionResult<{ queued: number }> | null, formData: FormData): Promise<ActionResult<{ queued: number }>> {
  return await guarded('funnel.queue', async () => {
    const parsed = queueSchema.safeParse({ template_id: formData.get('template_id') ?? '' });
    if (!parsed.success) return fail('Шаблон не найден');
    const templateId = parsed.data.template_id || undefined;
    const queued = await queueApproved(templateId);
    await audit('funnel_queue', 'outreach', templateId ?? null, { queued, template: templateId ?? 'default' });
    revalidatePath(FUNNEL_PATH);
    if (queued === 0) return fail('Нечего отправлять: нет одобренных с email или все уже в очереди');
    return ok(`В очередь поставлено писем: ${queued}`, { queued });
  });
}
