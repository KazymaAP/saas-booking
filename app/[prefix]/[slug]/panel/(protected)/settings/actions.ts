// app/[prefix]/[slug]/panel/(protected)/settings/actions.ts — настройки бизнеса (ТЗ §4.6, §5.3, §13.10).
// Только владелец. Один UPDATE. Ответ — ActionResult: ошибки по полям подсвечиваются в форме без перезагрузки.
'use server';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { actionAccess, OWNER_ONLY } from '../_lib/access';
import { ERR, fail, ok, zodFieldErrors, type ActionResult } from '../_lib/result';
import { SettingsSchema, type SettingsFormValues } from './schema';

export async function saveSettings(slug: string, input: SettingsFormValues): Promise<ActionResult> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));
  const v = parsed.data;

  const { error } = await adminClient()
    .from('businesses')
    .update({
      name: v.name,
      description: v.description || null,
      city: v.city || null,
      address: v.address || null,
      phones: v.phones,
      emails: v.emails,
      brand_color: v.brand_color,
      working_hours: v.hours,
      slot_step_minutes: v.slot_step_minutes,
      cancel_hours_before: v.cancel_hours_before,
      min_hours_before: v.min_hours_before,
      max_days_ahead: v.max_days_ahead,
      auto_confirm: v.auto_confirm,
    })
    .eq('id', access.business.id);
  if (error) return fail(ERR.server);

  revalidatePath('/[prefix]/[slug]/panel', 'layout'); // шапка (название, цвет) и чек-лист
  revalidatePath('/[prefix]/[slug]', 'page'); // публичный сайт: контакты, часы, цвет
  return ok('Настройки сохранены');
}
