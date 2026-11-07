// lib/email-accounts.test.ts — ротация ящиков, дневной лимит, сброс по смене дня (МСК), гонка счётчика.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptSecret } from './crypto';
import {
  chooseAccount,
  effectiveSentToday,
  fromHeader,
  imapOptions,
  invalidateAccountCache,
  markFailed,
  markHealthy,
  markSent,
  normalizeSecure,
  pickAccount,
  remainingCapacity,
  shortError,
  smtpOptions,
  toPublicAccount,
  todayMsk,
  type EmailAccountRecord,
  type EmailAccountStore,
} from './email-accounts';

const KEY = 'c'.repeat(64);
const NOW = new Date('2026-10-15T12:00:00Z');
const TODAY = todayMsk(NOW);

function acc(id: string, patch: Partial<EmailAccountRecord> = {}): EmailAccountRecord {
  return {
    id, email: `${id}@s.ru`, from_name: null, reply_to: null,
    smtp_host: null, smtp_port: null, smtp_secure: null, smtp_user: null, smtp_pass_encrypted: encryptSecret('p'),
    imap_host: null, imap_port: null, imap_secure: null, imap_user: null, imap_pass_encrypted: null,
    daily_limit: 50, sent_today: 0, last_reset: TODAY, active: true, last_error: null, last_checked_at: null,
    ...patch,
  };
}

function store(rows: EmailAccountRecord[], opts: { conflicts?: number } = {}) {
  let conflicts = opts.conflicts ?? 0;
  const calls = { listActive: 0, resetDaily: 0 };
  const s: EmailAccountStore = {
    async listActive() {
      calls.listActive += 1;
      return rows.filter((r) => r.active).map((r) => ({ ...r }));
    },
    async getById(id) {
      const r = rows.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    async resetDaily(today) {
      calls.resetDaily += 1;
      for (const r of rows) if (r.last_reset !== today) Object.assign(r, { sent_today: 0, last_reset: today });
    },
    async incrementIfUnchanged(id, expected, today) {
      const r = rows.find((x) => x.id === id);
      if (!r) return false;
      // Имитация параллельного cron: другой вызов успел увеличить счётчик.
      if (conflicts > 0) {
        conflicts -= 1;
        r.sent_today += 1;
        return false;
      }
      if (r.sent_today !== expected) return false;
      Object.assign(r, { sent_today: expected + 1, last_reset: today });
      return true;
    },
    async setStatus(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
  };
  return { s, calls };
}

describe('email-accounts', () => {
  const saved = process.env.ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
    invalidateAccountCache();
  });
  afterEach(() => {
    process.env.ENCRYPTION_KEY = saved;
  });

  it('todayMsk: 21:30 UTC уже следующий день по Москве', () => {
    expect(todayMsk(new Date('2026-10-15T20:59:00Z'))).toBe('2026-10-15');
    expect(todayMsk(new Date('2026-10-15T21:30:00Z'))).toBe('2026-10-16');
  });

  it('effectiveSentToday: вчерашний счётчик считается нулём', () => {
    expect(effectiveSentToday({ sent_today: 40, last_reset: '2026-10-14' }, TODAY)).toBe(0);
    expect(effectiveSentToday({ sent_today: 40, last_reset: TODAY }, TODAY)).toBe(40);
  });

  it('chooseAccount: минимальный sent_today среди доступных', () => {
    const list = [acc('a', { sent_today: 5 }), acc('b', { sent_today: 2 }), acc('c', { sent_today: 50 }), acc('d', { smtp_pass_encrypted: null })];
    expect(chooseAccount(list, TODAY)?.id).toBe('b');
    expect(chooseAccount(list, TODAY, new Set(['b']))?.id).toBe('a');
    expect(chooseAccount([acc('x', { active: false })], TODAY)).toBeNull();
  });

  it('chooseAccount транзакционное: берёт ящик с исчерпанным лимитом (№26)', () => {
    const list = [acc('a', { sent_today: 50 })]; // лимит 50 исчерпан
    expect(chooseAccount(list, TODAY)).toBeNull();
    expect(chooseAccount(list, TODAY, new Set(), true)?.id).toBe('a');
  });

  it('pickAccount транзакционное: выбирает ящик вне зависимости от лимита рассылки (№26)', async () => {
    const rows = [acc('a', { sent_today: 50, last_reset: TODAY })];
    const { s } = store(rows);
    expect(await pickAccount(s, { now: NOW })).toBeNull();
    expect((await pickAccount(s, { now: NOW, transactional: true }))?.id).toBe('a');
  });

  it('remainingCapacity суммирует остаток лимитов', () => {
    expect(remainingCapacity([acc('a', { sent_today: 10 }), acc('b', { sent_today: 50 }), acc('c', { sent_today: 99, last_reset: '2026-01-01' })], TODAY)).toBe(40 + 0 + 50);
  });

  it('pickAccount сбрасывает счётчики только при смене дня', async () => {
    const rows = [acc('a', { sent_today: 50, last_reset: '2026-10-14' })];
    const { s, calls } = store(rows);
    const picked = await pickAccount(s, { now: NOW });
    expect(picked?.id).toBe('a');
    expect(calls.resetDaily).toBe(1);
    expect(rows[0].sent_today).toBe(0);

    const second = store([acc('b')]);
    await pickAccount(second.s, { now: NOW });
    expect(second.calls.resetDaily).toBe(0);
  });

  it('список ящиков кешируется', async () => {
    const { s, calls } = store([acc('a')]);
    await pickAccount(s, { now: NOW });
    await pickAccount(s, { now: NOW });
    expect(calls.listActive).toBe(1);
  });

  it('markSent увеличивает счётчик и локальную копию', async () => {
    const rows = [acc('a', { sent_today: 3 })];
    const { s } = store(rows);
    const local = { ...rows[0] };
    expect(await markSent(s, local, NOW)).toBe(true);
    expect(rows[0].sent_today).toBe(4);
    expect(local.sent_today).toBe(4);
  });

  it('markSent при гонке перечитывает и повторяет', async () => {
    const rows = [acc('a', { sent_today: 3 })];
    const { s } = store(rows, { conflicts: 1 });
    expect(await markSent(s, { ...rows[0] }, NOW)).toBe(true);
    expect(rows[0].sent_today).toBe(5);
  });

  it('markFailed пишет укороченную ошибку, markHealthy очищает', async () => {
    const rows = [acc('a')];
    const { s } = store(rows);
    await markFailed(s, rows[0], `x${' y'.repeat(400)}`, NOW);
    expect((rows[0].last_error ?? '').length).toBeLessThanOrEqual(300);
    await markHealthy(s, { ...rows[0] }, NOW);
    expect(rows[0].last_error).toBeNull();
  });

  it('smtpOptions: Yandex по умолчанию, пароль расшифрован, таймауты', () => {
    const o = smtpOptions(acc('a'));
    expect(o).toMatchObject({ host: 'smtp.yandex.ru', port: 465, secure: true, requireTLS: false, auth: { user: 'a@s.ru', pass: 'p' } });
    expect(o.socketTimeout).toBeGreaterThan(0);
    expect(smtpOptions(acc('b', { smtp_port: 587, smtp_secure: null }))).toMatchObject({ secure: false, requireTLS: true });
  });

  it('imapOptions: без хоста — null, пароль SMTP как запасной', () => {
    expect(imapOptions(acc('a'))).toBeNull();
    expect(imapOptions(acc('a', { imap_host: 'imap.yandex.ru' }))).toMatchObject({ port: 993, secure: true, auth: { pass: 'p' } });
  });

  it('normalizeSecure', () => {
    expect(normalizeSecure('starttls', 465)).toBe('starttls');
    expect(normalizeSecure(null, 993)).toBe('tls');
    expect(normalizeSecure('bogus', 25)).toBe('starttls');
  });

  it('fromHeader убирает кавычки и переводы строк из имени', () => {
    expect(fromHeader({ email: 'a@s.ru', from_name: 'Сервис "Запись"\r\nBcc: x' })).toBe('"Сервис ЗаписьBcc: x" <a@s.ru>');
    expect(fromHeader({ email: 'a@s.ru', from_name: null })).toBe('a@s.ru');
  });

  it('toPublicAccount не отдаёт шифротекст', () => {
    const p = toPublicAccount(acc('a'));
    expect(JSON.stringify(p)).not.toContain('smtp_pass_encrypted');
    expect(p.has_smtp_pass).toBe(true);
    expect(p.has_imap_pass).toBe(false);
  });

  it('shortError схлопывает пробелы', () => {
    expect(shortError(' a \n  b ')).toBe('a b');
  });
});
