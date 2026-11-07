// lib/flash.ts — одноразовые уведомления между server action и страницей (живут 5 минут).
// Пароли, токены и ссылки-приглашения во flash НЕ пишутся никогда: доступ передаётся письмом
// со ссылкой /invite/{token} (lib/auth-invites.ts, lib/auth-mail.ts). Тип FlashMessage не имеет поля
// для секрета, а readFlash отбрасывает любые посторонние поля из старых cookie.
import { cookies } from 'next/headers';

export const FLASH_COOKIE = 'sa_flash';
const FLASH_TTL_SECONDS = 5 * 60;
const EMAIL_MAX = 254;

export type FlashMessage =
  | { readonly kind: 'invite_sent'; readonly email: string }
  | { readonly kind: 'access_created'; readonly email: string }
  | { readonly kind: 'invite_failed'; readonly email: string }
  | { readonly kind: 'error'; readonly code: string };

const EMAIL_KINDS = ['invite_sent', 'access_created', 'invite_failed'] as const;
type EmailKind = (typeof EMAIL_KINDS)[number];

function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === 'string' && (EMAIL_KINDS as readonly string[]).includes(value);
}

// Разбор значения cookie. Возвращает только известные поля; всё прочее (в том числе password
// из cookie старого формата) отбрасывается и в разметку не попадает.
export function parseFlash(raw: string | undefined): FlashMessage | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const kind: unknown = Reflect.get(parsed, 'kind');
  const email: unknown = Reflect.get(parsed, 'email');
  const code: unknown = Reflect.get(parsed, 'code');
  if (isEmailKind(kind) && typeof email === 'string' && email.length <= EMAIL_MAX) return { kind, email };
  if (kind === 'error' && typeof code === 'string' && /^[a-z_]{1,40}$/.test(code)) return { kind, code };
  return null;
}

// Только из Server Action / Route Handler. path ограничивает, какие страницы увидят сообщение.
export function writeFlash(message: FlashMessage, path: string = '/'): void {
  cookies().set(FLASH_COOKIE, JSON.stringify(message), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path,
    maxAge: FLASH_TTL_SECONDS,
  });
}

// Чтение в Server Component. Удалить cookie здесь нельзя (ограничение Next.js) — она истечёт сама
// через 5 минут; содержимое не секретно.
export function readFlash(): FlashMessage | null {
  return parseFlash(cookies().get(FLASH_COOKIE)?.value);
}
