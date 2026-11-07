// app/api/demo/owner/route.ts — вход в демо-кабинет предпринимателя одним кликом.
// Создаёт (идемпотентно) демо-бизнес и демо-владельца, затем открывает настоящую сессию владельца.
import { NextResponse } from 'next/server';
import { ensureDemoBusiness } from '@/lib/demo';
import { passwordSignIn } from '@/lib/auth-provider';
import { startSession } from '@/lib/auth-session';
import { DEMO_OWNER_EMAIL, DEMO_PASSWORD, DEMO_PREFIX, DEMO_SLUG } from '@/lib/demo-constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await ensureDemoBusiness();
    const session = await passwordSignIn(DEMO_OWNER_EMAIL, DEMO_PASSWORD);
    if (!session) {
      return NextResponse.redirect(new URL('/demo/business?error=auth', req.url));
    }
    startSession('owner', session);
    return NextResponse.redirect(new URL(`/${DEMO_PREFIX}/${DEMO_SLUG}/panel`, req.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'demo unavailable';
    return NextResponse.redirect(new URL(`/demo/business?error=${encodeURIComponent(message)}`, req.url));
  }
}
