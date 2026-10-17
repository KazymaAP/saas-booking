// app/[prefix]/[slug]/panel/export/route.ts — выгрузка броней бизнеса в CSV (ТЗ §32).
// Только владелец этого бизнеса: в файле ПД клиентов (имя, телефон, email). Manager получает 403.
// Supabase отдаёт не больше 1000 строк за запрос — читаем страницами, иначе CSV молча обрезался бы.
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { STATUS_LABEL } from '../(protected)/bookings/status';
import { BUSINESS_TZ } from '../(protected)/_lib/time';
import { buildCsv, exportFilename, type ExportBooking } from './csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
// Предел защищает функцию от таймаута и памяти; у малого бизнеса столько броней за жизнь не набирается.
const MAX_ROWS = 50_000;

const DATE = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit' });
const FORMATTERS = {
  date: (iso: string) => DATE.format(new Date(iso)),
  time: (iso: string) => TIME.format(new Date(iso)),
  status: (s: ExportBooking['status']) => STATUS_LABEL[s],
};

async function loadBookings(businessId: string): Promise<ExportBooking[] | null> {
  const db = adminClient();
  const out: ExportBooking[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('bookings')
      .select('scheduled_at, status, client_name, client_phone, client_email, comment, created_at, services(name, price)')
      .eq('business_id', businessId)
      // id — второй ключ: стабильный порядок между страницами при одинаковом времени.
      .order('scheduled_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<ExportBooking[]>();
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

function plain(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(_req: Request, { params }: { params: { prefix: string; slug: string } }) {
  const access = await currentOwner(params.slug);
  if (!access) return plain(401, 'Войдите в кабинет');
  if (access.member.role !== 'owner') return plain(403, 'Выгрузка доступна только владельцу');

  const rows = await loadBookings(access.business.id);
  if (!rows) return plain(500, 'Не удалось выгрузить данные. Попробуйте ещё раз');

  // Факт выгрузки ПД — в журнал (без самих данных).
  await audit('bookings_export', 'business', access.business.id, { rows: rows.length }).catch(() => undefined);

  return new Response(buildCsv(rows, FORMATTERS), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(access.business.slug, new Date())}"`,
      // Файл с ПД не должен оседать в кэше браузера или прокси.
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
