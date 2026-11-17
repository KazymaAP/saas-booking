// app/api/demo/partner/route.ts — вход в демо-кабинет партнёра одним кликом.
// Создаёт (идемпотентно) демо-партнёра с данными и открывает настоящую партнёрскую сессию.
// Доступ: только при DEMO_ENABLED=1 и только со своего origin (см. общие/lib/demo-gate.ts).
import { NextResponse } from 'next/server';
import { ensureDemoPartner } from '@/lib/demo';
import { createPartnerSession, writePartnerSessionCookie } from '@/lib/partners-auth';
import { BAD_ORIGIN_REASON, DEMO_DISABLED_REASON, demoEnabled, isSameOriginRequest } from '@/lib/demo-gate';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ ok: false, reason: DEMO_DISABLED_REASON }, { status: 404 });
  if (!isSameOriginRequest(req)) return NextResponse.json({ ok: false, reason: BAD_ORIGIN_REASON }, { status: 403 });
  try {
    const { id } = await ensureDemoPartner();
    writePartnerSessionCookie(createPartnerSession(id));
    return NextResponse.redirect(new URL('/partner', req.url));
  } catch (err) {
    // Текст ошибки — только в журнал: в URL он раскрывал бы внутренние детали (имена таблиц, env).
    await logError('demo', err instanceof Error ? err.message : String(err), { route: 'demo/partner' });
    return NextResponse.redirect(new URL('/partner/demo?error=unavailable', req.url));
  }
}
