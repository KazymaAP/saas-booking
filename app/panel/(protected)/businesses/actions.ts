'use server';
// app/panel/(protected)/businesses/actions.ts — ручное добавление и массовая смена статуса (ТЗ §13.1, §3.6).
// Права проверяются в каждом действии (guarded/guardedBulk), вход — zod, каждое изменение — audit.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addBusinessSchema } from './schema';
import { adminClient } from '@/lib/supabase';
import { slugify, MAX_SLUG_LENGTH } from '@/lib/slug';
import { audit, auditMany } from '@/lib/audit';
import { bulkReport, fail, formObject, guarded, guardedBulk, ok, zodFail, type ActionResult, type BulkResult } from '@/главная/lib/action';
import { MASS_STATUSES, type MassStatus } from '@/главная/lib/statuses';

const LIST_PATH = '/panel/businesses';
const PG_UNIQUE_VIOLATION = '23505';

// Не экспортируется: любой export из 'use server' становится публичным POST-эндпоинтом.
// Свободный slug за один запрос: берём все занятые варианты root, root-2, … (и из slug_history) и выбираем первый свободный.
// Гонку двух одновременных добавлений закрывает unique-индекс businesses.slug — тогда пробуем следующий номер.
// tried — варианты, уже упавшие на 23505: повторно их не предлагаем, даже если SELECT ещё не видит чужую вставку.
async function pickFreeSlug(name: string, tried: ReadonlySet<string>): Promise<string> {
  const root = slugify(name);
  const { data, error } = await adminClient()
    .from('businesses')
    .select('slug, slug_history')
    .or(`slug.eq.${root},slug.like.${root}-*,slug_history.cs.{${root}}`)
    .returns<{ slug: string; slug_history: string[] | null }[]>();
  if (error) throw new Error(error.message);
  const taken = new Set<string>(tried);
  for (const r of data ?? []) {
    taken.add(r.slug);
    (r.slug_history ?? []).forEach((s) => taken.add(s));
  }
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function addBusiness(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return await guarded('businesses.add', async () => {
    const parsed = addBusinessSchema.safeParse(formObject(formData));
    if (!parsed.success) return zodFail(parsed.error);
    const v = parsed.data;
    const db = adminClient();
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = await pickFreeSlug(v.name, tried);
      const { data, error } = await db
        .from('businesses')
        .insert({
          name: v.name,
          slug,
          city: v.city,
          address: v.address,
          phones: v.phone ? [v.phone] : [],
          emails: v.email ? [v.email] : [],
          // ТЗ §3.6: без email — no_contact, с email — new (попадает в шаг 1 воронки).
          status: v.email ? 'new' : 'no_contact',
        })
        .select('id')
        .single<{ id: string }>();
      if (error?.code === PG_UNIQUE_VIOLATION) {
        tried.add(slug);
        continue;
      }
      if (error || !data) throw new Error(error?.message ?? 'insert failed');
      // В журнал — только название и признаки контактов: сами контакты — ПД.
      await audit('business_add', 'business', data.id, { name: v.name, slug, has_email: Boolean(v.email), has_phone: Boolean(v.phone) });
      revalidatePath(LIST_PATH);
      return ok(`Добавлено: ${v.name}`, { id: data.id });
    }
    return fail('Не удалось подобрать адрес сайта. Измените название.');
  });
}

const massStatus = z.enum(MASS_STATUSES);

// Массовая смена статуса: один UPDATE … RETURNING id, клиенты (status=client) не трогаются —
// оплата и отключение идут только через /panel/clients.
export async function massSetStatus(ids: string[], status?: string): Promise<BulkResult> {
  return await guardedBulk('businesses.mass_status', ids, async (list) => {
    const parsed = massStatus.safeParse(status);
    if (!parsed.success) return { ok: false, message: 'Выберите статус из списка', done: [], skipped: list };
    const next: MassStatus = parsed.data;
    const patch: Record<string, unknown> = { status: next };
    // §3.6: refused → через 30 дней archived; дата отказа нужна для этого перехода.
    if (next === 'refused') patch.refused_at = new Date().toISOString();
    const { data, error } = await adminClient()
      .from('businesses')
      .update(patch)
      .in('id', list)
      .not('status', 'in', '(client,transferred_out,pending_deletion,deleted)')
      .select('id')
      .returns<{ id: string }[]>();
    if (error) throw new Error(error.message);
    const done = (data ?? []).map((r) => r.id);
    await auditMany('mass_status', 'business', done, { to: next });
    revalidatePath(LIST_PATH);
    return bulkReport('Статус изменён', done, list);
  });
}
