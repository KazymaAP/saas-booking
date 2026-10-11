// app/[prefix]/[slug]/panel/(protected)/settings/actions.ts — настройки и тексты бизнеса (ТЗ §5.3, §47).
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { parseIntervals } from '@/lib/hours';
import type { WorkingHours } from '@/lib/database.types';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const Settings = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  address: z.string().trim().max(250).optional(),
  city: z.string().trim().max(80).optional(),
  phones: z.string().trim().max(200),
  emails: z.string().trim().max(200).optional(),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  slot_step_minutes: z.coerce.number().int().refine((n) => [30, 60, 90, 120].includes(n)),
  cancel_hours_before: z.coerce.number().int().min(0).max(72),
  min_hours_before: z.coerce.number().int().min(0).max(72),
  max_days_ahead: z.coerce.number().int().min(1).max(365),
  auto_confirm: z.enum(['0', '1']).transform((v) => v === '1'),
});

export async function saveSettings(prefix: string, slug: string, formData: FormData) {
  const base = `/${prefix}/${slug}/panel/settings`;
  const access = await currentOwner(slug);
  if (!access) redirect(`/${prefix}/${slug}/panel/login`);
  if (access.member.role !== 'owner') redirect(`${base}?error=${encodeURIComponent('Только владелец может менять настройки')}`);

  const parsed = Settings.safeParse({ ...Object.fromEntries(formData), auto_confirm: formData.get('auto_confirm') === '1' ? '1' : '0' });
  if (!parsed.success) redirect(`${base}?error=${encodeURIComponent('Проверьте поля: цвет, шаг слота, часы')}`);

  const hours: WorkingHours = {};
  for (const d of DAYS) {
    const v = parseIntervals(String(formData.get(`hours_${d}`) ?? ''));
    if (v === 'invalid') redirect(`${base}?error=${encodeURIComponent(`Неверный формат времени: ${d}`)}`);
    hours[d] = v;
  }

  const phones = parsed.data.phones.split(',').map((s) => s.trim()).filter(Boolean);
  const emails = (parsed.data.emails ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  const { error } = await adminClient()
    .from('businesses')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      phones,
      emails,
      brand_color: parsed.data.brand_color,
      slot_step_minutes: parsed.data.slot_step_minutes,
      cancel_hours_before: parsed.data.cancel_hours_before,
      min_hours_before: parsed.data.min_hours_before,
      max_days_ahead: parsed.data.max_days_ahead,
      auto_confirm: parsed.data.auto_confirm,
      working_hours: hours,
    })
    .eq('id', access.business.id);

  if (error) redirect(`${base}?error=${encodeURIComponent('Не удалось сохранить')}`);
  revalidatePath(base);
  revalidatePath(`/${prefix}/${slug}`);
  redirect(`${base}?saved=1`);
}
