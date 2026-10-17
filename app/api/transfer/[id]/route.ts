// app/api/transfer/[id]/route.ts — передача кода клиенту (ТЗ 4.0 §14.4, §5.9). Только супер-админ.
// Без ZIP: один .txt с разделами README.md / INSTALL.md / MIGRATIONS.md / .env.example (lib/transfer.ts).
// Укладывается в Vercel Hobby (maxDuration 10 с): 3–5 коротких запросов к БД, без архивации.
// Повторное скачивание идемпотентно: support_until не продлевается.
import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/admin-session';
import { SITE_URL } from '@/lib/site';
import { handleTransfer, supabaseTransferStore } from '@/lib/transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<Response> {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 401 });
  const r = await handleTransfer(params.id, {
    store: supabaseTransferStore(),
    master_secret: process.env.LICENSE_HMAC_SECRET?.trim() || null,
    server_url: SITE_URL,
  }).catch(() => null);
  if (!r) return NextResponse.json({ ok: false, reason: 'db' }, { status: 503 });
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: r.http_status });
  return new Response(r.text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${r.file_name}"`,
      // Файл содержит персональный ключ лицензии: не кэшировать ни в браузере, ни на CDN.
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
