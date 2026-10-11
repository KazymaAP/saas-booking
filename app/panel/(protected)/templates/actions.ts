'use server';
// app/panel/(protected)/templates/actions.ts — шаблоны писем: создание, правка с версией, откат, удаление (ТЗ §5.4 /panel/templates).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';

const UUID = /^[0-9a-f-]{36}$/i;

export async function saveTemplate(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const row = {
    name: String(formData.get('name') ?? '').trim().slice(0, 120),
    subject: String(formData.get('subject') ?? '').trim().slice(0, 200),
    body: String(formData.get('body') ?? '').slice(0, 8000),
    channel: 'email',
    active: true,
  };
  if (!row.name || !row.subject || !row.body) return;
  const db = adminClient();
  if (UUID.test(id)) {
    const { data: prev } = await db.from('templates').select('subject, body, version, history').eq('id', id).maybeSingle();
    if (prev) {
      const history = [...((prev.history as unknown[]) ?? []), { version: prev.version, subject: prev.subject, body: prev.body, saved_at: new Date().toISOString() }].slice(-20);
      await db.from('templates').update({ ...row, version: (prev.version ?? 1) + 1, history }).eq('id', id);
    }
    await audit('template_save', 'template', id, { name: row.name });
  } else {
    await db.from('templates').insert(row);
    await audit('template_create', 'template', null, { name: row.name });
  }
  revalidatePath('/panel/templates');
}

// Откат к версии из истории.
export async function restoreVersion(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const idx = Number(formData.get('index'));
  if (!UUID.test(id) || !Number.isInteger(idx)) return;
  const db = adminClient();
  const { data: t } = await db.from('templates').select('subject, body, version, history').eq('id', id).maybeSingle();
  const h = (t?.history as { subject: string; body: string }[]) ?? [];
  const v = h[idx];
  if (!t || !v) return;
  const history = [...h, { version: t.version, subject: t.subject, body: t.body, saved_at: new Date().toISOString() }].slice(-20);
  await db.from('templates').update({ subject: v.subject, body: v.body, version: (t.version ?? 1) + 1, history }).eq('id', id);
  await audit('template_restore', 'template', id, { index: idx });
  revalidatePath('/panel/templates');
}

export async function deleteTemplate(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('templates').delete().eq('id', id);
  await audit('template_delete', 'template', id, {});
  revalidatePath('/panel/templates');
}
