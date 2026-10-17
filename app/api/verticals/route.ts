// app/api/verticals/route.ts — выгрузка всех ниш в JSON (ТЗ §4.5, §13.1 «загрузка/выгрузка JSON»). Только супер-админ.
// Формат = вход импорта (/panel/verticals → importVerticals): набор колонок берётся из verticalSchema,
// поэтому скачанный файл всегда загружается обратно без правок. Служебные id/created_at не выгружаются.
import { isSuperAdmin } from '@/lib/admin-session';
import { adminClient } from '@/lib/supabase';
import { errorMessage, logError } from '@/lib/log';
import { verticalSchema } from '@/app/panel/(protected)/verticals/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = Object.keys(verticalSchema.shape);
const PRETTY = 2;

// Ответы без кэширования: выгрузка зависит от сессии и меняется после каждой правки.
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;

function jsonError(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function GET(): Promise<Response> {
  if (!(await isSuperAdmin())) return jsonError(401, 'Нет доступа. Войдите заново.');
  const { data, error } = await adminClient().from('vertical_templates').select(COLUMNS.join(', ')).order('name').returns<Record<string, unknown>[]>();
  if (error) {
    await logError('export', errorMessage(error.message), { route: 'verticals' });
    return jsonError(500, 'Не удалось выгрузить ниши');
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data ?? [], null, PRETTY), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="verticals-${date}.json"`,
    },
  });
}
