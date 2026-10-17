// app/api/analytics/summary/route.ts — JSON-агрегаты для дашборда (ТЗ 4.0 §12.3, §13.8).
// GET ?business_id=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD&group_by=day|week|month
// Права: супер-админ — любой бизнес и общий отчёт (без business_id); владелец/менеджер — только свой бизнес.
// Кэш: данные — 60 c на сервере (loadSummary), ответ — private max-age=60 (персональные данные кабинета не в CDN).
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/admin-session';
import { currentOwner } from '@/lib/owner-session';
import { logError } from '@/lib/log';
import { SUMMARY_CACHE_SECONDS, loadSummary, parseSummaryParams } from '@/lib/analytics-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_CACHE = `private, max-age=${SUMMARY_CACHE_SECONDS}`;

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Владелец проверяется существующей логикой кабинета: бизнес по id → slug → currentOwner(slug).
async function isOwnerOf(businessId: string): Promise<boolean> {
  const { data, error } = await adminClient().from('businesses').select('slug').eq('id', businessId).maybeSingle();
  if (error || !data?.slug) return false;
  const owner = await currentOwner(String(data.slug));
  return owner?.business.id === businessId;
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = parseSummaryParams({
    business_id: url.searchParams.get('business_id'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    group_by: url.searchParams.get('group_by'),
  });
  if (!parsed.ok) return fail(400, parsed.error);
  const { params } = parsed;

  try {
    const allowed = (await isSuperAdmin()) || (params.business_id !== null && (await isOwnerOf(params.business_id)));
    if (!allowed) return fail(403, 'forbidden');

    const summary = await loadSummary(params);
    return NextResponse.json({ ok: true, ...summary }, { headers: { 'Cache-Control': PRIVATE_CACHE, Vary: 'Cookie' } });
  } catch (e) {
    // В лог — только текст ошибки и параметры отчёта (без cookie, IP и прочего PII).
    await logError('cron', `analytics summary: ${e instanceof Error ? e.message : 'unknown'}`, { params });
    return fail(500, 'internal');
  }
}
