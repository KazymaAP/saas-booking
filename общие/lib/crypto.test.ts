// lib/crypto.test.ts — AES-256-GCM: round-trip, ключи, порча данных, ротация.
import { createCipheriv, randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CryptoConfigError,
  DecryptError,
  decryptSecret,
  decryptWithKey,
  encryptSecret,
  encryptWithKey,
  isEncryptionConfigured,
  needsReencrypt,
  parseKey,
  reencryptSecret,
} from './crypto';

const KEY_A = 'a'.repeat(64);
const KEY_B = '0123456789abcdef'.repeat(4);

function legacyEncrypt(plain: string, hex: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

describe('crypto', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY_A;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('round-trip для ASCII и кириллицы', () => {
    for (const s of ['app-password-123', 'пароль приложения 🔑', '']) {
      expect(decryptSecret(encryptSecret(s))).toBe(s);
    }
  });

  it('формат iv:tag:ciphertext, iv случайный', () => {
    const a = encryptSecret('x');
    const b = encryptSecret('x');
    expect(a.split(':')).toHaveLength(3);
    expect(a).not.toBe(b);
  });

  it('другой ключ не расшифровывает', () => {
    const payload = encryptWithKey('secret', parseKey(KEY_A));
    expect(() => decryptWithKey(payload, parseKey(KEY_B))).toThrow(DecryptError);
  });

  it('испорченный ciphertext и tag отклоняются', () => {
    const [iv, tag, data] = encryptSecret('secret').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([iv, tag, flipped.toString('base64')].join(':'))).toThrow(DecryptError);
    const badTag = Buffer.from(tag, 'base64');
    badTag[0] ^= 0x01;
    expect(() => decryptSecret([iv, badTag.toString('base64'), data].join(':'))).toThrow(DecryptError);
  });

  it('мусор вместо шифротекста', () => {
    expect(() => decryptSecret('abc')).toThrow(DecryptError);
    expect(() => decryptSecret('a:b:c')).toThrow(DecryptError);
  });

  it('валидация ключа: 64 hex', () => {
    expect(() => parseKey('short')).toThrow(CryptoConfigError);
    expect(() => parseKey('z'.repeat(64))).toThrow(CryptoConfigError);
    expect(() => parseKey(undefined)).toThrow(CryptoConfigError);
    expect(parseKey(KEY_B)).toHaveLength(32);
    process.env.ENCRYPTION_KEY = 'bad';
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret('x')).toThrow(CryptoConfigError);
  });

  it('ошибка конфигурации не содержит ключ', () => {
    process.env.ENCRYPTION_KEY = 'deadbeef';
    try {
      encryptSecret('x');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('deadbeef');
    }
  });

  it('читает старый формат iv.tag.data и требует перешифровки', () => {
    const old = legacyEncrypt('legacy-pass', KEY_A);
    expect(decryptSecret(old)).toBe('legacy-pass');
    expect(needsReencrypt(old)).toBe(true);
    const fresh = reencryptSecret(old);
    expect(fresh.split(':')).toHaveLength(3);
    expect(decryptSecret(fresh)).toBe('legacy-pass');
    expect(needsReencrypt(fresh)).toBe(false);
  });

  it('ротация: расшифровка предыдущим ключом и перешифровка текущим', () => {
    const payload = encryptWithKey('rotated', parseKey(KEY_B));
    process.env.ENCRYPTION_KEY_PREVIOUS = KEY_B;
    expect(decryptSecret(payload)).toBe('rotated');
    expect(needsReencrypt(payload)).toBe(true);
    const next = reencryptSecret(payload);
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(decryptSecret(next)).toBe('rotated');
  });

  it('reencryptSecret не трогает актуальное значение', () => {
    const p = encryptSecret('same');
    expect(reencryptSecret(p)).toBe(p);
  });
});
