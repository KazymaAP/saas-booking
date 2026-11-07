// lib/notify.test.ts — sendMailWith: выбор ящика, лимиты, retry, классификация ошибок, маскирование PII.
// SMTP и БД заменены фейками: транспорт записывает письма, хранилище ящиков живёт в памяти.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptSecret } from './crypto';
import { invalidateAccountCache, todayMsk, type EmailAccountRecord, type EmailAccountStore, type SmtpOptions } from './email-accounts';
import {
  backoffMs,
  classifySmtpError,
  isValidEmail,
  maskEmail,
  maskPii,
  MAX_ATTEMPTS,
  sendMailWith,
  type MailTransport,
  type NotifyDeps,
} from './notify';

const KEY = 'b'.repeat(64);
const NOW = new Date('2026-10-15T09:00:00Z');

function account(id: string, patch: Partial<EmailAccountRecord> = {}): EmailAccountRecord {
  return {
    id,
    email: `${id}@sender.ru`,
    from_name: 'Сервис',
    reply_to: null,
    smtp_host: 'smtp.yandex.ru',
    smtp_port: 465,
    smtp_secure: 'tls',
    smtp_user: null,
    smtp_pass_encrypted: encryptSecret(`pass-${id}`),
    imap_host: null,
    imap_port: null,
    imap_secure: null,
    imap_user: null,
    imap_pass_encrypted: null,
    daily_limit: 50,
    sent_today: 0,
    last_reset: todayMsk(NOW),
    active: true,
    last_error: null,
    last_checked_at: null,
    ...patch,
  };
}

function memoryStore(rows: EmailAccountRecord[]): EmailAccountStore & { rows: EmailAccountRecord[] } {
  return {
    rows,
    async listActive() {
      return rows.filter((r) => r.active).map((r) => ({ ...r }));
    },
    async getById(id) {
      const r = rows.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    async resetDaily(today) {
      for (const r of rows) if (r.last_reset !== today) Object.assign(r, { sent_today: 0, last_reset: today });
    },
    async incrementIfUnchanged(id, expected, today) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.sent_today !== expected) return false;
      Object.assign(r, { sent_today: expected + 1, last_reset: today });
      return true;
    },
    async setStatus(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
  };
}

type SmtpFailure = { message: string; responseCode?: number; code?: string };

// Фейковый SMTP: по ящику (auth.user) можно задать очередь ошибок.
function fakeSmtp(failures: Record<string, SmtpFailure[]> = {}) {
  const sent: { user: string; message: Record<string, unknown> }[] = [];
  const create = (opts: SmtpOptions): MailTransport => ({
    async sendMail(message) {
      const queue = failures[opts.auth.user];
      const failure = queue?.shift();
      if (failure) throw Object.assign(new Error(failure.message), failure);
      sent.push({ user: opts.auth.user, message });
      return { messageId: `<m${sent.length}@sender.ru>` };
    },
  });
  return { sent, create };
}

function deps(store: EmailAccountStore, smtp: ReturnType<typeof fakeSmtp>) {
  const sleeps: number[] = [];
  const logs: { message: string; payload: Record<string, unknown> }[] = [];
  const d: NotifyDeps = {
    store,
    createTransport: smtp.create,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    log: async (message, payload) => {
      logs.push({ message, payload });
    },
    now: () => NOW,
  };
  return { d, sleeps, logs };
}

const MAIL = { to: 'client@example.com', subject: 'Тема', text: 'Текст' };

describe('notify: PII', () => {
  it('маскирует email', () => {
    expect(maskEmail('ivan.petrov@mail.ru')).toBe('i***v@m***.ru');
    expect(maskEmail('ab@x.com')).toBe('a***@x***.com');
    expect(maskEmail('')).toBe('');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('маскирует адреса и телефоны в тексте ошибки', () => {
    const out = maskPii('550 user ivan@mail.ru unknown, call +7 999 123-45-67');
    expect(out).not.toContain('ivan@mail.ru');
    expect(out).not.toContain('123-45');
    expect(out).toContain('i***n@m***.ru');
  });
});

describe('notify: классификация ошибок SMTP', () => {
  it('hard bounce 550/551/553', () => {
    for (const code of [550, 551, 553]) expect(classifySmtpError({ message: 'x', responseCode: code }).kind).toBe('hard_bounce');
  });
  it('soft 421/450/452', () => {
    for (const code of [421, 450, 452]) expect(classifySmtpError({ message: 'x', responseCode: code }).kind).toBe('soft');
  });
  it('auth: EAUTH и 535', () => {
    expect(classifySmtpError({ message: 'x', code: 'EAUTH' }).kind).toBe('auth');
    expect(classifySmtpError({ message: 'x', responseCode: 535 }).kind).toBe('auth');
  });
  it('сеть: без кода ответа', () => {
    expect(classifySmtpError(new Error('ETIMEDOUT')).kind).toBe('network');
    expect(classifySmtpError('строка').kind).toBe('network');
  });
});

describe('notify: вспомогательное', () => {
  it('валидация адреса', () => {
    expect(isValidEmail('a@b.ru')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.ru')).toBe(false);
    expect(isValidEmail('<a@b.ru>')).toBe(false);
  });
  it('экспоненциальная пауза', () => {
    expect(backoffMs(1)).toBe(backoffMs(0) * 2);
    expect(backoffMs(2)).toBe(backoffMs(0) * 4);
  });
});

describe('notify: sendMailWith', () => {
  const saved = process.env.ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
    invalidateAccountCache();
  });
  afterEach(() => {
    process.env.ENCRYPTION_KEY = saved;
  });

  it('выбирает ящик с наименьшим sent_today и увеличивает счётчик', async () => {
    const store = memoryStore([account('a', { sent_today: 10 }), account('b', { sent_today: 3 })]);
    const smtp = fakeSmtp();
    const r = await sendMailWith(deps(store, smtp).d, MAIL);
    expect(r.ok).toBe(true);
    expect(smtp.sent[0].user).toBe('b@sender.ru');
    expect(store.rows.find((x) => x.id === 'b')?.sent_today).toBe(4);
  });

  it('пропускает ящик с исчерпанным лимитом и неактивный', async () => {
    const store = memoryStore([account('a', { sent_today: 50 }), account('b', { active: false }), account('c', { sent_today: 49 })]);
    const smtp = fakeSmtp();
    const r = await sendMailWith(deps(store, smtp).d, MAIL);
    expect(r.ok && r.accountId).toBe('c');
  });

  it('сбрасывает sent_today при смене дня', async () => {
    const store = memoryStore([account('a', { sent_today: 50, last_reset: '2026-10-14' })]);
    const smtp = fakeSmtp();
    const r = await sendMailWith(deps(store, smtp).d, MAIL);
    expect(r.ok).toBe(true);
    expect(store.rows[0].sent_today).toBe(1);
    expect(store.rows[0].last_reset).toBe(todayMsk(NOW));
  });

  it('нет ящиков → no_account, без попыток', async () => {
    const r = await sendMailWith(deps(memoryStore([account('a', { sent_today: 50 })]), fakeSmtp()).d, MAIL);
    expect(r).toMatchObject({ ok: false, reason: 'no_account', attempts: 0 });
  });

  it('некорректный адрес не отправляется', async () => {
    const smtp = fakeSmtp();
    const r = await sendMailWith(deps(memoryStore([account('a')]), smtp).d, { ...MAIL, to: 'bad' });
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    expect(smtp.sent).toHaveLength(0);
  });

  it('soft-ошибка: повтор с паузой, затем успех', async () => {
    const smtp = fakeSmtp({ 'a@sender.ru': [{ message: '451 try later', responseCode: 451 }] });
    const t = deps(memoryStore([account('a')]), smtp);
    const r = await sendMailWith(t.d, MAIL);
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(t.sleeps).toEqual([backoffMs(0)]);
  });

  it('3 soft-ошибки → провал после MAX_ATTEMPTS, пауза растёт', async () => {
    const fail = { message: '452 mailbox full', responseCode: 452 };
    const smtp = fakeSmtp({ 'a@sender.ru': [fail, fail, fail] });
    const t = deps(memoryStore([account('a')]), smtp);
    const r = await sendMailWith(t.d, MAIL);
    expect(r).toMatchObject({ ok: false, reason: 'soft', code: 452, attempts: MAX_ATTEMPTS });
    expect(t.sleeps).toEqual([backoffMs(0), backoffMs(1)]);
  });

  it('hard bounce не повторяется', async () => {
    const smtp = fakeSmtp({ 'a@sender.ru': [{ message: '550 no such user', responseCode: 550 }] });
    const t = deps(memoryStore([account('a')]), smtp);
    const r = await sendMailWith(t.d, MAIL);
    expect(r).toMatchObject({ ok: false, reason: 'hard_bounce', attempts: 1 });
    expect(t.sleeps).toHaveLength(0);
  });

  it('ошибка авторизации: ящик помечается и берётся другой', async () => {
    const store = memoryStore([account('a'), account('b', { sent_today: 5 })]);
    const smtp = fakeSmtp({ 'a@sender.ru': [{ message: 'Invalid login', code: 'EAUTH' }] });
    const r = await sendMailWith(deps(store, smtp).d, MAIL);
    expect(r.ok && r.accountId).toBe('b');
    expect(store.rows[0].last_error).toContain('Invalid login');
  });

  it('явный accountId с ошибкой авторизации — без повторов', async () => {
    const smtp = fakeSmtp({ 'a@sender.ru': [{ message: 'Invalid login', code: 'EAUTH' }] });
    const t = deps(memoryStore([account('a'), account('b')]), smtp);
    const r = await sendMailWith(t.d, { ...MAIL, accountId: 'a' });
    expect(r).toMatchObject({ ok: false, reason: 'auth', accountId: 'a', attempts: 1 });
    expect(smtp.sent).toHaveLength(0);
  });

  it('excludeAccounts исключает занятые ящики', async () => {
    const smtp = fakeSmtp();
    const r = await sendMailWith(deps(memoryStore([account('a'), account('b', { sent_today: 9 })]), smtp).d, { ...MAIL, excludeAccounts: new Set(['a']) });
    expect(r.ok && r.accountId).toBe('b');
  });

  it('заголовки, threading и From с именем передаются в транспорт', async () => {
    const smtp = fakeSmtp();
    await sendMailWith(deps(memoryStore([account('a', { reply_to: 'reply@sender.ru' })]), smtp).d, {
      ...MAIL,
      headers: { 'List-Unsubscribe': '<https://x/u>' },
      inReplyTo: '<orig@x>',
      references: '<orig@x>',
    });
    const m = smtp.sent[0].message;
    expect(m.from).toBe('"Сервис" <a@sender.ru>');
    expect(m.replyTo).toBe('reply@sender.ru');
    expect(m.inReplyTo).toBe('<orig@x>');
    expect(m.headers).toEqual({ 'List-Unsubscribe': '<https://x/u>' });
  });

  it('в логах нет адреса получателя и пароля', async () => {
    const fail = { message: '450 client@example.com busy', responseCode: 450 };
    const t = deps(memoryStore([account('a')]), fakeSmtp({ 'a@sender.ru': [fail, fail, fail] }));
    await sendMailWith(t.d, MAIL);
    const dump = JSON.stringify(t.logs);
    expect(t.logs.length).toBe(MAX_ATTEMPTS);
    expect(dump).not.toContain('client@example.com');
    expect(dump).not.toContain('pass-a');
  });
});

describe('notify: устойчивость (раунд 2)', () => {
  const saved = process.env.ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
    invalidateAccountCache();
  });
  afterEach(() => {
    process.env.ENCRYPTION_KEY = saved;
  });

  it('сбой учёта sent_today после отправки не превращает успех в ошибку', async () => {
    const store = memoryStore([account('a')]);
    const broken: EmailAccountStore = { ...store, incrementIfUnchanged: async () => Promise.reject(new Error('db down')) };
    const smtp = fakeSmtp();
    const t = deps(broken, smtp);
    const r = await sendMailWith(t.d, MAIL);
    expect(r.ok).toBe(true);
    expect(smtp.sent).toHaveLength(1);
    expect(t.logs.some((l) => l.message.includes('учёт отправки не записан'))).toBe(true);
  });

  it('deadline: повтор не начинается, если пауза выходит за бюджет', async () => {
    const fail = { message: '451 try later', responseCode: 451 };
    const smtp = fakeSmtp({ 'a@sender.ru': [fail, fail, fail] });
    const t = deps(memoryStore([account('a')]), smtp);
    const r = await sendMailWith(t.d, { ...MAIL, deadline: NOW.getTime() + backoffMs(0) - 1 });
    expect(r).toMatchObject({ ok: false, reason: 'soft', attempts: 1 });
    expect(t.sleeps).toHaveLength(0);
  });

  it('без deadline — все попытки', async () => {
    const fail = { message: '451 try later', responseCode: 451 };
    const smtp = fakeSmtp({ 'a@sender.ru': [fail, fail, fail] });
    const r = await sendMailWith(deps(memoryStore([account('a')]), smtp).d, MAIL);
    expect(r.attempts).toBe(MAX_ATTEMPTS);
  });
});
