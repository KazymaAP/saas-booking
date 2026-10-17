// app/[prefix]/[slug]/panel/(protected)/data/actions.ts — запрос на удаление аккаунта (ТЗ §32).
// Только владелец. Удаление отложенное: status=pending_deletion, через 30 дней очистка (cron process-deletions).
// Подтверждение — вводом адреса сайта (slug): одной случайной кнопкой аккаунт не удалить.
'use server';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { notifyAdmin } from '@/lib/admin-notify';
import { audit } from '@/lib/audit';
import { actionAccess, OWNER_ONLY } from '../_lib/access';
import { DAY_MS } from '../_lib/time';
import { ERR, fail, ok, type ActionResult } from '../_lib/result';
import { DELETION_GRACE_DAYS, confirmationMatches } from './rules';

export async function requestDeletion(slug: string, confirmation: string): Promise<ActionResult<{ scheduledAt: string }>> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const b = access.business;
  if (!confirmationMatches(confirmation, b.slug)) return fail(ERR.invalid, { confirmation: `Введите ${b.slug}` });

  const scheduledAt = new Date(Date.now() + DELETION_GRACE_DAYS * DAY_MS).toISOString();
  // Условный UPDATE: повторный запрос не сдвигает дату очистки.
  const { data, error } = await adminClient()
    .from('businesses')
    .update({ status: 'pending_deletion', deletion_scheduled_at: scheduledAt })
    .eq('id', b.id)
    .neq('status', 'pending_deletion')
    .select('id');
  if (error) return fail(ERR.server);
  if (!data || data.length === 0) return fail('Запрос уже принят');

  await notifyAdmin(`🗑 Запрос на удаление: ${b.name} (${b.slug}), очистка ${scheduledAt.slice(0, 10)}`).catch(() => false);
  await audit('business_deletion_requested', 'business', b.id, { scheduled_at: scheduledAt }).catch(() => undefined);
  revalidatePath('/[prefix]/[slug]/panel/data', 'page');
  return ok('Запрос принят', { scheduledAt });
}
