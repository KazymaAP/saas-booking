// app/[prefix]/[slug]/panel/export/route.ts — выгрузка данных бизнеса в CSV (ТЗ §32). Только владелец/менеджер этого бизнеса.
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: { prefix: string; slug: string } }) {
  const access = await currentOwner(params.slug);
  if (!access) return new Response('Forbidden', { status: 403 });

  const { data } = await adminClient()
    .from('bookings')
    .select('scheduled_at, status, client_name, client_phone, client_email, comment, created_at, services(name, price)')
    .eq('business_id', access.business.id)
    .order('scheduled_at', { ascending: false });

  const cols = ['Дата', 'Статус', 'Клиент', 'Телефон', 'Email', 'Услуга', 'Цена', 'Комментарий', 'Создано'];
  const lines = [cols.join(',')];
  for (const b of (data ?? []) as any[]) {
    lines.push([b.scheduled_at, b.status, b.client_name, b.client_phone, b.client_email, b.services?.name, b.services?.price, b.comment, b.created_at].map(cell).join(','));
  }
  const body = '\uFEFF' + lines.join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookings-${params.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
