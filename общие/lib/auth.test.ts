// lib/auth.test.ts — unit-тесты аутентификации (зона 12): чистые функции, сессии, токены.
// Next.js (cookies/headers), Supabase Auth, rate limit и audit подменены — тесты не ходят в сеть и БД.
import './__test__/setup';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as harness from './__test__/harness';
import * as core from './auth-core';

// Подмены модулей — в lib/__test__/setup.ts (vitest setupFiles), общие для всех файлов тестов.

const provider = await import('./auth-provider');
const admin = await import('./admin-session');
const owner = await import('./owner-session');
const invites = await import('./auth-invites');

const JWT_SECRET = 'test-secret-only-for-unit-tests';
const NOW = new Date('2026-10-15T12:00:00Z');

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeJwt(claims: object, secret: string = JWT_SECRET, alg = 'HS256'): string {
  const head = b64({ alg, typ: 'JWT' });
  const body = b64(claims);
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function sessionFor(email: string, id = 'user-1'): Awaited<ReturnType<typeof provider.passwordSignIn>> {
  return { user: { id, email }, tokens: { accessToken: `access-${id}`, refreshToken: `refresh-${id}` } };
}

beforeEach(() => {
  harness.resetHarness();
  harness.tables.clear();
  harness.sentMails.length = 0;
  vi.mocked(provider.createUserWithPassword).mockReset();
  vi.mocked(provider.passwordSignIn).mockReset();
  vi.mocked(provider.verifyAccessToken).mockReset();
  vi.mocked(provider.refreshTokens).mockReset();
  process.env.SUPERADMIN_EMAILS = 'Boss@Example.com, second@example.com ,not-an-email';
});

describe('auth-core: email и пароль', () => {
  it('нормализует email и отвергает мусор', () => {
    expect(core.normalizeEmail('  User@Mail.RU ')).toBe('user@mail.ru');
    expect(core.normalizeEmail('nope')).toBeNull();
    expect(core.normalizeEmail(42)).toBeNull();
    expect(core.normalizeEmail(`${'a'.repeat(250)}@x.ru`)).toBeNull();
  });

  it('пароль: минимум 8 символов, максимум 72 байта', () => {
    expect(core.checkPassword('1234567')).toBe('too_short');
    expect(core.checkPassword('12345678')).toBe('ok');
    expect(core.checkPassword('я'.repeat(37))).toBe('too_long');
    expect(core.checkPassword(null)).toBe('too_short');
  });

  it('SUPERADMIN_EMAILS: регистр, пробелы, мусор', () => {
    expect(core.parseEmailList(process.env.SUPERADMIN_EMAILS)).toEqual(['boss@example.com', 'second@example.com']);
    expect(core.parseEmailList(undefined)).toEqual([]);
  });
});

describe('auth-core: токены и timing-safe', () => {
  it('generateToken выдаёт uuid v4, каждый раз новый', () => {
    const a = core.generateToken();
    expect(core.isUuidV4(a)).toBe(true);
    expect(a).not.toBe(core.generateToken());
    expect(core.isUuidV4('not-a-token')).toBe(false);
  });

  it('tokenDigest детерминирован, не равен токену и имеет формат uuid', () => {
    const t = core.generateToken();
    const d = core.tokenDigest(t);
    expect(d).toBe(core.tokenDigest(t));
    expect(d).not.toBe(t);
    expect(d).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('safeEqual: равные/разные/разной длины', () => {
    expect(core.safeEqual('abc', 'abc')).toBe(true);
    expect(core.safeEqual('abc', 'abd')).toBe(false);
    expect(core.safeEqual('abc', 'abcd')).toBe(false);
    expect(core.listIncludesSafe(['a@b.ru', 'c@d.ru'], 'c@d.ru')).toBe(true);
    expect(core.listIncludesSafe(['a@b.ru'], 'x@d.ru')).toBe(false);
  });

  it('tokenState: valid / expired / used / not_found', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    const past = new Date(NOW.getTime() - 1).toISOString();
    expect(core.tokenState({ expiresAt: future, usedAt: null }, NOW)).toBe('valid');
    expect(core.tokenState({ expiresAt: past, usedAt: null }, NOW)).toBe('expired');
    expect(core.tokenState({ expiresAt: future, usedAt: past }, NOW)).toBe('used');
    expect(core.tokenState(null, NOW)).toBe('not_found');
    expect(core.tokenState({ expiresAt: 'garbage', usedAt: null }, NOW)).toBe('expired');
  });

  it('TTL по ТЗ: magic 15 мин, reset 1 час, invite 7 дней, сессия 30 дней', () => {
    expect(core.MAGIC_LINK_TTL_SECONDS).toBe(900);
    expect(core.RESET_TTL_SECONDS).toBe(3600);
    expect(core.INVITE_TTL_SECONDS).toBe(604_800);
    expect(core.SESSION_TTL_SECONDS).toBe(2_592_000);
    expect(core.expiresAt(NOW, 900).toISOString()).toBe('2026-10-15T12:15:00.000Z');
  });
});

describe('auth-core: JWT', () => {
  const exp = Math.floor(NOW.getTime() / 1000) + 3600;

  it('принимает подписанный токен и отдаёт claims', () => {
    const claims = core.verifyJwtHs256(makeJwt({ sub: 'u1', email: 'A@B.ru', exp }), JWT_SECRET, NOW);
    expect(claims).toEqual({ sub: 'u1', email: 'a@b.ru', exp });
  });

  it('отвергает чужую подпись, alg=none, истёкший и битый токен', () => {
    expect(core.verifyJwtHs256(makeJwt({ sub: 'u1', email: 'a@b.ru', exp }, 'other'), JWT_SECRET, NOW)).toBeNull();
    expect(core.verifyJwtHs256(makeJwt({ sub: 'u1', email: 'a@b.ru', exp }, JWT_SECRET, 'none'), JWT_SECRET, NOW)).toBeNull();
    expect(core.verifyJwtHs256(makeJwt({ sub: 'u1', email: 'a@b.ru', exp: 1 }), JWT_SECRET, NOW)).toBeNull();
    expect(core.verifyJwtHs256('a.b', JWT_SECRET, NOW)).toBeNull();
    expect(core.verifyJwtHs256(makeJwt({ sub: 'u1', exp }), JWT_SECRET, NOW)).toBeNull();
  });

  it('отвергает ключи anon/service_role (aud/role не authenticated), принимает aud-массив', () => {
    const base = { sub: 'u1', email: 'a@b.ru', exp };
    expect(core.verifyJwtHs256(makeJwt({ ...base, role: 'service_role' }), JWT_SECRET, NOW)).toBeNull();
    expect(core.verifyJwtHs256(makeJwt({ ...base, role: 'anon' }), JWT_SECRET, NOW)).toBeNull();
    expect(core.verifyJwtHs256(makeJwt({ ...base, aud: 'other' }), JWT_SECRET, NOW)).toBeNull();
    expect(core.verifyJwtHs256(makeJwt({ ...base, aud: ['authenticated'], role: 'authenticated' }), JWT_SECRET, NOW)).not.toBeNull();
  });

  it('jwtAlg читает алгоритм из заголовка; мусор — null', () => {
    expect(core.jwtAlg(makeJwt({ sub: 'u' }))).toBe('HS256');
    expect(core.jwtAlg(makeJwt({ sub: 'u' }, JWT_SECRET, 'ES256'))).toBe('ES256');
    expect(core.jwtAlg('garbage')).toBeNull();
    expect(core.jwtAlg('')).toBeNull();
  });

  it('accessTokenFresh учитывает запас перед истечением', () => {
    const soon = Math.floor(NOW.getTime() / 1000) + 60;
    expect(core.accessTokenFresh(makeJwt({ sub: 'u', email: 'a@b.ru', exp }), NOW)).toBe(true);
    expect(core.accessTokenFresh(makeJwt({ sub: 'u', email: 'a@b.ru', exp: soon }), NOW)).toBe(false);
    expect(core.accessTokenFresh('garbage', NOW)).toBe(false);
  });
});

describe('auth-core: redirect, Origin, IP', () => {
  it('sanitizeNext отсекает open redirect', () => {
    expect(core.sanitizeNext('/panel/clients?x=1', '/panel')).toBe('/panel/clients?x=1');
    expect(core.sanitizeNext('/panel', '/panel')).toBe('/panel');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '/panelx', '/panel/../api', '/panel/\u0000', '', 7]) {
      expect(core.sanitizeNext(bad, '/panel')).toBeNull();
    }
  });

  it('sanitizePanelNext понимает кабинет владельца и супер-админку', () => {
    expect(core.sanitizePanelNext('/s/tire/panel/bookings')).toBe('/s/tire/panel/bookings');
    expect(core.panelRootOf('/s/tire/panel/bookings')).toBe('/s/tire/panel');
    expect(core.panelRootOf('/panel/funnel')).toBe('/panel');
    expect(core.sanitizePanelNext('/s/tire')).toBeNull();
    expect(core.sanitizePanelNext('//s/tire/panel')).toBeNull();
  });

  it('isSameOrigin: Origin, Referer, отсутствие и подмена', () => {
    expect(core.isSameOrigin('https://zapishisya.ru', null, 'zapishisya.ru')).toBe(true);
    expect(core.isSameOrigin(null, 'https://zapishisya.ru/panel/login', 'zapishisya.ru')).toBe(true);
    expect(core.isSameOrigin('https://evil.ru', null, 'zapishisya.ru')).toBe(false);
    expect(core.isSameOrigin('null', null, 'zapishisya.ru')).toBe(false);
    expect(core.isSameOrigin(null, null, 'zapishisya.ru')).toBe(false);
    expect(core.isSameOrigin('https://zapishisya.ru', null, null)).toBe(false);
    expect(core.isSameOrigin('::bad::', null, 'zapishisya.ru')).toBe(false);
  });

  it('parseClientIp и fingerprint без PII', () => {
    // Подмена первого адреса XFF клиентом не меняет ключ лимита: берётся адрес от ближайшего прокси.
    expect(core.parseClientIp('6.6.6.6, 1.1.1.1', null)).toBe('1.1.1.1');
    expect(core.parseClientIp('6.6.6.6, 1.1.1.1', ' 2.2.2.2 ')).toBe('2.2.2.2');
    expect(core.parseClientIp(null, ' 2.2.2.2 ')).toBe('2.2.2.2');
    expect(core.parseClientIp(' , ', '')).toBe('unknown');
    expect(core.parseClientIp(null, null)).toBe('unknown');
    const fp = core.fingerprint('user@mail.ru');
    expect(fp).toHaveLength(16);
    expect(fp).not.toContain('user');
  });
});

describe('admin-session (задача 2)', () => {
  it('1. успешный вход супер-админа ставит host-only httpOnly secure lax cookie на 30 дней', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(sessionFor('boss@example.com'));
    expect(await admin.signInSuperAdmin(' Boss@Example.com ', 'correct-password')).toBe('ok');
    const cookie = harness.jar.get('sa_session');
    expect(cookie).toMatchObject({ value: 'access-user-1', httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: core.SESSION_TTL_SECONDS });
    expect(cookie?.domain).toBeUndefined();
    expect(harness.jar.get('sa_refresh')?.value).toBe('refresh-user-1');
    expect(harness.auditActions()).toContain('auth:login_success');
  });

  it('2. адрес вне SUPERADMIN_EMAILS получает тот же ответ, что неверный пароль, и без cookie', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(sessionFor('stranger@example.com'));
    expect(await admin.signInSuperAdmin('stranger@example.com', 'whatever-pass')).toBe('invalid');
    vi.mocked(provider.passwordSignIn).mockResolvedValue(null);
    expect(await admin.signInSuperAdmin('boss@example.com', 'wrong-pass')).toBe('invalid');
    expect(harness.jar.has('sa_session')).toBe(false);
  });

  it('3. rate limit: 11-я попытка с одного IP за 15 минут — rate_limited', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(null);
    const results: string[] = [];
    for (let i = 0; i < 11; i += 1) results.push(await admin.signInSuperAdmin(`u${i}@example.com`, 'wrong-pass'));
    expect(results.slice(0, 10).every((r) => r === 'invalid')).toBe(true);
    expect(results[10]).toBe('rate_limited');
    expect(vi.mocked(provider.passwordSignIn)).toHaveBeenCalledTimes(10);
  });

  it('4. rate limit по email: 6-я попытка на один адрес с разных IP — rate_limited', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(null);
    const results: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      harness.requestHeaders.set('x-forwarded-for', `198.51.100.${i}`);
      results.push(await admin.signInSuperAdmin('boss@example.com', 'wrong-pass'));
    }
    expect(results[4]).toBe('invalid');
    expect(results[5]).toBe('rate_limited');
  });

  it('5. чужой Origin отклоняется до проверки пароля (CSRF)', async () => {
    harness.requestHeaders.set('origin', 'https://evil.example');
    expect(await admin.signInSuperAdmin('boss@example.com', 'correct-password')).toBe('forbidden_origin');
    expect(vi.mocked(provider.passwordSignIn)).not.toHaveBeenCalled();
    expect(harness.auditActions()).toContain('auth:csrf_rejected');
  });

  it('6. журнал без PII: ни email, ни IP, ни пароль не попадают в audit payload', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(null);
    await admin.signInSuperAdmin('boss@example.com', 'super-secret-pass');
    const dump = JSON.stringify(harness.auditCalls);
    expect(dump).not.toContain('boss@example.com');
    expect(dump).not.toContain('203.0.113.7');
    expect(dump).not.toContain('super-secret-pass');
    expect(dump).toContain('email_fp');
  });

  it('isSuperAdmin: проверяет email из токена; signOut стирает обе cookie', async () => {
    harness.cookiesMock.set('sa_session', 'token', {});
    harness.cookiesMock.set('sa_refresh', 'refresh', {});
    const farExp = Math.floor(Date.now() / 1000) + 3600;
    vi.mocked(provider.verifyAccessToken).mockResolvedValue({ sub: 'u', email: 'second@example.com', exp: farExp });
    expect(await admin.isSuperAdmin()).toBe(true);
    vi.mocked(provider.verifyAccessToken).mockResolvedValue({ sub: 'u', email: 'other@example.com', exp: farExp });
    expect(await admin.isSuperAdmin()).toBe(false);
    await admin.signOutSuperAdmin();
    expect(harness.jar.get('sa_session')).toMatchObject({ value: '', maxAge: 0 });
    expect(harness.jar.get('sa_refresh')).toMatchObject({ value: '', maxAge: 0 });
  });

  it('superAdminAccess: истёкший access + refresh → refresh; нет cookie → none', async () => {
    expect(await admin.superAdminAccess()).toBe('none');
    harness.cookiesMock.set('sa_session', 'expired', {});
    harness.cookiesMock.set('sa_refresh', 'refresh', {});
    vi.mocked(provider.verifyAccessToken).mockResolvedValue(null);
    expect(await admin.superAdminAccess()).toBe('refresh');
  });
});

describe('owner-session (задача 3)', () => {
  const farExp = Math.floor(Date.now() / 1000) + 3600;

  beforeEach(() => {
    harness.seed('businesses', [
      { id: 'b1', slug: 'tire', status: 'client', name: 'Шиномонтаж' },
      { id: 'b2', slug: 'gone', status: 'refused', name: 'Отказ' },
    ]);
    harness.seed('admin_users', [
      { id: 'm1', business_id: 'b1', auth_user_id: 'owner-1', role: 'owner', email: 'owner@biz.ru' },
      { id: 'm2', business_id: 'b1', auth_user_id: 'manager-1', role: 'manager', email: 'man@biz.ru' },
      { id: 'm3', business_id: 'b2', auth_user_id: 'owner-1', role: 'owner', email: 'owner@biz.ru' },
    ]);
  });

  it('вход участника бизнеса ставит biz_session/biz_refresh с безопасными атрибутами', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(sessionFor('owner@biz.ru', 'owner-1'));
    expect(await owner.signInOwner('owner@biz.ru', 'correct-pass', 'tire')).toBe('ok');
    expect(harness.jar.get('biz_session')).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(harness.jar.get('biz_session')?.domain).toBeUndefined();
  });

  it('верный пароль, но не участник этого бизнеса — invalid, cookie нет', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(sessionFor('man@biz.ru', 'stranger'));
    expect(await owner.signInOwner('man@biz.ru', 'correct-pass', 'tire')).toBe('invalid');
    expect(harness.jar.has('biz_session')).toBe(false);
  });

  it('бизнес не в статусе client — inactive (только после верного пароля)', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(sessionFor('owner@biz.ru', 'owner-1'));
    expect(await owner.signInOwner('owner@biz.ru', 'correct-pass', 'gone')).toBe('inactive');
    vi.mocked(provider.passwordSignIn).mockResolvedValue(null);
    expect(await owner.signInOwner('owner@biz.ru', 'wrong-pass', 'gone')).toBe('invalid');
  });

  it('rate limit и Origin действуют и для владельца', async () => {
    vi.mocked(provider.passwordSignIn).mockResolvedValue(null);
    for (let i = 0; i < 10; i += 1) await owner.signInOwner(`x${i}@biz.ru`, 'wrong-pass', 'tire');
    expect(await owner.signInOwner('y@biz.ru', 'wrong-pass', 'tire')).toBe('rate_limited');
    harness.requestHeaders.set('origin', 'https://evil.example');
    expect(await owner.signInOwner('owner@biz.ru', 'p', 'tire')).toBe('forbidden_origin');
  });

  it('currentOwner возвращает бизнес и роль; manager отличается от owner', async () => {
    harness.cookiesMock.set('biz_session', 'tok', {});
    vi.mocked(provider.verifyAccessToken).mockResolvedValue({ sub: 'manager-1', email: 'man@biz.ru', exp: farExp });
    const access = await owner.currentOwner('tire');
    expect(access?.business.id).toBe('b1');
    expect(access?.member.role).toBe('manager');
    expect(await owner.requireOwnerAction('tire', ['owner'])).toBeNull();
    expect((await owner.requireOwnerAction('tire'))?.member.id).toBe('m2');
  });

  it('ownerAccess: чужой бизнес — none, неактивный — inactive, истёкший токен — refresh', async () => {
    harness.cookiesMock.set('biz_session', 'tok', {});
    harness.cookiesMock.set('biz_refresh', 'ref', {});
    vi.mocked(provider.verifyAccessToken).mockResolvedValue({ sub: 'owner-1', email: 'owner@biz.ru', exp: farExp });
    expect((await owner.ownerAccess('nope')).kind).toBe('none');
    expect((await owner.ownerAccess('gone')).kind).toBe('inactive');
    vi.mocked(provider.verifyAccessToken).mockResolvedValue(null);
    expect((await owner.ownerAccess('tire')).kind).toBe('refresh');
  });

  it('requireOwnerAction обновляет истёкшую сессию и ротирует cookie', async () => {
    harness.cookiesMock.set('biz_session', 'old', {});
    harness.cookiesMock.set('biz_refresh', 'ref-old', {});
    vi.mocked(provider.verifyAccessToken).mockResolvedValue(null);
    vi.mocked(provider.refreshTokens).mockResolvedValue(sessionFor('owner@biz.ru', 'owner-1'));
    expect((await owner.requireOwnerAction('tire', ['owner']))?.member.role).toBe('owner');
    expect(harness.jar.get('biz_refresh')?.value).toBe('refresh-owner-1');
    expect(harness.auditActions()).toContain('auth:session_refreshed');
  });

  it('signOutOwner стирает cookie', async () => {
    harness.cookiesMock.set('biz_session', 'tok', {});
    await owner.signOutOwner();
    expect(harness.jar.get('biz_session')).toMatchObject({ value: '', maxAge: 0 });
  });

  it('выход отзывает сессию у провайдера (scope local); истёкший access — отзыв по refresh', async () => {
    const farExp = Math.floor(Date.now() / 1000) + 3600;
    harness.cookiesMock.set('biz_session', 'live-access', {});
    vi.mocked(provider.verifyAccessToken).mockResolvedValue({ sub: 'u', email: 'a@b.ru', exp: farExp });
    await owner.signOutOwner();
    expect(provider.revokeSession).toHaveBeenCalledWith('live-access', 'local');

    vi.mocked(provider.revokeSession).mockClear();
    harness.cookiesMock.set('biz_session', 'dead-access', {});
    harness.cookiesMock.set('biz_refresh', 'refresh-x', {});
    vi.mocked(provider.verifyAccessToken).mockResolvedValue(null);
    vi.mocked(provider.refreshTokens).mockResolvedValue(sessionFor('a@b.ru'));
    await owner.signOutOwner();
    expect(provider.revokeSession).toHaveBeenCalledWith('access-user-1', 'local');
  });

  it('сбой отзыва не мешает выходу: cookie стёрты, событие в журнале', async () => {
    const farExp = Math.floor(Date.now() / 1000) + 3600;
    harness.cookiesMock.set('sa_session', 'live', {});
    harness.cookiesMock.set('sa_refresh', 'r', {});
    vi.mocked(provider.verifyAccessToken).mockResolvedValue({ sub: 'u', email: 'a@b.ru', exp: farExp });
    vi.mocked(provider.revokeSession).mockRejectedValue(new Error('revoke failed: 500'));
    await admin.signOutSuperAdmin();
    expect(harness.jar.get('sa_session')).toMatchObject({ value: '', maxAge: 0 });
    expect(harness.jar.get('sa_refresh')).toMatchObject({ value: '', maxAge: 0 });
    expect(harness.auditActions().filter((a) => a === 'auth:logout').length).toBeGreaterThanOrEqual(2);
  });
});

describe('flash (задача 4)', () => {
  it('принимает только известные не-секретные сообщения', async () => {
    const { parseFlash } = await import('./flash');
    expect(parseFlash(JSON.stringify({ kind: 'invite_sent', email: 'a@b.ru' }))).toEqual({ kind: 'invite_sent', email: 'a@b.ru' });
    expect(parseFlash(JSON.stringify({ kind: 'error', code: 'rate_limited' }))).toEqual({ kind: 'error', code: 'rate_limited' });
  });

  it('отбрасывает пароль из cookie старого формата и мусор', async () => {
    const { parseFlash } = await import('./flash');
    expect(parseFlash(JSON.stringify({ email: 'a@b.ru', password: 'secret' }))).toBeNull();
    const withExtra = parseFlash(JSON.stringify({ kind: 'access_created', email: 'a@b.ru', password: 'secret' }));
    expect(JSON.stringify(withExtra)).not.toContain('secret');
    expect(parseFlash('{oops')).toBeNull();
    expect(parseFlash(undefined)).toBeNull();
    expect(parseFlash(JSON.stringify({ kind: 'error', code: '<script>' }))).toBeNull();
  });

  it('writeFlash ставит httpOnly secure lax cookie на 5 минут', async () => {
    const { writeFlash, FLASH_COOKIE } = await import('./flash');
    writeFlash({ kind: 'invite_sent', email: 'a@b.ru' }, '/panel');
    expect(harness.jar.get(FLASH_COOKIE)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/panel', maxAge: 300 });
  });
});

// Токен из последнего письма: в БД его нет (там только дайджест), поэтому тесты, как и пользователь, берут его из письма.
function tokenFromLastMail(): string {
  const text = harness.sentMails.at(-1)?.text ?? '';
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/.exec(text);
  if (!m?.[1]) throw new Error('в письме нет токена');
  return m[1];
}

describe('auth-invites (задача 5)', () => {
  const NOW_I = new Date('2026-10-15T12:00:00Z');

  beforeEach(() => {
    harness.seed('vertical_templates', [{ id: 't1', url_prefix: 's' }]);
    harness.seed('businesses', [{ id: 'b1', slug: 'tire', status: 'client', name: 'Шиномонтаж', vertical_template_id: 't1' }]);
    harness.seed('admin_users', [{ id: 'm1', business_id: 'b1', auth_user_id: 'owner-1', role: 'owner', email: 'owner@biz.ru' }]);
  });

  it('создание: TTL 7 дней, в БД дайджест вместо токена, письмо со ссылкой /invite/{token}', async () => {
    const r = await invites.createInvite({ businessId: 'b1', email: ' New@Biz.ru ', role: 'manager', createdBy: 'm1' }, NOW_I);
    expect(r).toMatchObject({ ok: true, emailSent: true });
    const token = tokenFromLastMail();
    const row = harness.tables.get('admin_invites')?.[0];
    expect(row?.token).toBe(core.tokenDigest(token));
    expect(row?.token).not.toBe(token);
    expect(row).toMatchObject({ email: 'new@biz.ru', role: 'manager', business_id: 'b1', expires_at: '2026-10-22T12:00:00.000Z' });
    expect(harness.sentMails.at(-1)?.text).toContain(`/invite/${token}`);
    expect(harness.sentMails.at(-1)?.text).not.toMatch(/парол[ья]:/i);
  });

  it('отказ: невалидный email, уже участник, нет бизнеса', async () => {
    expect(await invites.createInvite({ businessId: 'b1', email: 'bad', role: 'manager', createdBy: null })).toMatchObject({ ok: false, reason: 'invalid_email' });
    expect(await invites.createInvite({ businessId: 'b1', email: 'owner@biz.ru', role: 'manager', createdBy: null })).toMatchObject({ ok: false, reason: 'already_member' });
    expect(await invites.createInvite({ businessId: 'zz', email: 'a@b.ru', role: 'manager', createdBy: null })).toMatchObject({ ok: false, reason: 'no_business' });
  });

  it('повторное приглашение гасит предыдущее', async () => {
    await invites.createInvite({ businessId: 'b1', email: 'new@biz.ru', role: 'manager', createdBy: 'm1' }, NOW_I);
    const first = tokenFromLastMail();
    await invites.createInvite({ businessId: 'b1', email: 'new@biz.ru', role: 'manager', createdBy: 'm1' }, NOW_I);
    expect((await invites.peekInvite(first, NOW_I)).state).toBe('used');
    expect((await invites.peekInvite(tokenFromLastMail(), NOW_I)).state).toBe('valid');
  });

  it('peekInvite: valid с данными, expired после 7 дней, мусор — not_found', async () => {
    await invites.createInvite({ businessId: 'b1', email: 'new@biz.ru', role: 'manager', createdBy: 'm1' }, NOW_I);
    const token = tokenFromLastMail();
    expect(await invites.peekInvite(token, NOW_I)).toEqual({ state: 'valid', email: 'new@biz.ru', role: 'manager', businessName: 'Шиномонтаж' });
    const later = new Date(NOW_I.getTime() + core.INVITE_TTL_SECONDS * 1000 + 1);
    expect((await invites.peekInvite(token, later)).state).toBe('expired');
    expect((await invites.peekInvite('garbage', NOW_I)).state).toBe('not_found');
  });

  it('принятие: создаёт пользователя и admin_users, ставит сессию, ведёт в кабинет; второй раз — used', async () => {
    await invites.createInvite({ businessId: 'b1', email: 'new@biz.ru', role: 'manager', createdBy: 'm1' }, NOW_I);
    const token = tokenFromLastMail();
    vi.mocked(provider.createUserWithPassword).mockResolvedValue({ kind: 'created', user: { id: 'new-1', email: 'new@biz.ru' } });
    vi.mocked(provider.passwordSignIn).mockResolvedValue(sessionFor('new@biz.ru', 'new-1'));
    const r = await invites.acceptInvite({ token, password: 'long-enough-pass', ip: '1.2.3.4' }, NOW_I);
    expect(r).toEqual({ kind: 'ok', redirectTo: '/s/tire/panel' });
    expect(harness.tables.get('admin_users')?.find((u) => u.auth_user_id === 'new-1')).toMatchObject({ role: 'manager', business_id: 'b1' });
    expect(harness.jar.get('biz_session')?.value).toBe('access-new-1');
    expect((await invites.acceptInvite({ token, password: 'long-enough-pass', ip: '1.2.3.4' }, NOW_I)).kind).toBe('used');
  });

  it('принятие: короткий пароль и истёкшее приглашение не гасят/не принимают', async () => {
    await invites.createInvite({ businessId: 'b1', email: 'new@biz.ru', role: 'manager', createdBy: 'm1' }, NOW_I);
    const token = tokenFromLastMail();
    expect((await invites.acceptInvite({ token, password: 'short', ip: '1.2.3.4' }, NOW_I)).kind).toBe('too_short');
    expect((await invites.peekInvite(token, NOW_I)).state).toBe('valid');
    const later = new Date(NOW_I.getTime() + core.INVITE_TTL_SECONDS * 1000 + 1);
    expect((await invites.acceptInvite({ token, password: 'long-enough-pass', ip: '1.2.3.4' }, later)).kind).toBe('expired');
  });

  it('существующий аккаунт: неверный текущий пароль — wrong_password, приглашение остаётся рабочим', async () => {
    await invites.createInvite({ businessId: 'b1', email: 'other@biz.ru', role: 'manager', createdBy: 'm1' }, NOW_I);
    const token = tokenFromLastMail();
    vi.mocked(provider.createUserWithPassword).mockResolvedValue({ kind: 'exists' });
    vi.mocked(provider.passwordSignIn).mockResolvedValue(null);
    expect((await invites.acceptInvite({ token, password: 'not-their-pass', ip: '1.2.3.4' }, NOW_I)).kind).toBe('wrong_password');
    expect((await invites.peekInvite(token, NOW_I)).state).toBe('valid');
  });

  it('rate limit invite_accept: 5 в час с IP', async () => {
    const kinds: string[] = [];
    for (let i = 0; i < 6; i += 1) kinds.push((await invites.acceptInvite({ token: 'x', password: 'p', ip: '9.9.9.9' }, NOW_I)).kind);
    expect(kinds.slice(0, 5).every((k) => k === 'invalid')).toBe(true);
    expect(kinds[5]).toBe('rate_limited');
  });

  it('отзыв и список ожидающих: только свой бизнес', async () => {
    const r = await invites.createInvite({ businessId: 'b1', email: 'new@biz.ru', role: 'manager', createdBy: 'm1' }, NOW_I);
    if (!r.ok) throw new Error('invite not created');
    expect(await invites.listPendingInvites('b1', NOW_I)).toHaveLength(1);
    harness.tables.get('admin_invites')?.forEach((row) => { row.id = '11111111-2222-3333-4444-555555555555'; });
    expect(await invites.revokeInvite('11111111-2222-3333-4444-555555555555', 'other-biz', NOW_I)).toBe(false);
    expect(await invites.revokeInvite('11111111-2222-3333-4444-555555555555', 'b1', NOW_I)).toBe(true);
    expect(await invites.listPendingInvites('b1', NOW_I)).toHaveLength(0);
  });
});

describe('auth-mail: тексты писем', () => {
  it('сроки в письмах берутся из TTL, ссылки только от SITE_URL, роль в родительном падеже', async () => {
    const mail = await import('./auth-mail');
    const token = core.generateToken();
    const invite = mail.inviteMail('a@b.ru', token, 'Шиномонтаж', 'manager');
    expect(invite.text).toContain('с правами менеджера');
    expect(invite.text).toContain('7 дней');
    expect(invite.text).toContain(`/invite/${token}`);
    expect(mail.magicLinkMail('a@b.ru', token).text).toContain('15 минут');
    expect(mail.resetMail('a@b.ru', token).text).toContain('1 час');
    for (const m of [invite, mail.magicLinkMail('a@b.ru', token), mail.resetMail('a@b.ru', token)]) {
      expect(m.text).not.toMatch(/пароль:\s*\S/i);
    }
  });
});
