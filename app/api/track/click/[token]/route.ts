// app/api/track/click/[token]/route.ts — клик по ссылке в письме (ТЗ §5.5, §54).
// Редирект только на адреса нашего сайта: защита от open redirect.
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

import { SITE_URL as SITE } from '@/lib/site';

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const to = url.searchParams.get('to') ?? `${SITE}/`;
  const target = to.startsWith(SITE) ? to : `${SITE}/`;

  if (/^[0-9a-f]{32}$/.test(params.token)) {
    const db = adminClient();
    const { data } = await db.from('outreach_log').select('id, clicked_at').eq('tracking_token', params.token).maybeSingle();
    if (data && !data.clicked_at) {
      const now = new Date().toISOString();
      await db.from('outreach_log').update({ clicked_at: now }).eq('id', data.id);
      await db.from('emails_outgoing').update({ clicked_at: now }).eq('outreach_log_id', data.id);
    }
  }
  return NextResponse.redirect(target, 302);
}
