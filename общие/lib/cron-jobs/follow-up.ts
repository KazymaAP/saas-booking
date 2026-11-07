// lib/cron-jobs/follow-up.ts — повторы молчунам (ТЗ §8.4): бизнес в статусе sent, от первого письма прошло
// 30 дней — первый повтор, 60 — второй, 90 — archived. Выбор и захват стадии — public.cron_claim_follow_up()
// одним запросом (cron_marks, ключ '<business>:<stage>'): каждая стадия выполняется один раз.
// Сбой письма — ключ освобождается, повтор завтра. Бизнес без email — стадия считается выполненной.
import type { CronContext, CronResult } from '../cron';
import type { Business } from '../database.types';
import { BATCH_SIZE, firstEmail, releaseKeys, safeSendMail, unwrap, unwrapRows, withClaimedKeys } from './shared';

export const JOB = 'follow-up';
export const FOLLOW_UP_SUBJECT = 'Напоминание: сайт онлайн-записи';
export type FollowUpStage = 'first' | 'second' | 'archive';

interface ClaimedStage {
  business_id: string;
  stage: FollowUpStage;
}

type FollowUpBusiness = Pick<Business, 'id' | 'name' | 'emails' | 'status'>;

export function followUpText(name: string): string {
  return `Напоминаем о демо-сайте онлайн-записи для «${name}». Ответьте на это письмо, если интересно.`;
}

async function archiveSilent(ctx: CronContext, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ status: 'archived' })
    .in('id', ids).eq('status', 'sent').select('id'), `${JOB}: архив`);
  return rows.length;
}

// Повтор письма: отправка и запись в emails_outgoing (по ней cron_claim_follow_up считает «первое письмо»).
async function sendFollowUp(ctx: CronContext, business: FollowUpBusiness): Promise<'sent' | 'failed' | 'no_email'> {
  const to = firstEmail(business.emails);
  if (to === null) return 'no_email';
  const text = followUpText(business.name);
  const outcome = await safeSendMail(ctx, JOB, { to, subject: FOLLOW_UP_SUBJECT, text });
  if (outcome === 'failed') return 'failed';
  unwrap(await ctx.db.from('emails_outgoing').insert({
    business_id: business.id, to_email: to, subject: FOLLOW_UP_SUBJECT, body_text: text, sent_at: ctx.now.toISOString(), status: 'sent',
  }), `${JOB}: журнал письма`);
  return 'sent';
}

const stageKey = (stage: ClaimedStage): string => `${stage.business_id}:${stage.stage}`;

async function processStages(ctx: CronContext, claimed: ClaimedStage[]): Promise<CronResult> {
  const archived = await archiveSilent(ctx, claimed.filter((c) => c.stage === 'archive').map((c) => c.business_id));
  const mailStages = claimed.filter((c) => c.stage !== 'archive');
  const businesses = mailStages.length === 0 ? [] : unwrapRows<FollowUpBusiness>(await ctx.db.from('businesses')
    .select('id, name, emails, status').in('id', mailStages.map((c) => c.business_id)), `${JOB}: бизнесы`);

  let sent = 0;
  let noEmail = 0;
  const retry: string[] = [];
  // Последовательно: общий дневной лимит ящиков (lib/notify.ts → pickAccount).
  for (const stage of mailStages) {
    const business = businesses.find((b) => b.id === stage.business_id);
    // Бизнес ответил или удалён между захватом и отправкой — повтор не нужен.
    if (business === undefined || business.status !== 'sent') continue;
    const outcome = await sendFollowUp(ctx, business);
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'no_email') noEmail += 1;
    else retry.push(stageKey(stage));
  }
  await releaseKeys(ctx, JOB, retry);
  return { claimed: claimed.length, sent, archived, no_email: noEmail, failed: retry.length };
}

export async function followUp(ctx: CronContext): Promise<CronResult> {
  const claimed = unwrapRows<ClaimedStage>(await ctx.db.rpc('cron_claim_follow_up', { p_limit: BATCH_SIZE }), `${JOB}: захват`);
  if (claimed.length === 0) return { claimed: 0, sent: 0, archived: 0, no_email: 0, failed: 0 };
  return withClaimedKeys(ctx, JOB, claimed.map(stageKey), () => processStages(ctx, claimed));
}
