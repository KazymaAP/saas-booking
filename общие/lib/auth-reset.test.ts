// lib/auth-reset.test.ts — unit-тесты сброса пароля (задача 7, ТЗ §5.5). Подмены — lib/__test__/setup.ts.
import './__test__/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as harness from './__test__/harness';
import { resetAll, sessionFor, tokenFromLastMail } from './__test__/helpers';
import * as core from './auth-core';
import * as provider from './auth-provider';
import * as reset from './auth-reset';
import * as flow from './auth-flow';

const IP = '198.51.100.9';
const NEW_PASSWORD = 'new-strong-password';

function seedOwnerBusiness(status = 'client'): void {
  harness.seed('businesses', [{ id: 'b1', slug: 'tire', status, name: 'Шиномонтаж' }]);
  harness.seed('admin_users', [{ id: 'm1', business_id: 'b1', auth_user_id: 'owner-1', role: 'owner', email: 'owner@biz.ru' }]);
}

function lastRow(): harness.Row | undefined {
  return harness.tables.get('auth_tokens')?.at(-1);
}

// Провайдер «как настоящий»: сессия без пароля, смена пароля, отзыв сессий, вход новым паролем.
function providerHappyPath(email: string, id: string): void {
  vi.mocked(provider.sessionWithoutPassword).mockResolvedValue(sessionFor(email, `${id}-tmp`));
  vi.mocked(provider.setUserPassword).mockResolvedValue(true);
  vi.mocked(provider.revokeAllSessions).mockResolvedValue(undefined);
  vi.mocked(provider.passwordSignIn).mockResolvedValue(sessionFor(email, id));
}

async function requestAdminReset(): Promise<string> {
  expect(await reset.requestPasswordReset({ email: 'boss@example.com', realm: 'admin', returnTo: null, ip: IP })).toBe('sent');
  return tokenFromLastMail();
}

beforeEach(() => {
  resetAll();
  seedOwnerBusiness();
});

describe('auth-reset: запрос', () => {
  it('письмо со ссылкой /reset-password?token=, TTL 1 час, в БД только дайджест', async () => {
    const before = Date.now();
    const token = await requestAdminReset();
    expect(harness.sentMails.at(-1)?.text).toContain(`/reset-password?token=${token}`);
    const row = lastRow();
    expect(row).toMatchObject({ kind: 'reset', email: 'boss@example.com', realm: 'admin', return_to: '/admin' });
    expect(row?.token_digest).toBe(core.tokenDigest(token));
    const ttl = Date.parse(String(row?.expires_at)) - before;
    expect(Math.abs(ttl - core.RESET_TTL_SECONDS * 1000)).toBeLessThan(5000);
  });

  it('незнакомый адрес — тот же ответ, письма нет, событие в журнале', async () => {
    expect(await reset.requestPasswordReset({ email: 'ghost@example.com', realm: 'admin', returnTo: null, ip: IP })).toBe('sent');
    expect(await reset.requestPasswordReset({ email: 'ghost@biz.ru', realm: 'owner', returnTo: '/s/tire/panel', ip: IP })).toBe('sent');
    expect(harness.sentMails).toHaveLength(0);
    expect(harness.auditCalls.filter((c) => c.action === 'auth:reset_rejected')).toHaveLength(2);
  });

  it('rate limit 3/15 мин/email', async () => {
    const out: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      out.push(await reset.requestPasswordReset({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/s/tire/panel', ip: `10.1.0.${i}` }));
    }
    expect(out).toEqual(['sent', 'sent', 'sent', 'rate_limited']);
  });

  it('rate limit 10/15 мин/IP: перебор адресов с одного IP', async () => {
    const out: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      out.push(await reset.requestPasswordReset({ email: `user${i}@example.com`, realm: 'admin', returnTo: null, ip: IP }));
    }
    expect(out.at(-1)).toBe('rate_limited');
    expect(out.slice(0, 10).every((r) => r === 'sent')).toBe(true);
  });

  it('невалидный email', async () => {
    expect(await reset.requestPasswordReset({ email: '', realm: 'admin', returnTo: null, ip: IP })).toBe('invalid_email');
  });
});

describe('auth-reset: установка нового пароля', () => {
  it('успех: пароль сменён, прежние сессии отозваны, новая сессия, ссылка одноразовая', async () => {
    const token = await requestAdminReset();
    providerHappyPath('boss@example.com', 'boss');
    const r = await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP });
    expect(r).toEqual({ kind: 'ok', redirectTo: '/admin' });
    expect(provider.setUserPassword).toHaveBeenCalledWith('boss-tmp', NEW_PASSWORD);
    expect(provider.revokeAllSessions).toHaveBeenCalledWith('access-boss-tmp');
    expect(harness.jar.get('sa_session')).toMatchObject({ value: 'access-boss', httpOnly: true, secure: true, sameSite: 'lax' });
    expect(await reset.peekPasswordReset(token)).toBe('used');
    expect((await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP })).kind).toBe('invalid');
  });

  it('короткий/длинный пароль и несовпадение не гасят ссылку', async () => {
    const token = await requestAdminReset();
    expect((await reset.completePasswordReset({ token, password: 'short', confirm: 'short', ip: IP })).kind).toBe('too_short');
    const long = 'я'.repeat(40);
    expect((await reset.completePasswordReset({ token, password: long, confirm: long, ip: IP })).kind).toBe('too_long');
    expect((await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: 'other-password', ip: IP })).kind).toBe('mismatch');
    expect(await reset.peekPasswordReset(token)).toBe('valid');
    expect(provider.setUserPassword).not.toHaveBeenCalled();
  });

  it('истёкшая ссылка (TTL 1 час) отклоняется', async () => {
    const token = await requestAdminReset();
    const row = lastRow();
    if (row) row.expires_at = new Date(Date.now() - 1).toISOString();
    expect(await reset.peekPasswordReset(token)).toBe('expired');
    expect((await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP })).kind).toBe('invalid');
  });

  it('сбой провайдера при смене пароля — ссылка возвращается в оборот', async () => {
    const token = await requestAdminReset();
    vi.mocked(provider.sessionWithoutPassword).mockResolvedValue(sessionFor('boss@example.com', 'boss-tmp'));
    vi.mocked(provider.setUserPassword).mockResolvedValue(false);
    expect((await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP })).kind).toBe('error');
    expect(await reset.peekPasswordReset(token)).toBe('valid');
  });

  it('сбой отзыва сессий не отменяет смену пароля, событие в журнале', async () => {
    const token = await requestAdminReset();
    providerHappyPath('boss@example.com', 'boss');
    vi.mocked(provider.revokeAllSessions).mockRejectedValue(new Error('revoke failed: 500'));
    expect((await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP })).kind).toBe('ok');
    expect(harness.auditCalls.some((c) => String(c.payload.reason ?? '').startsWith('revoke_failed'))).toBe(true);
  });

  it('владелец: вход в кабинет; бизнес стал неактивным — changed со ссылкой на вход кабинета', async () => {
    await reset.requestPasswordReset({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/s/tire/panel', ip: IP });
    const token = tokenFromLastMail();
    providerHappyPath('owner@biz.ru', 'owner-1');
    seedOwnerBusiness('archived');
    const r = await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP });
    expect(r).toEqual({ kind: 'changed', loginPath: '/s/tire/panel/login' });
    expect(harness.jar.has('biz_session')).toBe(false);
  });

  it('владелец: успешный сброс ведёт в кабинет', async () => {
    await reset.requestPasswordReset({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/s/tire/panel', ip: IP });
    providerHappyPath('owner@biz.ru', 'owner-1');
    const r = await reset.completePasswordReset({ token: tokenFromLastMail(), password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP });
    expect(r).toEqual({ kind: 'ok', redirectTo: '/s/tire/panel' });
    expect(harness.jar.get('biz_session')?.value).toBe('access-owner-1');
  });

  it('журнал без PII: пароль, email и токен не попадают в audit', async () => {
    const token = await requestAdminReset();
    providerHappyPath('boss@example.com', 'boss');
    await reset.completePasswordReset({ token, password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP });
    const dump = JSON.stringify(harness.auditCalls);
    expect(dump).not.toContain(NEW_PASSWORD);
    expect(dump).not.toContain('boss@example.com');
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(IP);
  });

  it('перебор токенов ограничен token_verify 20/15 мин/IP', async () => {
    const kinds: string[] = [];
    for (let i = 0; i < 21; i += 1) {
      kinds.push((await reset.completePasswordReset({ token: core.generateToken(), password: NEW_PASSWORD, confirm: NEW_PASSWORD, ip: IP })).kind);
    }
    expect(kinds.at(-1)).toBe('rate_limited');
  });
});

describe('auth-flow', () => {
  it('normalizeReturnTo и loginPathFor', () => {
    expect(flow.normalizeReturnTo('admin', null)).toBe('/admin');
    expect(flow.normalizeReturnTo('admin', '/panel/clients?x=1')).toBe('/panel/clients?x=1');
    expect(flow.normalizeReturnTo('owner', '/s/tire/panel/bookings')).toBe('/s/tire/panel/bookings');
    expect(flow.normalizeReturnTo('owner', '/panel')).toBeNull();
    expect(flow.normalizeReturnTo('owner', 'https://evil.com/s/x/panel')).toBeNull();
    expect(flow.loginPathFor('owner', '/s/tire/panel/bookings')).toBe('/s/tire/panel/login');
    expect(flow.loginPathFor('admin', '/panel/clients')).toBe('/panel/login');
    expect(flow.loginPathFor('owner', null)).toBe('/panel/login');
  });
});
