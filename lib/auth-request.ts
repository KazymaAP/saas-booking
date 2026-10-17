// lib/auth-request.ts — контекст запроса для auth-действий: IP, хост, проверка Origin (ТЗ §5.8, §5.9, §17.4).
// Только серверный код: читает заголовки текущего запроса через next/headers.
import { headers } from 'next/headers';
import { MAIN_HOSTS } from './site';
import { isMainHost, isSameOrigin, parseClientIp } from './auth-core';

export type RequestContext = {
  readonly ip: string;
  readonly host: string | null;
  readonly sameOrigin: boolean;
  readonly mainHost: boolean;
  readonly userAgent: string;
  readonly pathname: string | null;
};

const USER_AGENT_MAX = 200;

export function requestContext(): RequestContext {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return {
    ip: parseClientIp(h.get('x-forwarded-for'), h.get('x-real-ip')),
    host,
    sameOrigin: isSameOrigin(h.get('origin'), h.get('referer'), host),
    mainHost: isMainHost(host, MAIN_HOSTS),
    userAgent: (h.get('user-agent') ?? '').slice(0, USER_AGENT_MAX),
    // x-pathname выставляет middleware (запрос агенту зоны middleware, см. notes.md). Без него — null.
    pathname: h.get('x-pathname'),
  };
}

// Базовый путь кабинета владельца. На кастомном домене middleware переписывает /panel/* →
// /{prefix}/{slug}/panel/*, поэтому ссылки и редиректы там должны вести на /panel (ТЗ §3.3, §40).
export function ownerBasePath(prefix: string, slug: string, ctx: RequestContext = requestContext()): string {
  return ctx.mainHost ? `/${prefix}/${slug}/panel` : '/panel';
}
