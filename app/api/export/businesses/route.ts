// app/api/export/businesses/route.ts — экспорт списка бизнесов в CSV или XLSX (ТЗ §5.4). Только супер-админ.
import * as XLSX from 'xlsx';
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

const COLUMNS = ['id', 'name', 'slug', 'status', 'city', 'address', 'phones', 'emails', 'websites', 'rating', 'reviews_count', 'custom_domain', 'ssl_status', 'subscription_until', 'created_at'] as const;

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  if (!(await isSuperAdmin())) return new Response('Forbidden', { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  let q = adminClient().from('businesses').select(COLUMNS.join(', ')).order('created_at', { ascending: false }).limit(50000);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return new Response('Server error', { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const date = new Date().toISOString().slice(0, 10);
  const base = `businesses${status ? `-${status}` : ''}-${date}`;

  if (format === 'xlsx') {
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c, Array.isArray(r[c]) ? (r[c] as unknown[]).join('; ') : r[c] ?? '']))));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Бизнесы');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${base}.xlsx"` },
    });
  }

  const lines = [COLUMNS.join(',')];
  for (const row of rows) lines.push(COLUMNS.map((c) => cell(row[c])).join(','));
  return new Response('\uFEFF' + lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.csv"` },
  });
}
