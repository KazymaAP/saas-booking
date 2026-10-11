// app/[prefix]/[slug]/panel/(protected)/notifications/actions.ts — код подключения Telegram (ТЗ §36).
'use server';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';

export async function createTelegramCode(prefix: string, slug: string) {
  const access = await currentOwner(slug);
  if (!access) return;
  const code = `BIZ-${randomBytes(3).toString('hex')}`;
  await adminClient().from('business_telegram_codes').insert({ code, business_id: access.business.id });
  revalidatePath(`/${prefix}/${slug}/panel/notifications`);
}

export async function disconnectTelegram(prefix: string, slug: string) {
  const access = await currentOwner(slug);
  if (!access) return;
  await adminClient().from('businesses').update({ telegram_chat_id: null, telegram_connected_at: null }).eq('id', access.business.id);
  revalidatePath(`/${prefix}/${slug}/panel/notifications`);
}
