'use server';
// app/panel/(protected)/actions.ts — действия воронки (ТЗ §5.4, шаги 1–4).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { generatePrototype } from '@/lib/generate';
import { logError } from '@/lib/log';
import type { Business, VerticalTemplate } from '@/lib/database.types';

const MAX_PER_RUN = 20;

function ids(formData: FormData): string[] {
  return formData.getAll('ids').map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
}

// Шаг 1: «В работу» — new → in_progress
export async function moveToInProgress(formData: FormData) {
  const list = ids(formData);
  if (list.length === 0) return;
  await adminClient().from('businesses').update({ status: 'in_progress' }).in('id', list).eq('status', 'new');
  revalidatePath('/panel/funnel');
}

// Шаг 2: один бизнес за вызов. Прогресс-бар на клиенте вызывает это по очереди (замена polling без фоновой очереди).
export async function generateOne(id: string): Promise<{ ok: boolean; url?: string; reason?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, reason: 'id' };
  const db = adminClient();
  const { data: b } = await db.from('businesses').select('*').eq('id', id).maybeSingle();
  if (!b || b.status !== 'in_progress') return { ok: false, reason: 'status' };
  let template: VerticalTemplate | null = null;
  if (b.vertical_template_id) {
    const { data } = await db.from('vertical_templates').select('*').eq('id', b.vertical_template_id).maybeSingle();
    template = (data as VerticalTemplate | null) ?? null;
  }
  try {
    const url = await generatePrototype(b as Business, template);
    return { ok: true, url };
  } catch (e) {
    await logError('generate', (e as Error).message, { business: id });
    return { ok: false, reason: 'error' };
  }
}

// Шаг 2 (старый вариант, пакетом до 20): оставлен для совместимости со страницей.
export async function generateForSelected(formData: FormData) {
  const list = ids(formData).slice(0, MAX_PER_RUN);
  for (const id of list) await generateOne(id);
  revalidatePath('/panel/funnel');
}

// Шаг 3: одобрить прототип: preview_ready → approved
export async function approveSelected(formData: FormData) {
  const list = ids(formData);
  if (list.length === 0) return;
  await adminClient().from('businesses').update({ status: 'approved' }).in('id', list).eq('status', 'preview_ready');
  revalidatePath('/panel/funnel');
}

// Шаг 3: на доработку: preview_ready → in_progress
export async function sendBackForRework(formData: FormData) {
  const list = ids(formData);
  if (list.length === 0) return;
  await adminClient().from('businesses').update({ status: 'in_progress' }).in('id', list).eq('status', 'preview_ready');
  revalidatePath('/panel/funnel');
}

// Шаг 4: поставить одобренные в очередь (cron send-emails отправляет по одному). Шаблон — из templates.
export async function queueOutreach(formData: FormData) {
  const { queueApproved } = await import('@/lib/outreach');
  const tpl = String(formData.get('template_id') ?? '');
  await queueApproved(/^[0-9a-f-]{36}$/i.test(tpl) ? tpl : undefined);
  revalidatePath('/panel/funnel');
}
