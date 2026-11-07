// lib/crypto.ts — шифрование секретов (пароли SMTP/IMAP), AES-256-GCM (ТЗ §0.4).
// Ключ: ENCRYPTION_KEY, hex, 32 байта (64 символа). Формат: base64(iv):base64(tag):base64(ciphertext).
// Ротация: ENCRYPTION_KEY_PREVIOUS — старый ключ, которым ещё можно расшифровать; needsReencrypt()
// показывает, что значение пора перешифровать текущим ключом (reencryptSecret).
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // рекомендованная длина nonce для GCM
const TAG_BYTES = 16;
const KEY_HEX = /^[0-9a-fA-F]{64}$/;
const SEPARATOR = ':';
// Старый формат проекта до ТЗ 4.0: iv.tag.data — читаем для обратной совместимости.
const LEGACY_SEPARATOR = '.';

export class CryptoConfigError extends Error {}
export class DecryptError extends Error {}

// Проверяет и превращает hex-ключ в Buffer. Ключ никогда не попадает в текст ошибки.
export function parseKey(hex: string | undefined): Buffer {
  const value = (hex ?? '').trim();
  if (!KEY_HEX.test(value)) throw new CryptoConfigError('ENCRYPTION_KEY должен быть 64 hex-символа (32 байта)');
  return Buffer.from(value, 'hex');
}

export function isEncryptionConfigured(): boolean {
  return KEY_HEX.test((process.env.ENCRYPTION_KEY ?? '').trim());
}

function currentKey(): Buffer {
  return parseKey(process.env.ENCRYPTION_KEY);
}

// Ключи для расшифровки: текущий, затем предыдущий (если задан и валиден).
function decryptionKeys(): Buffer[] {
  const keys = [currentKey()];
  const previous = (process.env.ENCRYPTION_KEY_PREVIOUS ?? '').trim();
  if (KEY_HEX.test(previous)) keys.push(Buffer.from(previous, 'hex'));
  return keys;
}

export function encryptWithKey(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64')).join(SEPARATOR);
}

export function encryptSecret(plain: string): string {
  return encryptWithKey(plain, currentKey());
}

type Parts = { iv: Buffer; tag: Buffer; data: Buffer; legacy: boolean };

// Разбирает строку в части; бросает DecryptError при любом нарушении формата.
function splitPayload(payload: string): Parts {
  const legacy = !payload.includes(SEPARATOR) && payload.includes(LEGACY_SEPARATOR);
  const pieces = payload.split(legacy ? LEGACY_SEPARATOR : SEPARATOR);
  if (pieces.length !== 3) throw new DecryptError('Неверный формат шифротекста');
  const [iv, tag, data] = pieces.map((s) => Buffer.from(s, 'base64'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new DecryptError('Неверная длина iv или tag');
  return { iv, tag, data, legacy };
}

export function decryptWithKey(payload: string, key: Buffer): string {
  const { iv, tag, data } = splitPayload(payload);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    // Причину (неверный ключ или подмена данных) намеренно не раскрываем.
    throw new DecryptError('Не удалось расшифровать секрет');
  }
}

type DecryptResult = { plain: string; keyIndex: number; legacy: boolean };

function decryptDetailed(payload: string): DecryptResult {
  const { legacy } = splitPayload(payload);
  const keys = decryptionKeys();
  for (let i = 0; i < keys.length; i += 1) {
    try {
      return { plain: decryptWithKey(payload, keys[i]), keyIndex: i, legacy };
    } catch (e) {
      if (!(e instanceof DecryptError)) throw e;
    }
  }
  throw new DecryptError('Не удалось расшифровать секрет');
}

export function decryptSecret(payload: string): string {
  return decryptDetailed(payload).plain;
}

// true — значение в старом формате или зашифровано предыдущим ключом.
export function needsReencrypt(payload: string): boolean {
  const r = decryptDetailed(payload);
  return r.legacy || r.keyIndex > 0;
}

// Перешифровывает текущим ключом (для ротации). Без изменений, если перешифровка не нужна.
export function reencryptSecret(payload: string): string {
  const r = decryptDetailed(payload);
  if (!r.legacy && r.keyIndex === 0) return payload;
  return encryptSecret(r.plain);
}
