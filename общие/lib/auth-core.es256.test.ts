// общие/lib/auth-core.es256.test.ts — локальная проверка токенов Supabase с подписью ES256.
// Смысл: новые проекты Supabase подписывают access-токены асимметрично, и без локальной проверки
// каждая страница кабинета ходила бы в Auth — медленно и хрупко при сетевых сбоях.
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyJwtEs256, verifyJwtHs256, type Jwk } from './auth-core';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const JWK = { ...(publicKey.export({ format: 'jwk' }) as Jwk), kid: 'key-1' };
const NOW = new Date('2026-11-19T12:00:00Z');

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function makeToken(options: {
  key?: typeof privateKey;
  kid?: string;
  alg?: string;
  exp?: number;
  email?: string;
  aud?: string;
} = {}): string {
  const header = b64({ alg: options.alg ?? 'ES256', typ: 'JWT', kid: options.kid ?? 'key-1' });
  const payload = b64({
    sub: '11111111-2222-3333-4444-555555555555',
    email: options.email ?? 'Admin@Example.RU',
    aud: options.aud ?? 'authenticated',
    role: 'authenticated',
    exp: options.exp ?? Math.floor(NOW.getTime() / 1000) + 600,
  });
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: options.key ?? privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('verifyJwtEs256', () => {
  it('принимает токен, подписанный ключом из JWKS', () => {
    const claims = verifyJwtEs256(makeToken(), [JWK], NOW);
    expect(claims).toEqual({
      sub: '11111111-2222-3333-4444-555555555555',
      email: 'admin@example.ru',
      exp: Math.floor(NOW.getTime() / 1000) + 600,
    });
  });

  it('отвергает подпись чужим ключом', () => {
    expect(verifyJwtEs256(makeToken({ key: other.privateKey }), [JWK], NOW)).toBeNull();
  });

  it('отвергает просроченный токен', () => {
    const token = makeToken({ exp: Math.floor(NOW.getTime() / 1000) - 1 });
    expect(verifyJwtEs256(token, [JWK], NOW)).toBeNull();
  });

  it('не трогает токен с другим kid', () => {
    expect(verifyJwtEs256(makeToken({ kid: 'key-2' }), [JWK], NOW)).toBeNull();
  });

  it('игнорирует токен с алгоритмом HS256 — его проверяет отдельная ветка', () => {
    const secret = 'a'.repeat(40);
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    const payload = b64({ sub: 'u', email: 'a@b.ru', aud: 'authenticated', exp: 9_999_999_999 });
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    const token = `${header}.${payload}.${signature}`;

    expect(verifyJwtEs256(token, [JWK], NOW)).toBeNull();
    expect(verifyJwtHs256(token, secret, NOW)).not.toBeNull();
  });

  it('не пускает anon-ключ как сессию', () => {
    const token = makeToken({ aud: 'anon' });
    // aud=anon не проходит readClaims — даже с верной подписью это не пользовательская сессия.
    expect(verifyJwtEs256(token, [JWK], NOW)).toBeNull();
  });

  it('переживает пустой список ключей и мусор в JWKS', () => {
    expect(verifyJwtEs256(makeToken(), [], NOW)).toBeNull();
    expect(verifyJwtEs256(makeToken(), [{ kty: 'EC', crv: 'P-256' }], NOW)).toBeNull();
  });
});
