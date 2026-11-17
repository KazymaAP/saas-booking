// app/api/demo/owner/route.ts — вход в демо-кабинет предпринимателя одним кликом.
// Создаёт (идемпотентно) демо-бизнес и демо-владельца, затем открывает настоящую сессию владельца.
// Доступ: только при DEMO_ENABLED=1 и только со своего origin (см. общие/lib/demo-gate.ts).
import { NextResponse } from 'next/server';
import { ensureDemoBusiness } from '@/lib/demo';
import { passwordSignIn } from '@/lib/auth-provider';
import { startSession } from '@/lib/auth-session';
import { DEMO_OWNER_EMAIL, DEMO_PREFIX, DEMO_SLUG } from '@/lib/demo-constants';
import { demoPassword } from '@/lib/demo-secret';
import { BAD_ORIGIN_REASON, DEMO_DISABLED_REASON, demoEnabled, isSameOriginRequest } from '@/lib/demo-gate';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ ok: false, reason: DEMO_DISABLED_REASON }, { status: 404 });
  if (!isSameOriginRequest(req)) return NextResponse.json({ ok: false, reason: BAD_ORIGIN_REASON }, { status: 403 });
  try {
    await ensureDemoBusiness();
    const session = await passwordSignIn(DEMO_OWNER_EMAIL, demoPassword());
    if (!session) {
      return NextResponse.redirect(new URL('/demo/business?error=auth', req.url));
    }
    startSession('owner', session);
    return NextResponse.redirect(new URL(`/${DEMO_PREFIX}/${DEMO_SLUG}/admin`, req.url));
  } catch (err) {
    // Текст ошибки — только в журнал: в URL он раскрывал бы внутренние детали (имена таблиц, env).
    await logError('demo', err instanceof Error ? err.message : String(err), { route: 'demo/owner' });
    return NextResponse.redirect(new URL('/demo/business?error=unavailable', req.url));
  }
}
