'use server';
// app/panel/(protected)/templates/actions.ts — шаблоны писем: создание, правка, версии, откат, удаление (ТЗ §4.14, §4.15).
// Версии: каждая сохранённая редакция содержимого — строка templates_versions (version = templates.version).
// Откат не стирает историю: содержимое старой версии сохраняется как новая версия.
// Гонка двух редакторов: update идёт с условием version = прочитанной, проигравший получает сообщение.
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/admin-session';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';
import { contentChanged, isUuidValue, parseTemplateForm, unknownPlaceholders, type TemplateContent, type TemplateInput } from '@/lib/email-panel';

export type TemplateActionState = { ok: boolean; message: string; id?: string };

const PAGE = '/panel/templates';
const DENIED: TemplateActionState = { ok: false, message: 'Нет доступа' };
const FK_VIOLATION = '23503';
const CONFLICT: TemplateActionState = { ok: false, message: 'Шаблон только что изменили в другой вкладке — обновите страницу' };

type Current = TemplateContent & { id: string; version: number };

async function loadCurrent(db: SupabaseClient, id: string): Promise<Current | null> {
  const { data, error } = await db.from('templates').select('id, subject, body_text, body_html, version').eq('id', id).limit(1);
  if (error) throw new Error(`templates: ${error.message}`);
  const row = ((data ?? []) as (TemplateContent & { id: string; version: number | null })[])[0];
  return row ? { ...row, version: row.version ?? 1 } : null;
}

async function insertVersion(db: SupabaseClient, templateId: string, version: number, c: TemplateContent): Promise<string> {
  const { data, error } = await db.from('templates_versions')
    .insert({ template_id: templateId, version, subject: c.subject, body_text: c.body_text, body_html: c.body_html }).select('id').limit(1);
  if (error) throw new Error(`templates_versions: ${error.message}`);
  return ((data ?? []) as { id: string }[])[0]?.id ?? '';
}

// Шаблоны, созданные до templates_versions, не имеют снимка текущей версии — сохраняем его до правки.
async function ensureSnapshot(db: SupabaseClient, cur: Current): Promise<void> {
  const { data, error } = await db.from('templates_versions').select('id').eq('template_id', cur.id).eq('version', cur.version).limit(1);
  if (error) throw new Error(`templates_versions: ${error.message}`);
  if ((data ?? []).length === 0) await insertVersion(db, cur.id, cur.version, cur);
}

// Новая версия: снимок → update с проверкой версии. При проигранной гонке снимок удаляется.
async function writeVersion(db: SupabaseClient, cur: Current, next: TemplateContent, extra: Record<string, unknown>): Promise<boolean> {
  await ensureSnapshot(db, cur);
  const version = cur.version + 1;
  const versionId = await insertVersion(db, cur.id, version, next);
  const { data, error } = await db.from('templates').update({ ...extra, ...next, version }).eq('id', cur.id).eq('version', cur.version).select('id');
  if (!error && (data ?? []).length > 0) return true;
  const undo = await db.from('templates_versions').delete().eq('id', versionId);
  if (undo.error) await logError('email', `templates_versions undo: ${undo.error.message}`);
  if (error) throw new Error(`templates update: ${error.message}`);
  return false;
}

async function createTemplate(db: SupabaseClient, v: TemplateInput): Promise<TemplateActionState> {
  const { data, error } = await db.from('templates').insert({ ...v, version: 1 }).select('id').limit(1);
  if (error) throw new Error(`templates insert: ${error.message}`);
  const id = ((data ?? []) as { id: string }[])[0]?.id ?? '';
  await insertVersion(db, id, 1, v);
  await audit('template_create', 'template', id, { name: v.name, type: v.type });
  return { ok: true, message: 'Шаблон создан (версия 1)', id };
}

async function updateTemplate(db: SupabaseClient, id: string, v: TemplateInput): Promise<TemplateActionState> {
  const cur = await loadCurrent(db, id);
  if (!cur) return { ok: false, message: 'Шаблон не найден' };
  const { subject, body_text, body_html, ...meta } = v;
  if (!contentChanged(cur, { subject, body_text, body_html })) {
    // Меняются только название/тип/активность — версия не нужна.
    const { error } = await db.from('templates').update(meta).eq('id', id);
    if (error) throw new Error(`templates update: ${error.message}`);
    return { ok: true, message: 'Сохранено (содержимое не менялось, версия та же)', id };
  }
  if (!(await writeVersion(db, cur, { subject, body_text, body_html }, meta))) return CONFLICT;
  await audit('template_save', 'template', id, { name: v.name, version: cur.version + 1 });
  return { ok: true, message: `Сохранено как версия ${cur.version + 1}`, id };
}

// Подходит для useFormState: (prev, formData).
export async function saveTemplate(_prev: TemplateActionState, formData: FormData): Promise<TemplateActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  const id = String(formData.get('id') ?? '');
  if (id && !isUuidValue(id)) return { ok: false, message: 'Неверный шаблон' };
  const parsed = parseTemplateForm(formData);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const unknown = unknownPlaceholders(parsed.value);
  try {
    const db = adminClient();
    const r = id ? await updateTemplate(db, id, parsed.value) : await createTemplate(db, parsed.value);
    revalidatePath(PAGE);
    // Неизвестные {плейсхолдеры} не ошибка (это может быть текст), но автор должен о них знать.
    return unknown.length && r.ok ? { ...r, message: `${r.message}. Не переменные, останутся как есть: ${unknown.map((u) => `{${u}}`).join(', ')}` } : r;
  } catch (e) {
    await logError('email', `template save: ${(e as Error).message}`);
    return { ok: false, message: 'Не удалось сохранить шаблон' };
  }
}

export async function restoreVersion(templateId: string, version: number): Promise<TemplateActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  if (!isUuidValue(templateId) || !Number.isInteger(version) || version < 1) return { ok: false, message: 'Неверная версия' };
  try {
    const db = adminClient();
    const cur = await loadCurrent(db, templateId);
    if (!cur) return { ok: false, message: 'Шаблон не найден' };
    const { data, error } = await db.from('templates_versions').select('subject, body_text, body_html')
      .eq('template_id', templateId).eq('version', version).order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(`templates_versions: ${error.message}`);
    const old = ((data ?? []) as TemplateContent[])[0];
    if (!old) return { ok: false, message: 'Версия не найдена' };
    if (!contentChanged(cur, old)) return { ok: true, message: `Текущее содержимое уже совпадает с версией ${version}`, id: templateId };
    if (!(await writeVersion(db, cur, old, {}))) return CONFLICT;
    await audit('template_restore', 'template', templateId, { from_version: version, new_version: cur.version + 1 });
    revalidatePath(PAGE);
    return { ok: true, message: `Версия ${version} восстановлена как версия ${cur.version + 1}`, id: templateId };
  } catch (e) {
    await logError('email', `template restore: ${(e as Error).message}`);
    return { ok: false, message: 'Не удалось восстановить версию' };
  }
}

// Шаблон, на который ссылаются письма очереди, удалить нельзя (FK) — он выключается.
export async function deleteTemplate(id: string): Promise<TemplateActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  if (!isUuidValue(id)) return { ok: false, message: 'Неверный шаблон' };
  const db = adminClient();
  const del = await db.from('templates').delete().eq('id', id);
  if (del.error?.code === FK_VIOLATION) {
    const off = await db.from('templates').update({ active: false }).eq('id', id);
    if (off.error) await logError('email', `template deactivate: ${off.error.message}`);
    revalidatePath(PAGE);
    return off.error ? { ok: false, message: 'Не удалось выключить шаблон' } : { ok: true, message: 'Шаблон использовался в письмах — он выключен, а не удалён' };
  }
  if (del.error) {
    await logError('email', `template delete: ${del.error.message}`);
    return { ok: false, message: 'Не удалось удалить шаблон' };
  }
  await audit('template_delete', 'template', id, {});
  revalidatePath(PAGE);
  return { ok: true, message: 'Шаблон удалён' };
}
