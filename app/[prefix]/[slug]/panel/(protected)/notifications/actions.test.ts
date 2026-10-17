// notifications/actions.test.ts — Vitest: server actions подключения Telegram (ТЗ §18.3, §36).
// Supabase — in-memory (lib/telegram.fake-db.ts), сессия владельца и revalidatePath — моки.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/telegram.fake-db';

const fake = createFakeDb();
vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const owner = vi.hoisted(() => ({ value: null as null | { business: { id: string }; member: { role: string } } }));
vi.mock('@/lib/owner-session', () => ({ currentOwner: async () => owner.value }));

import { checkTelegramStatus, createTelegramCode, disconnectTelegram } from './actions';
import { deepLink, formatLeft } from './telegram-view';
import { CODE_TTL_MS, resetConnectState } from '@/lib/telegram-connect';

const BUSINESS = 'b1';

function codes() {
  return fake.tables.business_telegram_codes ?? [];
}

beforeEach(() => {
  fake.reset();
  resetConnectState();
  fake.tables.businesses = [{ id: BUSINESS, name: 'Студия', telegram_chat_id: null, telegram_connected_at: null }];
  owner.value = { business: { id: BUSINESS }, member: { role: 'owner' } };
});

describe('createTelegramCode', () => {
  it('выдаёт код BIZ-xxxxxx с TTL 15 минут', async () => {
    const before = Date.now();
    const res = await createTelegramCode('m', 'studio');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.code).toMatch(/^BIZ-[A-Z2-9]{6}$/);
    const ttl = new Date(res.state.expiresAt ?? 0).getTime() - before;
    expect(ttl).toBeGreaterThan(CODE_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(CODE_TTL_MS + 5_000);
  });

  it('новый код гасит прежний неиспользованный', async () => {
    await createTelegramCode('m', 'studio');
    const second = await createTelegramCode('m', 'studio');
    expect(codes()).toHaveLength(1);
    expect(second.ok && codes()[0].code === second.state.code).toBe(true);
  });

  it('без сессии → unauthorized, код не создаётся', async () => {
    owner.value = null;
    const res = await createTelegramCode('m', 'studio');
    expect(res).toEqual({ ok: false, error: 'unauthorized', state: null });
    expect(codes()).toHaveLength(0);
  });

  it('уже подключён → already_connected', async () => {
    fake.tables.businesses[0].telegram_chat_id = '42';
    const res = await createTelegramCode('m', 'studio');
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toBe('already_connected');
  });

  it('не больше 5 кодов за 10 минут', async () => {
    for (let i = 0; i < 5; i++) expect((await createTelegramCode('m', 'studio')).ok).toBe(true);
    const sixth = await createTelegramCode('m', 'studio');
    expect(!sixth.ok && sixth.error).toBe('rate_limited');
  });
});

describe('disconnectTelegram', () => {
  it('сбрасывает chat_id, удаляет неиспользованные коды и пишет audit', async () => {
    fake.tables.businesses[0].telegram_chat_id = '42';
    fake.tables.business_telegram_codes = [{ code: 'BIZ-AAAAAA', business_id: BUSINESS, created_at: new Date().toISOString(), used_at: null }];
    const res = await disconnectTelegram('m', 'studio');
    expect(res.ok && res.state.connected).toBe(false);
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
    expect(codes()).toHaveLength(0);
    expect((fake.tables.audit_log ?? []).some((r) => r.action === 'telegram_disconnected')).toBe(true);
  });

  it('без сессии ничего не меняет', async () => {
    fake.tables.businesses[0].telegram_chat_id = '42';
    owner.value = null;
    await disconnectTelegram('m', 'studio');
    expect(fake.tables.businesses[0].telegram_chat_id).toBe('42');
  });
});

describe('checkTelegramStatus', () => {
  it('показывает действующий код, пока чат не привязан', async () => {
    const created = await createTelegramCode('m', 'studio');
    const res = await checkTelegramStatus('m', 'studio');
    expect(res.ok && created.ok && res.state.code === created.state.code).toBe(true);
  });

  it('истёкший код не показывается', async () => {
    fake.tables.business_telegram_codes = [{
      code: 'BIZ-OLDOLD', business_id: BUSINESS, used_at: null,
      created_at: new Date(Date.now() - CODE_TTL_MS - 1_000).toISOString(),
    }];
    const res = await checkTelegramStatus('m', 'studio');
    expect(res.ok && res.state.code).toBeNull();
  });

  it('после /start в боте → connected', async () => {
    fake.tables.businesses[0].telegram_chat_id = '42';
    fake.tables.businesses[0].telegram_connected_at = '2026-10-15T10:00:00.000Z';
    const res = await checkTelegramStatus('m', 'studio');
    expect(res.ok && res.state).toEqual({ connected: true, connectedAt: '2026-10-15T10:00:00.000Z', code: null, expiresAt: null });
  });
});

describe('telegram-view', () => {
  it('deepLink кодирует параметры и требует имя бота', () => {
    expect(deepLink('zapis_bot', 'BIZ-ABC234')).toBe('https://t.me/zapis_bot?start=BIZ-ABC234');
    expect(deepLink(null, 'BIZ-ABC234')).toBeNull();
    expect(deepLink('zapis_bot', null)).toBeNull();
  });

  it('formatLeft', () => {
    expect(formatLeft(CODE_TTL_MS)).toBe('15:00');
    expect(formatLeft(61_000)).toBe('1:01');
    expect(formatLeft(-5)).toBe('0:00');
  });
});
