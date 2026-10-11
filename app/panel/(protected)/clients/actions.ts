'use server';
// app/panel/(protected)/clients/actions.ts — клиенты: оплата, продление, доступ, отключение, напоминание, отказ (ТЗ §5.4, §5.9).
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { FLASH_COOKIE } from '@/lib/flash';
import { audit } from '@/lib/audit';
import { notifyAdmin } from '@/lib/admin-notify';
import { sendMail } from '@/lib/notify';
import { logError } from '@/lib/log';

const DAY = 86_400_000;
const UUID = /^[0-9a-f-]{36}$/i;

// Отметить первую оплату 5000 ₽: статус client, подписка на 30 дней.
export async function markInitialPaid(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  const until = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  await adminClient().from('businesses').update({
    status: 'client',
    paid_initial_at: new Date().toISOString(),
    subscription_active: true,
    subscription_until: until,
    subscription_started_at: new Date().toISOString(),
    plan_type: 'basic',
    subscription_price: 1000,
  }).eq('id', id);
  await audit('mark_paid', 'business', id, { amount: 5000 });
  await notifyAdmin(`💰 Оплата 5000 ₽: бизнес ${id}`);
  revalidatePath('/panel/clients');
}

// Продлить подписку на 30 дней после оплаты переводом (§5.9 п.7).
export async function extendSubscription(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  const db = adminClient();
  const { data: b } = await db.from('businesses').select('subscription_until').eq('id', id).maybeSingle();
  const base = b?.subscription_until && new Date(b.subscription_until) > new Date() ? new Date(b.subscription_until) : new Date();
  const until = new Date(base.getTime() + 30 * DAY).toISOString().slice(0, 10);
  await db.from('businesses').update({ subscription_until: until, subscription_active: true }).eq('id', id);
  await audit('extend_subscription', 'business', id, { until });
  revalidatePath('/panel/clients');
}

// Создать доступ владельцу: пароль генерируется, показывается один раз через cookie (5 минут).
export async function createOwnerAccess(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!UUID.test(id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const db = adminClient();
  const password = randomBytes(9).toString('base64url');
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) return;
  await db.from('admin_users').insert({ business_id: id, email, role: 'owner', auth_user_id: created.user.id });
  await audit('create_access', 'business', id, { email });
  cookies().set(FLASH_COOKIE, JSON.stringify({ email, password }), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300, path: '/panel' });
  revalidatePath('/panel/clients');
}

// Отключить: сайт остаётся, но подписка неактивна (заглушка через middleware при блокировке). Статус не меняется.
export async function disableSubscription(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('businesses').update({ subscription_active: false }).eq('id', id);
  await audit('subscription_disable', 'business', id, {});
  revalidatePath('/panel/clients');
}

// Напомнить об оплате: письмо владельцу (email бизнеса) с суммой и сроком.
export async function remindPayment(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  const db = adminClient();
  const { data: b } = await db.from('businesses').select('name, emails, subscription_until').eq('id', id).maybeSingle();
  const to = b?.emails?.[0];
  if (!to) { await logError('email', 'напоминание: нет email у бизнеса', { id }); return; }
  const until = b?.subscription_until ?? 'не указан';
  const ok = await sendMail({ to, subject: 'Продление подписки', text: `${b?.name}, подписка на сайт онлайн-записи действует до ${until}. Продлить можно переводом по реквизитам в кабинете (раздел «Подписка»).` }).catch(() => false);
  if (ok) await audit('payment_reminder', 'business', id, { to });
  revalidatePath('/panel/clients');
}

// Отказ: статус refused и дата для архивации через 30 дней (§19, §25).
export async function markRefused(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('businesses').update({ status: 'refused', refused_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/panel/clients');
}
