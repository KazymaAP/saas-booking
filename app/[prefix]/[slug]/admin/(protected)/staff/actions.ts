// app/[prefix]/[slug]/admin/(protected)/staff/actions.ts — CRUD сотрудников студии.
// Это не учётные записи (они в «Команде»), а карточки на сайте: имя, должность, фото, стаж.
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { writeAccess } from '../_lib/access';
import { revalidatePublicSite } from '@/lib/public-revalidate';
import { ERR, fail, ok, UUID_RE, zodFieldErrors, type ActionResult } from '../_lib/result';

export const STAFF_LIMITS = { nameMax: 80, positionMax: 80, descriptionMax: 400, experienceMax: 70 } as const;

export const StaffSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(STAFF_LIMITS.nameMax, `Имя — до ${STAFF_LIMITS.nameMax} символов`),
  position: z.string().trim().max(STAFF_LIMITS.positionMax, `Должность — до ${STAFF_LIMITS.positionMax} символов`),
  // Пустая строка — стаж не показываем. Отрицательный или нечисловой — ошибка.
  experience_years: z
    .string()
    .trim()
    .regex(/^\d*$/, 'Стаж — целое число лет')
    .transform((value) => (value === '' ? null : Number(value)))
    .refine((value) => value === null || (value >= 0 && value <= STAFF_LIMITS.experienceMax), `Стаж — от 0 до ${STAFF_LIMITS.experienceMax} лет`),
  photo_url: z.string().trim().max(500, 'Ссылка слишком длинная').refine((value) => value === '' || /^https?:\/\//i.test(value), 'Ссылка должна начинаться с http:// или https://'),
  description: z.string().trim().max(STAFF_LIMITS.descriptionMax, `Описание — до ${STAFF_LIMITS.descriptionMax} символов`),
});

export type StaffFormValues = z.input<typeof StaffSchema>;

export type StaffRow = {
  id: string;
  name: string;
  position: string | null;
  photo_url: string | null;
  experience_years: number | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

const SELECT = 'id, name, position, photo_url, experience_years, description, is_active, sort_order';
const Id = z.string().regex(UUID_RE);
const SORT_LAST = 999;

async function revalidate(slug: string): Promise<void> {
  revalidatePath('/[prefix]/[slug]/admin', 'layout');
  await revalidatePublicSite(slug);
}

function toDb(values: z.output<typeof StaffSchema>) {
  return {
    name: values.name,
    position: values.position || null,
    photo_url: values.photo_url || null,
    experience_years: values.experience_years,
    description: values.description || null,
  };
}

export async function addStaff(slug: string, input: StaffFormValues): Promise<ActionResult<StaffRow>> {
  const access = await writeAccess(slug, 'staff');
  if (!access) return fail(ERR.ownerOnly);
  const parsed = StaffSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const { data, error } = await adminClient()
    .from('staff')
    .insert({ ...toDb(parsed.data), business_id: access.business.id, sort_order: SORT_LAST, is_active: true })
    .select(SELECT)
    .returns<StaffRow[]>();
  const row = data?.[0];
  if (error || !row) return fail(ERR.server);
  await revalidate(slug);
  return ok('Сотрудник добавлен', row);
}

export async function updateStaff(slug: string, id: string, input: StaffFormValues): Promise<ActionResult<StaffRow>> {
  const access = await writeAccess(slug, 'staff');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);
  const parsed = StaffSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const { data, error } = await adminClient()
    .from('staff')
    .update(toDb(parsed.data))
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select(SELECT)
    .returns<StaffRow[]>();
  if (error) return fail(ERR.server);
  const row = data?.[0];
  if (!row) return fail(ERR.notFound);
  await revalidate(slug);
  return ok('Сохранено', row);
}

export async function setStaffActive(slug: string, id: string, active: boolean): Promise<ActionResult> {
  const access = await writeAccess(slug, 'staff');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success || typeof active !== 'boolean') return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('staff')
    .update({ is_active: active })
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  await revalidate(slug);
  return ok(active ? 'Сотрудник снова на сайте' : 'Сотрудник скрыт с сайта');
}

export async function deleteStaff(slug: string, id: string): Promise<ActionResult> {
  const access = await writeAccess(slug, 'staff');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('staff')
    .delete()
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  await revalidate(slug);
  return ok('Сотрудник удалён');
}
