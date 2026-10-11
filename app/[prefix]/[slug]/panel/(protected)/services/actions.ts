// app/[prefix]/[slug]/panel/(protected)/services/actions.ts — CRUD услуг (ТЗ §5.3: добавить, удалить, менять название, цену, длительность).
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';

const ServiceInput = z.object({
  name: z.string().trim().min(2).max(120),
  price: z.coerce.number().int().min(0).max(10_000_000),
  duration_minutes: z.coerce.number().int().min(5).max(24 * 60),
  description: z.string().trim().max(500).optional(),
});

export async function addService(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access) return;
  const parsed = ServiceInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await adminClient().from('services').insert({
    business_id: access.business.id,
    name: parsed.data.name,
    price: parsed.data.price,
    duration_minutes: parsed.data.duration_minutes,
    description: parsed.data.description || null,
    sort_order: 999,
    is_active: true,
  });
  revalidatePath(`/${prefix}/${slug}/panel/services`);
}

export async function updateService(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access) return;
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const parsed = ServiceInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await adminClient()
    .from('services')
    .update({
      name: parsed.data.name,
      price: parsed.data.price,
      duration_minutes: parsed.data.duration_minutes,
      description: parsed.data.description || null,
    })
    .eq('id', id)
    .eq('business_id', access.business.id);
  revalidatePath(`/${prefix}/${slug}/panel/services`);
}

// Удаление услуги — мягкое (is_active=false), чтобы старые брони сохранили ссылку на услугу.
export async function toggleService(prefix: string, slug: string, formData: FormData) {
  const access = await currentOwner(slug);
  if (!access) return;
  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === '1';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await adminClient().from('services').update({ is_active: active }).eq('id', id).eq('business_id', access.business.id);
  revalidatePath(`/${prefix}/${slug}/panel/services`);
}
