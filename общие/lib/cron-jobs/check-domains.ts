// lib/cron-jobs/check-domains.ts — кастомные домены через Vercel API → businesses.ssl_status (ТЗ §8.4, §51–52).
// Запросы к Vercel — параллельно порциями по DOMAIN_CONCURRENCY с таймаутом, чтобы уложиться в бюджет функции.
// Идемпотентно: ssl_status перезаписывается актуальным значением, UPDATE только если статус изменился
// (батчем по статусу — не больше 3 запросов на запуск).
// Админ получает не больше одного сообщения в сутки на один и тот же список проблемных доменов
// (ключ cron_marks = дата МСК + хэш списка): повторные запуски в тот же день молчат, изменившийся список —
// новое сообщение, нерешённые проблемы — напоминание раз в сутки.
import type { CronContext, CronResult } from '../cron';
import type { Business } from '../database.types';
import { chunk, claimKeys, errorText, hasTimeLeft, moscowDate, releaseKeys, unwrapRows } from './shared';

export const JOB = 'check-domains';
export const VERCEL_API = 'https://api.vercel.com';
export const DOMAIN_TIMEOUT_MS = 5_000;
const DOMAIN_CONCURRENCY = 5;
const MAX_DOMAINS = 200;

export const SSL_STATUSES = ['active', 'pending', 'error'] as const;
export type SslStatus = (typeof SSL_STATUSES)[number];

type DomainBusiness = Pick<Business, 'id' | 'custom_domain'> & { ssl_status: string };

interface VercelDomain {
  verified?: boolean;
}

export function domainUrl(ctx: CronContext, domain: string): string {
  const team = ctx.env.vercelTeamId === '' ? '' : `?teamId=${encodeURIComponent(ctx.env.vercelTeamId)}`;
  return `${VERCEL_API}/v9/projects/${encodeURIComponent(ctx.env.vercelProjectId)}/domains/${encodeURIComponent(domain)}${team}`;
}

async function checkDomain(ctx: CronContext, domain: string): Promise<SslStatus> {
  try {
    const res = await ctx.fetch(domainUrl(ctx, domain), {
      headers: { Authorization: `Bearer ${ctx.env.vercelApiToken}` },
      signal: AbortSignal.timeout(DOMAIN_TIMEOUT_MS),
    });
    if (res.ok === false) return 'error';
    const body = (await res.json()) as VercelDomain;
    return body.verified === true ? 'active' : 'pending';
  } catch (error) {
    await ctx.log.error(`vercel api: ${errorText(error)}`, { job: JOB });
    return 'error';
  }
}

// Короткий детерминированный хэш списка доменов (djb2) — для ключа «это уже сообщали».
export function listHash(items: readonly string[]): string {
  let hash = 5381;
  for (const ch of [...items].sort().join(',')) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

async function reportProblems(ctx: CronContext, problems: string[]): Promise<boolean> {
  if (problems.length === 0) return false;
  const key = `${moscowDate(ctx.now)}:${listHash(problems)}`;
  const claimed = await claimKeys(ctx, JOB, [key]);
  if (claimed.has(key) === false) return false;
  let delivered = false;
  try {
    delivered = await ctx.notify.notifyAdmin(`⚠️ Домены не подтверждены (${problems.length}): ${problems.join(', ')}`);
  } catch (error) {
    await ctx.log.error(`notifyAdmin: ${errorText(error)}`, { job: JOB });
  }
  // Сообщение не дошло — ключ освобождается, следующий запуск сообщит снова (иначе админ не узнает о проблеме).
  if (delivered === false) await releaseKeys(ctx, JOB, [key]);
  return delivered;
}

// Изменившиеся статусы пишутся батчами — не больше одного UPDATE на статус (3 вместо N запросов).
async function saveStatuses(ctx: CronContext, changes: Map<SslStatus, string[]>): Promise<number> {
  let changed = 0;
  for (const [status, ids] of changes) {
    if (ids.length === 0) continue;
    const rows = unwrapRows<{ id: string }>(await ctx.db.from('businesses').update({ ssl_status: status })
      .in('id', ids).select('id'), `${JOB}: статус ${status}`);
    changed += rows.length;
  }
  return changed;
}

export async function checkDomains(ctx: CronContext): Promise<CronResult> {
  if (ctx.env.vercelApiToken === '' || ctx.env.vercelProjectId === '') {
    // Не ошибка задачи: без настроек проверять нечем. Видно в журнале результата.
    return { skipped: 'VERCEL_API_TOKEN или VERCEL_PROJECT_ID не заданы', checked: 0 };
  }
  const rows = unwrapRows<DomainBusiness>(await ctx.db.from('businesses').select('id, custom_domain, ssl_status')
    .not('custom_domain', 'is', null).order('custom_domain', { ascending: true }).limit(MAX_DOMAINS), `${JOB}: выборка`);

  let checked = 0;
  const problems: string[] = [];
  const changes = new Map<SslStatus, string[]>(SSL_STATUSES.map((status) => [status, []]));
  for (const part of chunk(rows, DOMAIN_CONCURRENCY)) {
    if (hasTimeLeft(ctx) === false) break;
    const statuses = await Promise.all(part.map((b) => checkDomain(ctx, b.custom_domain ?? '')));
    for (const [index, business] of part.entries()) {
      const status = statuses[index] ?? 'error';
      checked += 1;
      if (status !== 'active') problems.push(business.custom_domain ?? '');
      if (status !== business.ssl_status) changes.get(status)?.push(business.id);
    }
  }
  const changed = await saveStatuses(ctx, changes);
  const notified = await reportProblems(ctx, problems);
  return { checked, changed, problems: problems.length, notified, total: rows.length };
}
