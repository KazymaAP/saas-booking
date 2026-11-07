// app/api/demo/partner/route.ts — вход в демо-кабинет партнёра одним кликом.
// Создаёт (идемпотентно) демо-партнёра с данными и открывает настоящую партнёрскую сессию.
import { NextResponse } from 'next/server';
import { ensureDemoPartner } from '@/lib/demo';
import { createPartnerSession, writePartnerSessionCookie } from '@/lib/partners-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { id } = await ensureDemoPartner();
    writePartnerSessionCookie(createPartnerSession(id));
    return NextResponse.redirect(new URL('/partner', req.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'demo unavailable';
    return NextResponse.redirect(new URL(`/partner/demo?error=${encodeURIComponent(message)}`, req.url));
  }
}
