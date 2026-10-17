// app/api/license/revoke/route.ts — ручная блокировка/разблокировка лицензии (ТЗ 4.0 §14.6: «только вручную»).
// Только супер-админ. Идемпотентно: повторный запрос с тем же revoked не меняет данные и не пишет audit.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSuperAdmin } from '@/lib/admin-session';
import { audit } from '@/lib/audit';
import { setLicenseRevoked } from '@/lib/license-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  license_id: z.string().uuid(),
  revoked: z.boolean(),
  reason: z.string().trim().max(300).optional(), // причина попадает в audit, не в ответ
});

export async function POST(req: Request): Promise<Response> {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'validation' }, { status: 400 });
  const { license_id, revoked, reason } = parsed.data;

  const r = await setLicenseRevoked({ by: 'license_id', value: license_id }, revoked);
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: r.reason === 'not_found' ? 404 : 500 });
  if (r.changed) {
    await audit(revoked ? 'license_revoke' : 'license_restore', 'license', null, { license_id, reason: reason ?? null, via: 'api' });
  }
  return NextResponse.json({ ok: true, revoked, changed: r.changed });
}
