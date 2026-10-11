// lib/crypto.ts — шифрование SMTP-паролей, AES-256-GCM (ТЗ §0.3, §34). Ключ: ENCRYPTION_KEY, hex, 32 байта.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('ENCRYPTION_KEY должен быть 64 hex-символа (32 байта)');
  return Buffer.from(hex, 'hex');
}

// Формат: base64(iv).base64(tag).base64(cipher)
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
