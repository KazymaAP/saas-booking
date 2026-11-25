// app/[prefix]/[slug]/admin/(protected)/reviews/actions.ts — CRUD отзывов.
// Меняет сайт → только роли с правом write на раздел «Отзывы» (владелец, менеджер, контент).
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { writeAccess } from '../_lib/access';
import { revalidatePublicSite } from '@/lib/public-revalidate';
import { ERR, fail, ok, UUID_RE, zodFieldErrors, type ActionResult } from '../_lib/result';

export const REVIEW_LIMITS = { authorMax: 80, bodyMax: 1000, serviceMax: 80, sourceMax: 40 } as const;

export const ReviewSchema = z.object({
  author_name: z.string().trim().min(1, 'Укажите имя').max(REVIEW_LIMITS.authorMax, `Имя — до ${REVIEW_LIMITS.authorMax} символов`),
  rating: z.coerce.number().int().min(1, 'Оценка от 1 до 5').max(5, 'Оценка от 1 до 5'),
  body: z.string().trim().max(REVIEW_LIMITS.bodyMax, `Текст — до ${REVIEW_LIMITS.bodyMax} символов`),
  service_name: z.string().trim().max(REVIEW_LIMITS.serviceMax, `Услуга — до ${REVIEW_LIMITS.serviceMax} символов`),
  source: z.string().trim().max(REVIEW_LIMITS.sourceMax, `Источник — до ${REVIEW_LIMITS.sourceMax} символов`),
});

export type ReviewFormValues = z.input<typeof ReviewSchema>;

export type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  body: string | null;
  service_name: string | null;
  source: string | null;
  is_published: boolean;
  sort_order: number;
};

const SELECT = 'id, author_name, rating, body, service_name, source, is_published, sort_order';
const Id = z.string().regex(UUID_RE);
const SORT_LAST = 999;

async function revalidate(slug: string): Promise<void> {
  revalidatePath('/[prefix]/[slug]/admin', 'layout');
  await revalidatePublicSite(slug);
}

function toDb(values: z.output<typeof ReviewSchema>) {
  return {
    author_name: values.author_name,
    rating: values.rating,
    body: values.body || null,
    service_name: values.service_name || null,
    source: values.source || null,
  };
}

export async function addReview(slug: string, input: ReviewFormValues): Promise<ActionResult<ReviewRow>> {
  const access = await writeAccess(slug, 'reviews');
  if (!access) return fail(ERR.ownerOnly);
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const { data, error } = await adminClient()
    .from('reviews')
    .insert({ ...toDb(parsed.data), business_id: access.business.id, sort_order: SORT_LAST, is_published: true })
    .select(SELECT)
    .returns<ReviewRow[]>();
  const row = data?.[0];
  if (error || !row) return fail(ERR.server);
  await revalidate(slug);
  return ok('Отзыв добавлен', row);
}

export async function updateReview(slug: string, id: string, input: ReviewFormValues): Promise<ActionResult<ReviewRow>> {
  const access = await writeAccess(slug, 'reviews');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  // business_id в WHERE — отзыв чужого бизнеса не изменить даже по известному id.
  const { data, error } = await adminClient()
    .from('reviews')
    .update(toDb(parsed.data))
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select(SELECT)
    .returns<ReviewRow[]>();
  if (error) return fail(ERR.server);
  const row = data?.[0];
  if (!row) return fail(ERR.notFound);
  await revalidate(slug);
  return ok('Сохранено', row);
}

export async function setReviewPublished(slug: string, id: string, published: boolean): Promise<ActionResult> {
  const access = await writeAccess(slug, 'reviews');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success || typeof published !== 'boolean') return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('reviews')
    .update({ is_published: published })
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  await revalidate(slug);
  return ok(published ? 'Отзыв снова на сайте' : 'Отзыв скрыт с сайта');
}

export async function deleteReview(slug: string, id: string): Promise<ActionResult> {
  const access = await writeAccess(slug, 'reviews');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('reviews')
    .delete()
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  await revalidate(slug);
  return ok('Отзыв удалён');
}
