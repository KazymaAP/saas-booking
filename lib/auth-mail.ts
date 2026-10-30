// lib/auth-mail.ts — письма аутентификации: приглашение, magic-link, сброс пароля (ТЗ §5.4–5.6, §9).
// Отправка через общий sendMail (lib/notify.ts, зона агента 8). Пароли в письмах не передаются никогда.
// Ссылки строятся только от SITE_URL — не от заголовка Host, чтобы подменённый Host не увёл токен на чужой домен.
import { sendMail } from './notify';
import { SITE_URL } from './site';
import { logError } from './log';
import { INVITE_TTL_SECONDS, MAGIC_LINK_TTL_SECONDS, RESET_TTL_SECONDS, ttlText } from './auth-core';
import { ROLE_GENITIVE } from './auth-roles';

export function inviteUrl(token: string): string {
  return `${SITE_URL}/invite/${encodeURIComponent(token)}`;
}

export function magicLinkUrl(token: string): string {
  return `${SITE_URL}/magic-link?token=${encodeURIComponent(token)}`;
}

export function resetUrl(token: string): string {
  return `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

export type AuthMail = { readonly to: string; readonly subject: string; readonly text: string };

export function inviteMail(to: string, token: string, businessName: string, role: 'owner' | 'manager'): AuthMail {
  return {
    to,
    subject: `Приглашение в кабинет «${businessName}»`,
    text: [
      `Вас пригласили в кабинет «${businessName}» с правами ${ROLE_GENITIVE[role]}.`,
      '',
      `Чтобы принять приглашение и задать пароль, откройте ссылку: ${inviteUrl(token)}`,
      '',
      `Ссылка действует ${ttlText(INVITE_TTL_SECONDS)} и сработает один раз.`,
      'Если вы не ждали этого письма, просто удалите его.',
    ].join('\n'),
  };
}

export function magicLinkMail(to: string, token: string): AuthMail {
  return {
    to,
    subject: 'Вход по ссылке',
    text: [
      `Для входа в кабинет откройте ссылку: ${magicLinkUrl(token)}`,
      '',
      `Ссылка действует ${ttlText(MAGIC_LINK_TTL_SECONDS)} и сработает один раз.`,
      'Если вы не запрашивали вход, просто удалите письмо — без ссылки войти нельзя.',
    ].join('\n'),
  };
}

export function resetMail(to: string, token: string): AuthMail {
  return {
    to,
    subject: 'Сброс пароля',
    text: [
      `Чтобы задать новый пароль, откройте ссылку: ${resetUrl(token)}`,
      '',
      `Ссылка действует ${ttlText(RESET_TTL_SECONDS)} и сработает один раз.`,
      'Если вы не запрашивали сброс, просто удалите письмо — текущий пароль продолжит работать.',
    ].join('\n'),
  };
}

// true — письмо ушло. Ошибка SMTP не пробрасывается: пишем в журнал ошибок без адреса получателя.
export async function deliver(mail: AuthMail, kind: 'invite' | 'magic_link' | 'reset'): Promise<boolean> {
  try {
    // №26: письма авторизации (приглашение, magic-link, сброс пароля) — транзакционные, не расходуют лимит рассылки.
    const sent = await sendMail({ ...mail, transactional: true });
    if (!sent) await logError('email', `auth ${kind}: нет доступного ящика`, { kind });
    return sent;
  } catch (err) {
    await logError('email', `auth ${kind}: ошибка отправки`, { kind, error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' });
    return false;
  }
}
