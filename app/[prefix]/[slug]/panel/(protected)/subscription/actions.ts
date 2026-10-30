// app/[prefix]/[slug]/panel/(protected)/subscription/actions.ts — «Я оплатил» (ТЗ §5.3, §13.10).
// Только владелец. Письмо админу платформы (SUPERADMIN_EMAILS) + дубль в Telegram админа:
// оплату нужно заметить быстро, а почта может не дойти. Не чаще раза в 10 минут на бизнес.
'use server';
import { sendMail } from '@/lib/notify';
import { notifyAdmin } from '@/lib/admin-notify';
import { hitRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { actionAccess, OWNER_ONLY } from '../_lib/access';
import { ERR, fail, ok, zodFieldErrors, type ActionResult } from '../_lib/result';
import { PaidSchema, type PaidInput } from './schema';

const RATE_WINDOW_SECONDS = 10 * 60;

function adminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export async function reportPayment(slug: string, input: PaidInput): Promise<ActionResult> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const parsed = PaidSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));
  const b = access.business;

  const allowed = await hitRateLimit(`paid:${b.id}`, 1, RATE_WINDOW_SECONDS).catch(() => true);
  if (!allowed) return fail('Мы уже получили сообщение. Проверим оплату в ближайшее время');

  const amount = parsed.data.amount || (b.subscription_price ? String(b.subscription_price) : 'не указана');
  const lines = [
    `Бизнес: ${b.name} (${b.slug})`,
    `Сумма: ${amount} ₽`,
    `Оплачено до сейчас: ${b.subscription_until?.slice(0, 10) ?? '—'}`,
    parsed.data.comment ? `Комментарий: ${parsed.data.comment}` : '',
    `Кто сообщил: ${access.member.email ?? 'владелец'}`,
  ].filter(Boolean);

  const to = adminEmails();
  const mailed = to.length > 0
    // №26: сообщение об оплате — транзакционное, не расходует лимит рассылки.
    ? await sendMail({ to: to.join(','), subject: `Оплата подписки: ${b.name}`, text: lines.join('\n'), transactional: true }).catch(() => false)
    : false;
  const telegram = await notifyAdmin(`💳 Сообщение об оплате\n${lines.join('\n')}`).catch(() => false);
  if (!mailed && !telegram) return fail('Не удалось отправить. Напишите нам на почту из реквизитов');

  await audit('subscription_paid_reported', 'business', b.id, { amount, mailed, telegram }).catch(() => undefined);
  return ok('Спасибо! Проверим оплату и продлим подписку');
}
