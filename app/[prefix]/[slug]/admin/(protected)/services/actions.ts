// app/[prefix]/[slug]/admin/(protected)/services/actions.ts — CRUD услуг (ТЗ §4.7, §5.3, §13.10).
// Меняет сайт → только владелец (manager «только брони и просмотр»). Каждое действие — один SQL-запрос.
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { writeAccess } from '../_lib/access';
import { revalidatePublicSite } from '@/lib/public-revalidate';
import { ERR, fail, ok, UUID_RE, zodFieldErrors, type ActionResult } from '../_lib/result';
import { ServiceSchema, type ServiceFormValues, type ServiceRow } from './schema';

const Id = z.string().regex(UUID_RE);
const SELECT = 'id, name, description, price, duration_minutes, is_active, badge, old_price';
// Новые услуги — в конец списка: sort_order больше любого реального (порядок меняется в супер-админке).
const SORT_LAST = 999;

async function revalidate(slug: string): Promise<void> {
  revalidatePath('/[prefix]/[slug]/admin', 'layout'); // список услуг + чек-лист дашборда
  await revalidatePublicSite(slug); // публичный сайт показывает услуги
}

function toDb(values: z.output<typeof ServiceSchema>) {
  return {
    name: values.name,
    price: values.price,
    duration_minutes: values.duration_minutes,
    description: values.description || null,
    badge: values.badge || null,
    old_price: values.old_price,
  };
}

export async function addService(slug: string, input: ServiceFormValues): Promise<ActionResult<ServiceRow>> {
  const access = await writeAccess(slug, 'services');
  if (!access) return fail(ERR.ownerOnly);
  const parsed = ServiceSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const { data, error } = await adminClient()
    .from('services')
    .insert({ ...toDb(parsed.data), business_id: access.business.id, sort_order: SORT_LAST, is_active: true })
    .select(SELECT)
    .returns<ServiceRow[]>();
  const row = data?.[0];
  if (error || !row) return fail(ERR.server);
  await revalidate(slug);
  return ok('Услуга добавлена', row);
}

export async function updateService(slug: string, id: string, input: ServiceFormValues): Promise<ActionResult<ServiceRow>> {
  const access = await writeAccess(slug, 'services');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success) return fail(ERR.notFound);
  const parsed = ServiceSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  // business_id в WHERE — проверка прав: чужую услугу не обновить даже по известному id.
  const { data, error } = await adminClient()
    .from('services')
    .update(toDb(parsed.data))
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select(SELECT)
    .returns<ServiceRow[]>();
  if (error) return fail(ERR.server);
  const row = data?.[0];
  if (!row) return fail(ERR.notFound);
  await revalidate(slug);
  return ok('Сохранено', row);
}

// Удаление услуги — мягкое (is_active=false): старые брони сохраняют ссылку на услугу (ТЗ §4.7).
export async function setServiceActive(slug: string, id: string, active: boolean): Promise<ActionResult> {
  const access = await writeAccess(slug, 'services');
  if (!access) return fail(ERR.ownerOnly);
  if (!Id.safeParse(id).success || typeof active !== 'boolean') return fail(ERR.notFound);

  const { data, error } = await adminClient()
    .from('services')
    .update({ is_active: active })
    .eq('id', id)
    .eq('business_id', access.business.id)
    .select('id')
    .returns<{ id: string }[]>();
  if (error) return fail(ERR.server);
  if (!data?.length) return fail(ERR.notFound);
  await revalidate(slug);
  return ok(active ? 'Услуга снова на сайте' : 'Услуга скрыта с сайта');
}
