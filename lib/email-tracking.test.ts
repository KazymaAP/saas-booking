// lib/email-tracking.test.ts — открытия/клики (идемпотентность, legacy-токены, fail open) и отписка.
// Supabase заменён фейком в памяти: поддерживаются только цепочки, которые использует email-tracking.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Result = { data: Row[] | null; error: { message: string } | null };

const tables: Record<string, Row[]> = {};
const failing = new Set<string>();

// Построитель: select | update | upsert + eq/is/limit; update(...).select() возвращает изменённые строки.
function query(table: string) {
  const filters: Filter[] = [];
  let patch: Row | null = null;
  const run = (): Result => {
    if (failing.has(table)) return { data: null, error: { message: `${table} down` } };
    const rows = tables[table] ?? [];
    const matched = rows.filter((r) => filters.every((f) => f(r)));
    if (patch) for (const r of matched) Object.assign(r, patch);
    return { data: matched.map((r) => ({ ...r })), error: null };
  };
  const api = {
    select: () => api,
    update: (p: Row) => {
      patch = p;
      return api;
    },
    upsert: async (row: Row, opts: { onConflict: string }) => {
      if (failing.has(table)) return { error: { message: `${table} down` } };
      const list = (tables[table] ??= []);
      if (!list.some((r) => r[opts.onConflict] === row[opts.onConflict])) list.push({ ...row });
      return { error: null };
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return api;
    },
    is: (col: string, val: null) => {
      filters.push((r) => (r[col] ?? null) === val);
      return api;
    },
    limit: () => api,
    then: (resolve: (v: Result) => void) => resolve(run()),
  };
  return api;
}

const db = { from: (t: string) => query(t) } as unknown as SupabaseClient;
const logged: string[] = [];

vi.mock('./supabase', () => ({ adminClient: () => db }));
vi.mock('./log', () => ({ logError: async (_s: string, m: string) => void logged.push(m) }));
vi.mock('./rate-limit', () => ({ hitRateLimit: async () => true }));

const { allowTrack, clientIp, recordEvent, recordEventSafe, tokenKind, unsubscribeByToken, isTokenKnown, TRACK_LIMIT, TRACK_WINDOW_SECONDS } =
  await import('./email-tracking');

const TOKEN = '6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
const LEGACY = 'a'.repeat(32);
const T1 = new Date('2026-10-15T10:00:00Z');
const T2 = new Date('2026-10-15T11:00:00Z');

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  failing.clear();
  logged.length = 0;
  tables.outreach_log = [{ id: 'log1', tracking_token: TOKEN }, { id: 'log2', tracking_token: LEGACY }];
  tables.email_queue = [
    { id: 'q1', tracking_token: TOKEN, message_id: '<m1@zapishisya.ru>', business_id: 'b1', to_email: 'Owner@Koleso.ru', status: 'sent' },
    { id: 'q2', tracking_token: 'other', to_email: 'owner@koleso.ru', status: 'pending' },
  ];
  tables.emails_outgoing = [{ id: 'o1', message_id: '<m1@zapishisya.ru>' }, { id: 'o2', outreach_log_id: 'log2' }];
  tables.businesses = [{ id: 'b1', status: 'sent' }];
  tables.unsubscribes = [];
});

describe('tokenKind / clientIp', () => {
  it('различает uuid, legacy 32-hex и мусор', () => {
    expect(tokenKind(TOKEN)).toBe('queue');
    expect(tokenKind(LEGACY)).toBe('legacy');
    expect(tokenKind('../../etc')).toBe('invalid');
    expect(tokenKind('')).toBe('invalid');
  });

  it('берёт первый адрес из X-Forwarded-For, иначе X-Real-IP', () => {
    expect(clientIp(new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }))).toBe('1.2.3.4');
    expect(clientIp(new Request('https://x', { headers: { 'x-real-ip': '5.6.7.8' } }))).toBe('5.6.7.8');
    expect(clientIp(new Request('https://x'))).toBe('unknown');
  });
});

describe('allowTrack', () => {
  it('передаёт лимит 1000/час и ключ по scope+IP', async () => {
    const limiter = vi.fn(async () => false);
    expect(await allowTrack('open', '1.2.3.4', limiter)).toBe(false);
    expect(limiter).toHaveBeenCalledWith('track:open:1.2.3.4', TRACK_LIMIT, TRACK_WINDOW_SECONDS);
    expect(TRACK_LIMIT).toBe(1000);
    expect(TRACK_WINDOW_SECONDS).toBe(3600);
  });

  it('fail open: при сбое хранилища лимитов пропускает и логирует', async () => {
    const limiter = vi.fn(async () => {
      throw new Error('db down');
    });
    expect(await allowTrack('click', '1.2.3.4', limiter)).toBe(true);
    expect(logged.join(' ')).toContain('rate limit');
  });
});

describe('recordEvent', () => {
  it('открытие: outreach_log, emails_outgoing по message_id, бизнес sent → viewed', async () => {
    await recordEvent(TOKEN, 'opened_at', T1, db);
    expect(tables.outreach_log[0].opened_at).toBe(T1.toISOString());
    expect(tables.emails_outgoing[0].opened_at).toBe(T1.toISOString());
    expect(tables.businesses[0].status).toBe('viewed');
  });

  it('фиксирует только первое событие (повтор не перезаписывает время)', async () => {
    await recordEvent(TOKEN, 'clicked_at', T1, db);
    await recordEvent(TOKEN, 'clicked_at', T2, db);
    expect(tables.outreach_log[0].clicked_at).toBe(T1.toISOString());
    expect(tables.emails_outgoing[0].clicked_at).toBe(T1.toISOString());
  });

  it('клик не меняет статус бизнеса', async () => {
    await recordEvent(TOKEN, 'clicked_at', T1, db);
    expect(tables.businesses[0].status).toBe('sent');
  });

  it('не откатывает статус бизнеса, ушедшего дальше по воронке', async () => {
    tables.businesses[0].status = 'replied';
    await recordEvent(TOKEN, 'opened_at', T1, db);
    expect(tables.businesses[0].status).toBe('replied');
  });

  it('legacy-токен: emails_outgoing по outreach_log_id', async () => {
    await recordEvent(LEGACY, 'opened_at', T1, db);
    expect(tables.outreach_log[1].opened_at).toBe(T1.toISOString());
    expect(tables.emails_outgoing[1].opened_at).toBe(T1.toISOString());
    expect(tables.emails_outgoing[0].opened_at).toBeUndefined();
  });

  it('неизвестный и невалидный токены ничего не пишут', async () => {
    await recordEvent('00000000-0000-4000-8000-000000000000', 'opened_at', T1, db);
    await recordEvent('<script>', 'opened_at', T1, db);
    expect(tables.outreach_log.every((r) => r.opened_at === undefined)).toBe(true);
    expect(tables.emails_outgoing.every((r) => r.opened_at === undefined)).toBe(true);
  });

  it('recordEventSafe: сбой БД не выбрасывается наружу, а логируется', async () => {
    failing.add('outreach_log');
    await expect(recordEventSafe(TOKEN, 'opened_at')).resolves.toBeUndefined();
    expect(logged.join(' ')).toContain('track opened_at');
  });
});

describe('unsubscribeByToken', () => {
  it('добавляет адрес в нижнем регистре и отменяет pending-письма на него', async () => {
    const r = await unsubscribeByToken(TOKEN, 'one-click', db);
    expect(r).toEqual({ ok: true, already: false });
    expect(tables.unsubscribes).toEqual([{ email: 'owner@koleso.ru', reason: 'one-click' }]);
    expect(tables.email_queue[1]).toMatchObject({ status: 'failed', error: 'unsubscribed' });
    expect(tables.email_queue[0].status).toBe('sent');
  });

  it('идемпотентна: повторный вызов не создаёт дубль', async () => {
    await unsubscribeByToken(TOKEN, 'page', db);
    const again = await unsubscribeByToken(TOKEN, 'page', db);
    expect(again).toEqual({ ok: true, already: true });
    expect(tables.unsubscribes).toHaveLength(1);
  });

  it('принимает токен из самой таблицы unsubscribes', async () => {
    const t = '11111111-2222-4333-8444-555555555555';
    tables.unsubscribes = [{ email: 'x@y.ru', token: t }];
    expect(await unsubscribeByToken(t, 'page', db)).toEqual({ ok: true, already: true });
  });

  it('невалидный и неизвестный токены', async () => {
    expect(await unsubscribeByToken(LEGACY, 'page', db)).toEqual({ ok: false, reason: 'invalid' });
    expect(await unsubscribeByToken('00000000-0000-4000-8000-000000000000', 'page', db)).toEqual({ ok: false, reason: 'not_found' });
    expect(await isTokenKnown(TOKEN, db)).toBe(true);
    expect(await isTokenKnown('nope', db)).toBe(false);
  });

  it('обрезает причину до 200 символов', async () => {
    await unsubscribeByToken(TOKEN, 'x'.repeat(500), db);
    expect(String(tables.unsubscribes[0].reason)).toHaveLength(200);
  });
});
