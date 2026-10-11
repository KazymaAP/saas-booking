// app/api/verticals/route.ts — выгрузка всех ниш в JSON (ТЗ §5.4 «загрузка/выгрузка JSON»). Только супер-админ.
import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { data } = await adminClient().from('vertical_templates').select('name, slug, icon, url_prefix, description, fields, default_services, default_texts, default_colors, blocks, show_demo_mode, is_active').order('name');
  return new Response(JSON.stringify(data ?? [], null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="verticals.json"' },
  });
}
