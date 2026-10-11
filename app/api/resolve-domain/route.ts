// app/api/resolve-domain/route.ts — по кастомному домену отдаёт префикс и slug бизнеса (ТЗ §3.3, §40). Вызывает middleware.
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  if (!host) return NextResponse.json({ ok: false }, { status: 400 });
  const { data } = await adminClient()
    .from('businesses')
    .select('slug, status, vertical_templates(url_prefix)')
    .eq('custom_domain', host)
    .maybeSingle();
  const prefix = (data as any)?.vertical_templates?.url_prefix;
  if (!data || !prefix) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, prefix, slug: data.slug, status: data.status }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
