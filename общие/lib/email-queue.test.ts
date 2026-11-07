// lib/email-queue.test.ts — цикл очереди: лимит 50, бюджет времени, retry 1ч/4ч → failed + алерт,
// hard bounce, отписка, привязка к ящику, конкурентный claim.
import { describe, expect, it, vi } from 'vitest';
import type { QueueItem, QueueStore } from './email-queue';
import type { MailOptions, SendResult } from './notify';

vi.mock('./supabase', () => ({ adminClient: () => ({}) }));
vi.mock('./log', () => ({ logError: async () => undefined }));
vi.mock('./site', () => ({ SITE_URL: 'https://zapishisya.ru' }));

const { MAX_PER_RUN, mailFromItem, messageIdFor, nextAttempt, retryDelayMs, runQueue } = await import('./email-queue');

const HOUR = 3_600_000;
const NOW = new Date('2026-10-15T10:00:00Z');

function item(id: string, patch: Partial<QueueItem> = {}): QueueItem {
  return {
    id, business_id: `b-${id}`, booking_id: null, email_account_id: null, to_email: `${id}@client.ru`, subject: 'S',
    body_text: 'T', body_html: '<p>T</p>', retry_count: 0, max_retries: 3, message_id: null, in_reply_to: null,
    references: null, tracking_token: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, ...patch,
  };
}

function memoryStore(items: QueueItem[], opts: { unsubscribed?: string[]; stolen?: string[]; hardBounced?: string[] } = {}) {
  const state = new Map(items.map((i) => [i.id, { ...i, status: 'pending' as string, next_retry_at: '', error: '' }]));
  const bounces: string[] = [];
  const store: QueueStore = {
    releaseStale: async () => undefined,
    fetchDue: async (_now, limit) => [...state.values()].filter((r) => r.status === 'pending').slice(0, limit),
    claim: async (id) => {
      const r = state.get(id);
      if (!r || r.status !== 'pending' || opts.stolen?.includes(id)) return false;
      r.status = 'sending';
      return true;
    },
    release: async (id) => {
      const r = state.get(id);
      if (r) r.status = 'pending';
    },
    isUnsubscribed: async (email) => (opts.unsubscribed ?? []).includes(email),
    hasHardBounce: async (email) => (opts.hardBounced ?? []).includes(email),
    markSent: async (i) => {
      const r = state.get(i.id);
      if (r) r.status = 'sent';
    },
    markRetry: async (id, patch) => {
      const r = state.get(id);
      if (r) Object.assign(r, { status: 'pending', ...patch });
    },
    markFailed: async (i, patch) => {
      const r = state.get(i.id);
      if (r) Object.assign(r, { status: 'failed', ...patch });
    },
    recordHardBounce: async (i) => {
      bounces.push(i.to_email);
    },
  };
  return { store, state, bounces };
}

const ok = (accountId = 'acc1'): SendResult => ({ ok: true, accountId, fromEmail: `${accountId}@s.ru`, messageId: '<m@s>', attempts: 1 });
const fail = (reason: 'soft' | 'hard_bounce' | 'no_account' | 'network', accountId: string | null = 'acc1'): SendResult => ({ ok: false, reason, error: `${reason} error`, code: reason === 'hard_bounce' ? 550 : 451, accountId, attempts: 1 });

function deps(store: QueueStore, send: (o: MailOptions) => Promise<SendResult>, clock: () => Date = () => NOW) {
  const alerts: string[] = [];
  return {
    alerts,
    d: { store, send, alert: async (t: string) => void alerts.push(t), log: async () => undefined, now: clock },
  };
}

// Каждый вызов — новый ящик: имитация 10 ящиков с ротацией.
function rotatingSend() {
  let n = 0;
  return async () => ok(`acc${(n += 1)}`);
}

describe('retry-расписание', () => {
  it('1 ч после первой неудачи, 4 ч после второй, затем failed', () => {
    expect(retryDelayMs(1)).toBe(HOUR);
    expect(retryDelayMs(2)).toBe(4 * HOUR);
    const first = nextAttempt({ retry_count: 0, max_retries: 3 }, NOW);
    expect(first).toEqual({ status: 'pending', retry_count: 1, next_retry_at: new Date(NOW.getTime() + HOUR).toISOString() });
    const second = nextAttempt({ retry_count: 1, max_retries: 3 }, NOW);
    expect(second.status === 'pending' && second.next_retry_at).toBe(new Date(NOW.getTime() + 4 * HOUR).toISOString());
    expect(nextAttempt({ retry_count: 2, max_retries: 3 }, NOW)).toEqual({ status: 'failed', retry_count: 3 });
  });
  it('max_retries=0 трактуется как 3', () => {
    expect(nextAttempt({ retry_count: 1, max_retries: 0 }, NOW).status).toBe('pending');
  });
});

describe('письмо из строки очереди', () => {
  it('Message-ID на нашем домене, List-Unsubscribe, threading', () => {
    const m = mailFromItem(item('1', { in_reply_to: '<x@y>', references: '<x@y>', email_account_id: 'acc9' }), new Set());
    expect(m.messageId).toBe(messageIdFor(item('1')));
    expect(m.messageId).toMatch(/@zapishisya\.ru>$/);
    expect(m.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.inReplyTo).toBe('<x@y>');
    expect(m.accountId).toBe('acc9');
  });
  it('существующий message_id сохраняется (идемпотентность повтора)', () => {
    expect(messageIdFor(item('1', { message_id: '<keep@x>' }))).toBe('<keep@x>');
  });
});

describe('runQueue', () => {
  it(`отправляет до ${MAX_PER_RUN} писем за вызов`, async () => {
    const m = memoryStore(Array.from({ length: 60 }, (_, i) => item(String(i + 1))));
    const r = await runQueue(deps(m.store, rotatingSend()).d);
    expect(r.sent).toBe(MAX_PER_RUN);
    expect([...m.state.values()].filter((x) => x.status === 'pending')).toHaveLength(10);
  });

  it('пустая очередь', async () => {
    expect(await runQueue(deps(memoryStore([]).store, rotatingSend()).d)).toMatchObject({ sent: 0, stopped: 'empty' });
  });

  it('останавливается по бюджету времени', async () => {
    let t = NOW.getTime();
    const clock = () => new Date((t += 3_000));
    const m = memoryStore([item('1'), item('2'), item('3'), item('4')]);
    const r = await runQueue({ ...deps(m.store, rotatingSend(), clock).d, budgetMs: 8_000 });
    expect(r.stopped).toBe('budget');
    expect(r.sent).toBeLessThan(4);
  });

  it('нет свободного ящика: письмо возвращается в pending без траты попытки', async () => {
    const m = memoryStore([item('1'), item('2')]);
    const r = await runQueue(deps(m.store, async () => fail('no_account', null)).d);
    expect(r.stopped).toBe('no_account');
    expect(m.state.get('1')).toMatchObject({ status: 'pending', retry_count: 0 });
  });

  it('soft-ошибка → retry через 1 ч', async () => {
    const m = memoryStore([item('1')]);
    const r = await runQueue(deps(m.store, async () => fail('soft')).d);
    expect(r.retried).toBe(1);
    expect(m.state.get('1')).toMatchObject({ status: 'pending', retry_count: 1, next_retry_at: new Date(NOW.getTime() + HOUR).toISOString() });
  });

  it('третья неудача → failed + Telegram-алерт без адреса', async () => {
    const m = memoryStore([item('1', { retry_count: 2 })]);
    const t = deps(m.store, async () => fail('network'));
    const r = await runQueue(t.d);
    expect(r.failed).toBe(1);
    expect(m.state.get('1')?.status).toBe('failed');
    expect(t.alerts).toHaveLength(1);
    expect(t.alerts[0]).not.toContain('1@client.ru');
  });

  it('hard bounce → failed сразу и запись в email_bounces', async () => {
    const m = memoryStore([item('1')]);
    const r = await runQueue(deps(m.store, async () => fail('hard_bounce')).d);
    expect(r.bounced).toBe(1);
    expect(m.state.get('1')?.status).toBe('failed');
    expect(m.bounces).toEqual(['1@client.ru']);
  });

  it('отписавшемуся не отправляется', async () => {
    const send = vi.fn(async () => ok());
    const m = memoryStore([item('1')], { unsubscribed: ['1@client.ru'] });
    const r = await runQueue(deps(m.store, send).d);
    expect(r.unsubscribed).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('строку, забранную другим вызовом, не отправляем повторно', async () => {
    const send = vi.fn(async () => ok());
    const m = memoryStore([item('1')], { stolen: ['1'] });
    await runQueue(deps(m.store, send).d);
    expect(send).not.toHaveBeenCalled();
  });

  it('ящик используется не больше одного раза за вызов', async () => {
    const seen: (ReadonlySet<string> | undefined)[] = [];
    const send = async (o: MailOptions) => {
      seen.push(new Set(o.excludeAccounts));
      return ok(`acc${seen.length}`);
    };
    await runQueue(deps(memoryStore([item('1'), item('2'), item('3')]).store, send).d);
    expect([...(seen[2] ?? [])]).toEqual(['acc1', 'acc2']);
  });

  it('письмо с привязкой к уже занятому ящику ждёт следующего вызова', async () => {
    const m = memoryStore([item('1'), item('2', { email_account_id: 'acc1' })]);
    const r = await runQueue(deps(m.store, async () => ok('acc1')).d);
    expect(r.sent).toBe(1);
    expect(m.state.get('2')?.status).toBe('pending');
  });
});

describe('runQueue: устойчивость (раунд 2)', () => {
  it('сбой записи после отправки не приводит к повторной отправке', async () => {
    const m = memoryStore([item('1')]);
    let calls = 0;
    const store: QueueStore = { ...m.store, markSent: async () => {
      calls += 1;
      throw new Error('db down');
    } };
    const send = vi.fn(async () => ok());
    const logs: string[] = [];
    const r = await runQueue({ ...deps(store, send).d, log: async (msg: string) => void logs.push(msg) });
    expect(r.sent).toBe(1);
    expect(r.retried).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
    expect(logs.some((l) => l.includes('не записано'))).toBe(true);
    expect(logs.join(' ')).not.toContain('1@client.ru');
  });

  it('повторная запись после разового сбоя проходит', async () => {
    const m = memoryStore([item('1')]);
    let calls = 0;
    const store: QueueStore = { ...m.store, markSent: async (i, res, iso) => {
      calls += 1;
      if (calls === 1) throw new Error('blip');
      await m.store.markSent(i, res, iso);
    } };
    const r = await runQueue(deps(store, async () => ok()).d);
    expect(r.sent).toBe(1);
    expect(m.state.get('1')?.status).toBe('sent');
  });

  it('сбой БД на одном письме не останавливает остальные', async () => {
    const m = memoryStore([item('1'), item('2')]);
    const store: QueueStore = { ...m.store, isUnsubscribed: async (e) => {
      if (e === '1@client.ru') throw new Error('db down');
      return false;
    } };
    const r = await runQueue(deps(store, rotatingSend()).d);
    expect(r).toMatchObject({ sent: 1, errors: 1 });
    expect(m.state.get('2')?.status).toBe('sent');
  });

  it('deadline передаётся в отправку', async () => {
    const seen: (number | undefined)[] = [];
    const send = async (o: MailOptions) => {
      seen.push(o.deadline);
      return ok();
    };
    await runQueue({ ...deps(memoryStore([item('1')]).store, send).d, budgetMs: 5_000 });
    expect(seen[0]).toBe(NOW.getTime() + 5_000);
  });
});

describe('runQueue: подавление адресов (раунд 3)', () => {
  it('адрес с прошлым hard bounce не отправляется', async () => {
    const send = vi.fn(async () => ok());
    const m = memoryStore([item('1'), item('2')], { hardBounced: ['1@client.ru'] });
    const r = await runQueue(deps(m.store, send).d);
    expect(r).toMatchObject({ suppressed: 1, sent: 1 });
    expect(m.state.get('1')).toMatchObject({ status: 'failed', error: 'suppressed: hard bounce' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
