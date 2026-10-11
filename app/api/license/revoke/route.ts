// app/api/license/revoke/route.ts — ручная блокировка лицензии (ТЗ §5.8, §54). Только супер-админ.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

const Body = z.object({ license_id: z.string().uuid(), revoked: z.boolean() });

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'validation' }, { status: 400 });
  const { error } = await adminClient()
    .from('licenses').update({ revoked: parsed.data.revoked }).eq('license_id', parsed.data.license_id);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  await audit(parsed.data.revoked ? 'license_revoke' : 'license_restore', 'license', null, { license_id: parsed.data.license_id });
  return NextResponse.json({ ok: true });
}
