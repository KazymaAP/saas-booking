// общие/lib/cron-jobs/cleanup-unused-roles.ts — жизненный цикл неиспользуемых кастомных ролей (П1/П2).
// П1: роль, которой никто не пользовался 30 дней и у которой нет назначенных сотрудников, удаляется.
// П2: за 10 дней до удаления (на 20-й день неактивности) владелец получает уведомление
//     (баннер в UI по removal_notified_at + email + Telegram), и проставляется removal_notified_at.
// Если роль «оживает» (сотрудник входит — last_used_at обновляется и removal_notified_at сбрасывается
// в owner-session.ts), ни уведомления, ни удаления не происходит.
// Выборка кандидатов — через SQL-функции (cron_select_roles_to_notify / cron_select_unused_roles из 0023),
// чтобы не тянуть всю таблицу в память и корректно отфильтровать роли с живыми сотрудниками (NOT EXISTS).
import type { CronContext, CronResult } from '../cron';
import { DAY_MS, firstEmail, isoAgo, safeSendMail, safeSendTelegram, unwrapRows } from './shared';

export const JOB = 'cleanup-unused-roles';
// П1: срок неактивности роли до автоудаления.
export const INACTIVITY_DAYS = 30;
// П2: за сколько дней до удаления отправить уведомление владельцу.
export const NOTIFY_BEFORE_DAYS = 10;

type NotifyRole = { id: string; business_id: string; name: string; last_used_at: string | null; created_at: string };
type UnusedRole = { id: string; business_id: string };

// Дата автоудаления роли = последнее использование либо создание + INACTIVITY_DAYS.
function deletionDate(role: NotifyRole, now: Date): Date {
  const base = role.last_used_at ?? role.created_at;
  const ts = Date.parse(base);
  const start = Number.isNaN(ts) ? now.getTime() : ts;
  return new Date(start + INACTIVITY_DAYS * DAY_MS);
}

// Уведомляет владельца бизнеса (email + Telegram). Возвращает true, если хотя бы один канал сработал.
async function notifyOwner(ctx: CronContext, role: NotifyRole): Promise<boolean> {
  const biz = unwrapRows<{ emails: string[] | null; telegram_chat_id: string | null }>(
    await ctx.db.from('businesses').select('emails, telegram_chat_id').eq('id', role.business_id).limit(1),
    `${JOB}: контакт бизнеса`,
  )[0];
  if (!biz) return false;
  const date = deletionDate(role, ctx.now).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const text =
    `Роль «${role.name}» в кабинете будет автоматически удалена ${date}, так как ею не пользовались ` +
    `${INACTIVITY_DAYS} дней. Чтобы сохранить роль, откройте её или назначьте сотрудника — удаление отменится.`;
  const subject = `Роль «${role.name}» будет удалена через ${NOTIFY_BEFORE_DAYS} дней`;

  let ok = false;
  const email = firstEmail(biz.emails);
  if (email) ok = (await safeSendMail(ctx, JOB, { to: email, subject, text })) === 'sent';
  if (await safeSendTelegram(ctx, JOB, biz.telegram_chat_id, text)) ok = true;
  return ok;
}

export async function cleanupUnusedRoles(ctx: CronContext): Promise<CronResult> {
  const deleteBefore = isoAgo(ctx.now, INACTIVITY_DAYS * DAY_MS);
  const notifyBefore = isoAgo(ctx.now, (INACTIVITY_DAYS - NOTIFY_BEFORE_DAYS) * DAY_MS);

  // --- П2: уведомления за 10 дней до удаления ---
  const toNotify = unwrapRows<NotifyRole>(
    await ctx.db.rpc('cron_select_roles_to_notify', { p_before: notifyBefore }),
    `${JOB}: выборка к уведомлению`,
  );
  let notified = 0;
  for (const role of toNotify) {
    // Удаление уже наступило (cron долго не работал) — уведомление бессмысленно, пропускаем.
    if (deletionDate(role, ctx.now).getTime() <= ctx.now.getTime()) continue;
    if (!await notifyOwner(ctx, role)) continue;
    const { error } = await ctx.db.from('business_custom_roles')
      .update({ removal_notified_at: ctx.now.toISOString() })
      .eq('id', role.id).eq('business_id', role.business_id);
    if (error) {
      await ctx.log.error(`${JOB}: removal_notified_at не обновлён: ${error.message}`, { role_id: role.id });
      continue;
    }
    notified += 1;
  }

  // --- П1: удаление неиспользуемых ролей без назначенных сотрудников ---
  const toDelete = unwrapRows<UnusedRole>(
    await ctx.db.rpc('cron_select_unused_roles', { p_before: deleteBefore }),
    `${JOB}: выборка к удалению`,
  );
  let deleted = 0;
  for (const role of toDelete) {
    const { error } = await ctx.db.from('business_custom_roles')
      .delete().eq('id', role.id).eq('business_id', role.business_id);
    if (error) {
      await ctx.log.error(`${JOB}: не удалось удалить роль: ${error.message}`, { role_id: role.id });
      continue;
    }
    await Promise.resolve(
      ctx.db.from('audit_log').insert({
        action: 'custom_role_auto_delete', entity: 'business', entity_id: role.business_id,
        payload: { role_id: role.id },
      }),
    ).catch(() => undefined);
    deleted += 1;
  }

  return { notified, deleted, notify_candidates: toNotify.length, delete_candidates: toDelete.length };
}
