// app/api/track/open/[token]/route.ts — пиксель открытия письма (ТЗ §5.5, §54).
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (/^[0-9a-f]{32}$/.test(params.token)) {
    const db = adminClient();
    const { data } = await db.from('outreach_log').select('id, opened_at').eq('tracking_token', params.token).maybeSingle();
    if (data && !data.opened_at) {
      const now = new Date().toISOString();
      await db.from('outreach_log').update({ opened_at: now }).eq('id', data.id);
      await db.from('emails_outgoing').update({ opened_at: now }).eq('outreach_log_id', data.id);
    }
  }
  return new Response(GIF, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
  });
}
