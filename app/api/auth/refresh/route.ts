// app/api/auth/refresh/route.ts — обновление сессии по refresh-токену (ТЗ §5.1: 30 дней без повторного входа).
// Server Components не могут писать cookie, поэтому layout кабинета при истёкшем access-токене
// перенаправляет сюда. GET безопасен: он не меняет данных, только ротирует токены текущего браузера
// (cookie sameSite=lax, refresh-токен с чужого сайта не подставить). next проверяется против open redirect.
import { NextResponse, type NextRequest } from 'next/server';
import { panelRootOf, sanitizePanelNext, type AuthRealm } from '@/lib/auth-core';
import { refreshSession } from '@/lib/auth-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseRealm(raw: string | null): AuthRealm | null {
  if (raw === 'admin' || raw === 'owner') return raw;
  return null;
}

function redirectTo(req: NextRequest, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const realm = parseRealm(req.nextUrl.searchParams.get('realm'));
  const next = sanitizePanelNext(req.nextUrl.searchParams.get('next'));
  if (!realm || !next) return redirectTo(req, '/panel/login');

  const root = panelRootOf(next) ?? '/panel';
  const session = await refreshSession(realm);
  if (session) return redirectTo(req, next);

  const login = new URLSearchParams({ next, reason: 'expired' });
  return redirectTo(req, `${root}/login?${login.toString()}`);
}
