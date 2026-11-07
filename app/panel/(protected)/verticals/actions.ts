'use server';
// app/panel/(protected)/verticals/actions.ts — ниши: создание, правка, включение/выключение, импорт JSON (ТЗ §4.5, §13.1).
// Права — guarded в каждом действии, вход — zod (verticals/schema.ts), каждое изменение — audit.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { fail, guarded, ok, type ActionResult, type FieldErrors } from '@/главная/lib/action';
import { JSON_EMPTY, JSON_FIELDS, issuePath, parseJsonSafe, validateImport, verticalSchema, type VerticalInput } from './schema';

const PATH = '/panel/verticals';
const PG_UNIQUE = '23505';

// FormData → объект для verticalSchema. JSON-поля разбираются отдельно, ошибка синтаксиса — под своим полем.
function readForm(fd: FormData): { input: Record<string, unknown>; errors: FieldErrors } {
  const s = (k: string) => String(fd.get(k) ?? '');
  const input: Record<string, unknown> = {
    name: s('name'),
    slug: s('slug'),
    url_prefix: s('url_prefix'),
    icon: s('icon'),
    description: s('description'),
    is_active: fd.get('is_active') === '1',
    show_demo_mode: fd.get('show_demo_mode') === '1',
  };
  const errors: FieldErrors = {};
  for (const f of JSON_FIELDS) {
    const r = parseJsonSafe(s(f), JSON_EMPTY[f]);
    if (r.ok) input[f] = r.value;
    else errors[f] = r.error;
  }
  return { input, errors };
}

// Ошибки zod → поля формы. Ошибка внутри JSON показывается под textarea с путём: «[2].price — …».
function schemaErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const [root] = issue.path;
    const key = typeof root === 'string' ? root : '_';
    if (out[key]) continue;
    const inner = issuePath({ ...issue, path: issue.path.slice(1) });
    out[key] = inner ? `${inner} — ${issue.message}` : issue.message;
  }
  return out;
}

// 23505: какое из уникальных полей занято — по имени ограничения в тексте ошибки.
function uniqueError(message: string): FieldErrors {
  return message.includes('url_prefix') ? { url_prefix: 'Этот префикс уже у другой ниши' } : { slug: 'Этот slug уже у другой ниши' };
}

export async function saveVertical(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return await guarded('verticals.save', async () => {
    const idRaw = String(formData.get('id') ?? '');
    const id = idRaw ? z.string().uuid().safeParse(idRaw) : null;
    if (id && !id.success) return fail('Ниша не найдена');
    const { input, errors } = readForm(formData);
    if (Object.keys(errors).length) return fail('Исправьте JSON', errors);
    const parsed = verticalSchema.safeParse(input);
    if (!parsed.success) return fail('Проверьте поля формы', schemaErrors(parsed.error));
    const row: VerticalInput = parsed.data;
    const db = adminClient();
    const q = id ? db.from('vertical_templates').update(row).eq('id', id.data) : db.from('vertical_templates').insert(row);
    const { data, error } = await q.select('id').returns<{ id: string }[]>();
    if (error?.code === PG_UNIQUE) return fail('Такая ниша уже есть', uniqueError(error.message));
    if (error) throw new Error(error.message);
    const savedId = data?.[0]?.id;
    if (!savedId) return fail('Ниша не найдена');
    await audit(id ? 'vertical_save' : 'vertical_create', 'vertical', savedId, { slug: row.slug, url_prefix: row.url_prefix, services: row.default_services.length, active: row.is_active });
    revalidatePath(PATH);
    return ok(id ? `Сохранено: ${row.name}` : `Создана ниша: ${row.name}`, { id: savedId });
  });
}

// Включить/выключить нишу из списка (optimistic на клиенте). Выключенная ниша не выбирается при импорте и генерации.
export async function setVerticalActive(id: string, active: boolean): Promise<ActionResult<null>> {
  return await guarded('verticals.toggle', async () => {
    const pid = z.string().uuid().safeParse(id);
    if (!pid.success || typeof active !== 'boolean') return fail('Ниша не найдена');
    const { data, error } = await adminClient().from('vertical_templates').update({ is_active: active }).eq('id', pid.data).select('id').returns<{ id: string }[]>();
    if (error) throw new Error(error.message);
    if (!data?.length) return fail('Ниша не найдена');
    await audit('vertical_toggle', 'vertical', pid.data, { active });
    revalidatePath(PATH);
    return ok(active ? 'Ниша включена' : 'Ниша выключена', null);
  });
}

export type ImportResult = { created: number; updated: number; errors: string[] };

type Existing = { slug: string; url_prefix: string };

// Импорт JSON: валидация каждой ниши, один SELECT существующих + один upsert массивом (onConflict: slug).
// Префикс, занятый другой нишей (другой slug), отклоняется до записи — иначе упал бы весь upsert.
export async function importVerticals(_prev: ActionResult<ImportResult> | null, formData: FormData): Promise<ActionResult<ImportResult>> {
  return await guarded('verticals.import', async () => {
    const raw = parseJsonSafe(String(formData.get('json') ?? ''), '');
    if (!raw.ok) return fail('Файл не разобран', { json: raw.error });
    const { valid, errors } = validateImport(raw.value);
    const db = adminClient();
    const { data: existing, error: e1 } = await db.from('vertical_templates').select('slug, url_prefix').returns<Existing[]>();
    if (e1) throw new Error(e1.message);
    const bySlug = new Set((existing ?? []).map((v) => v.slug));
    const prefixOwner = new Map((existing ?? []).map((v) => [v.url_prefix, v.slug]));
    const rows = valid.filter((v) => {
      const owner = prefixOwner.get(v.url_prefix);
      if (owner && owner !== v.slug) errors.push(`${v.slug}: префикс /${v.url_prefix} уже у ниши ${owner}`);
      return !owner || owner === v.slug;
    });
    if (rows.length === 0) return fail('Ничего не импортировано', { json: errors.slice(0, 5).join('; ') || 'Пустой массив' });
    const { error } = await db.from('vertical_templates').upsert(rows, { onConflict: 'slug' });
    if (error) throw new Error(error.message);
    const updated = rows.filter((r) => bySlug.has(r.slug)).length;
    const result: ImportResult = { created: rows.length - updated, updated, errors };
    await audit('vertical_import', 'vertical', null, { created: result.created, updated, rejected: errors.length });
    revalidatePath(PATH);
    const tail = errors.length ? `. Отклонено: ${errors.length}` : '';
    return ok(`Импорт: новых ${result.created}, обновлено ${updated}${tail}`, result);
  });
}
