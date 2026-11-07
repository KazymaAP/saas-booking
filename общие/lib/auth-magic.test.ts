// lib/auth-magic.test.ts — unit-тесты входа по magic-link (задача 6, ТЗ §5.4).
// Подмены модулей — lib/__test__/setup.ts.
import './__test__/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as harness from './__test__/harness';
import { resetAll, sessionFor, tokenFromLastMail } from './__test__/helpers';
import * as core from './auth-core';
import * as provider from './auth-provider';
import * as magic from './auth-magic';

const IP = '198.51.100.1';

function seedOwnerBusiness(status = 'client'): void {
  harness.seed('businesses', [{ id: 'b1', slug: 'tire', status, name: 'Шиномонтаж' }]);
  harness.seed('admin_users', [{ id: 'm1', business_id: 'b1', auth_user_id: 'owner-1', role: 'owner', email: 'owner@biz.ru' }]);
}

function tokenRow(): harness.Row | undefined {
  return harness.tables.get('auth_tokens')?.at(-1);
}

beforeEach(() => {
  resetAll();
  seedOwnerBusiness();
});

describe('auth-magic: запрос ссылки', () => {
  it('супер-админ: письмо со ссылкой /magic-link?token=, TTL 15 минут, в БД только дайджест', async () => {
    const before = Date.now();
    expect(await magic.requestMagicLink({ email: ' Boss@Example.com ', realm: 'admin', returnTo: null, ip: IP })).toBe('sent');
    const token = tokenFromLastMail();
    expect(harness.sentMails.at(-1)?.text).toContain(`/magic-link?token=${token}`);
    const row = tokenRow();
    expect(row).toMatchObject({ kind: 'magic_link', email: 'boss@example.com', realm: 'admin', return_to: '/admin' });
    expect(row?.token_digest).toBe(core.tokenDigest(token));
    expect(JSON.stringify(row)).not.toContain(token);
    const ttl = Date.parse(String(row?.expires_at)) - before;
    expect(ttl).toBeGreaterThan((core.MAGIC_LINK_TTL_SECONDS - 5) * 1000);
    expect(ttl).toBeLessThanOrEqual((core.MAGIC_LINK_TTL_SECONDS + 5) * 1000);
  });

  it('владелец: письмо только участнику активного бизнеса из returnTo', async () => {
    expect(await magic.requestMagicLink({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/s/tire/panel/bookings', ip: IP })).toBe('sent');
    expect(harness.sentMails).toHaveLength(1);
    expect(tokenRow()).toMatchObject({ realm: 'owner', return_to: '/s/tire/panel/bookings' });
  });

  it('чужой адрес, неактивный бизнес, нет slug: ответ тот же, письма нет (нельзя выяснить, кто зарегистрирован)', async () => {
    expect(await magic.requestMagicLink({ email: 'nobody@biz.ru', realm: 'owner', returnTo: '/s/tire/panel', ip: IP })).toBe('sent');
    expect(await magic.requestMagicLink({ email: 'owner@biz.ru', realm: 'owner', returnTo: null, ip: IP })).toBe('sent');
    expect(await magic.requestMagicLink({ email: 'stranger@example.com', realm: 'admin', returnTo: null, ip: IP })).toBe('sent');
    seedOwnerBusiness('lead');
    expect(await magic.requestMagicLink({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/s/tire/panel', ip: IP })).toBe('sent');
    expect(harness.sentMails).toHaveLength(0);
    expect(harness.auditCalls.filter((c) => c.action === 'auth:magic_link_rejected')).toHaveLength(4);
  });

  it('open redirect: супер-админ не уходит за пределы /panel, владелец — за пределы кабинета', async () => {
    await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: '//evil.com/panel', ip: IP });
    expect(tokenRow()?.return_to).toBe('/admin');
    await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: '/s/tire/panel', ip: '198.51.100.2' });
    expect(tokenRow()?.return_to).toBe('/admin');
    expect(await magic.requestMagicLink({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/panel/funnel', ip: IP })).toBe('sent');
    expect(harness.sentMails).toHaveLength(2);
  });

  it('rate limit 3/15 мин/email: 4-й запрос на тот же адрес — rate_limited', async () => {
    const results: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: null, ip: `10.0.0.${i}` }));
    }
    expect(results).toEqual(['sent', 'sent', 'sent', 'rate_limited']);
    expect(harness.sentMails).toHaveLength(3);
  });

  it('невалидный email — invalid_email, без обращения к лимитам и БД', async () => {
    expect(await magic.requestMagicLink({ email: 'not-email', realm: 'admin', returnTo: null, ip: IP })).toBe('invalid_email');
    expect(harness.rateHits.size).toBe(0);
  });

  it('новая ссылка гасит предыдущую', async () => {
    await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: null, ip: IP });
    const first = tokenFromLastMail();
    await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: null, ip: IP });
    expect(await magic.peekMagicLink(first)).toBe('used');
    expect(await magic.peekMagicLink(tokenFromLastMail())).toBe('valid');
  });

  it('slugFromPanelPath', () => {
    expect(magic.slugFromPanelPath('/s/tire/panel')).toBe('tire');
    expect(magic.slugFromPanelPath('/s/tire/panel/bookings?x=1')).toBe('tire');
    expect(magic.slugFromPanelPath('/panel/funnel')).toBeNull();
    expect(magic.slugFromPanelPath(null)).toBeNull();
  });
});

describe('auth-magic: погашение ссылки', () => {
  it('супер-админ: вход, cookie сессии, одноразовость', async () => {
    await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: '/panel/clients', ip: IP });
    const token = tokenFromLastMail();
    vi.mocked(provider.sessionWithoutPassword).mockResolvedValue(sessionFor('boss@example.com', 'boss'));
    expect(await magic.consumeMagicLink(token, IP)).toEqual({ kind: 'ok', redirectTo: '/panel/clients' });
    expect(harness.jar.get('sa_session')).toMatchObject({ value: 'access-boss', httpOnly: true, secure: true, sameSite: 'lax' });
    expect(await magic.consumeMagicLink(token, IP)).toEqual({ kind: 'invalid' });
    expect(await magic.peekMagicLink(token)).toBe('used');
  });

  it('владелец: вход в свой кабинет; неактивный бизнес — inactive, cookie нет', async () => {
    await magic.requestMagicLink({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/s/tire/panel', ip: IP });
    const token = tokenFromLastMail();
    vi.mocked(provider.sessionWithoutPassword).mockResolvedValue(sessionFor('owner@biz.ru', 'owner-1'));
    seedOwnerBusiness('archived');
    expect(await magic.consumeMagicLink(token, IP)).toEqual({ kind: 'inactive' });
    expect(harness.jar.has('biz_session')).toBe(false);
  });

  it('владелец: успешный вход ведёт в returnTo', async () => {
    await magic.requestMagicLink({ email: 'owner@biz.ru', realm: 'owner', returnTo: '/s/tire/panel/bookings', ip: IP });
    vi.mocked(provider.sessionWithoutPassword).mockResolvedValue(sessionFor('owner@biz.ru', 'owner-1'));
    expect(await magic.consumeMagicLink(tokenFromLastMail(), IP)).toEqual({ kind: 'ok', redirectTo: '/s/tire/panel/bookings' });
    expect(harness.jar.get('biz_session')?.value).toBe('access-owner-1');
  });

  it('истёкшая ссылка (TTL 15 мин) не принимается', async () => {
    await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: null, ip: IP });
    const token = tokenFromLastMail();
    const row = tokenRow();
    if (row) row.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await magic.peekMagicLink(token)).toBe('expired');
    expect(await magic.consumeMagicLink(token, IP)).toEqual({ kind: 'invalid' });
    expect(provider.sessionWithoutPassword).not.toHaveBeenCalled();
  });

  it('сбой провайдера: ссылка возвращается в оборот и срабатывает со второй попытки', async () => {
    await magic.requestMagicLink({ email: 'boss@example.com', realm: 'admin', returnTo: null, ip: IP });
    const token = tokenFromLastMail();
    vi.mocked(provider.sessionWithoutPassword).mockResolvedValueOnce(null);
    expect(await magic.consumeMagicLink(token, IP)).toEqual({ kind: 'error' });
    expect(await magic.peekMagicLink(token)).toBe('valid');
    vi.mocked(provider.sessionWithoutPassword).mockResolvedValueOnce(sessionFor('boss@example.com', 'boss'));
    expect((await magic.consumeMagicLink(token, IP)).kind).toBe('ok');
  });

  it('адрес убран из SUPERADMIN_EMAILS после выдачи ссылки — invalid', async () => {
    await magic.requestMagicLink({ email: 'second@example.com', realm: 'admin', returnTo: null, ip: IP });
    const token = tokenFromLastMail();
    process.env.SUPERADMIN_EMAILS = 'boss@example.com';
    vi.mocked(provider.sessionWithoutPassword).mockResolvedValue(sessionFor('second@example.com', 'second'));
    expect(await magic.consumeMagicLink(token, IP)).toEqual({ kind: 'invalid' });
    expect(harness.jar.has('sa_session')).toBe(false);
  });

  it('перебор токенов: 21-я попытка с одного IP за 15 минут — rate_limited', async () => {
    const kinds: string[] = [];
    for (let i = 0; i < 21; i += 1) kinds.push((await magic.consumeMagicLink(core.generateToken(), IP)).kind);
    expect(kinds.slice(0, 20).every((k) => k === 'invalid')).toBe(true);
    expect(kinds[20]).toBe('rate_limited');
  });

  it('мусор вместо токена не доходит до БД', async () => {
    expect(await magic.peekMagicLink("' or 1=1 --")).toBe('invalid');
    expect(await magic.consumeMagicLink('../../etc', IP)).toEqual({ kind: 'invalid' });
  });
});
