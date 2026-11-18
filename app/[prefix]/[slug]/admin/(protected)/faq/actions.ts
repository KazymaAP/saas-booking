// app/[prefix]/[slug]/admin/(protected)/faq/actions.ts — CRUD вопросов и ответов.
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { writeAccess } from '../_lib/access';
import { ERR, fail, ok, UUID_RE, zodFieldErrors, type ActionResult } from '../_lib/result';

export const FAQ_LIMITS = { questionMax: 200, answerMax: 1500 } as const;

export const FaqSchema = z.object({
  question: z.string().trim().min(1, 'Укажите вопрос').max(FAQ_LIMITS.questionMax, `Вопрос — до ${FAQ_LIMITS.questionMax} символов`),
  answer: z.string().trim().min(1, 'Укажите ответ').max(FAQ_LIMITS.answerMax, `Ответ — до ${FAQ_LIMITS.answerMax} символов`),
});

export type FaqFormValues = z.input<typeof FaqSchema>;

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  is_published: boolean;
  sort_order: number;
};

const SELECT = 'id, question, answer, is_published, sort_order';
const Id = z.string().regex(UUID_RE);
const SORT_LAST = 999;

function revalidate(): void {
  revalidatePath('/[prefix]/[slug]/admin', 'layout');
  revalidatePath('/[prefix]/[slug]', 'page');
}

export async function addFaq(slug: string, input: FaqFormValues): Promise<ActionResult<FaqRow>> {
  const access = await writeAccess(slug, 'faq');
  if (!access) return fail(ERR.ownerOnly);
  const parsed = FaqSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const { data, error } = await adminClient()
    .from('faq_items')
    .insert({ ...parsed.data, business_id: access.business.id, sort_order: SORT_LAST, is_published: true })
    .select(SELECT)
    .returns<FaqRow[]>();
  const row = data?.[0];
  if (error || !row) return fail(ERR.server);
  revalidate();
  return ok('Вопрос добавлен', row);
}

export async function updateFaq(slug: string, id: string, input: FaqFormValues): Promise<ActionResult<FaqRow>> {
  const access = await writeAccess(slug, 'faq');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);
  const parsed = FaqSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const { data, error } = await adminClient()
    .from('faq_items')
    .update(parsed.data)
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select(SELECT)
    .returns<FaqRow[]>();
  if (error) return fail(ERR.server);
  const row = data?.[0];
  if (!row) return fail(ERR.notFound);
  revalidate();
  return ok('Сохранено', row);
}

export async function setFaqPublished(slug: string, id: string, published: boolean): Promise<ActionResult> {
  const access = await writeAccess(slug, 'faq');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success || typeof published !== 'boolean') return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('faq_items')
    .update({ is_published: published })
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  revalidate();
  return ok(published ? 'Вопрос снова на сайте' : 'Вопрос скрыт с сайта');
}

export async function deleteFaq(slug: string, id: string): Promise<ActionResult> {
  const access = await writeAccess(slug, 'faq');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('faq_items')
    .delete()
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  revalidate();
  return ok('Вопрос удалён');
}
