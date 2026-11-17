// app/api/demo/customer/route.ts — вход в демо-кабинет клиента (/my) одним кликом.
// Идемпотентно создаёт демо-бизнес + демо-клиента, открывает клиентскую сессию и редиректит на /m/demo/my.
// Доступ: только при DEMO_ENABLED=1 и только со своего origin (см. общие/lib/demo-gate.ts).
import { NextResponse } from 'next/server';
import { ensureDemoCustomer } from '@/lib/demo';
import { createCustomer, startCustomerSession } from '@/lib/customer-session';
import { DEMO_CUSTOMER_EMAIL, DEMO_CUSTOMER_NAME, DEMO_PREFIX, DEMO_SLUG } from '@/lib/demo-constants';
import { BAD_ORIGIN_REASON, DEMO_DISABLED_REASON, demoEnabled, isSameOriginRequest } from '@/lib/demo-gate';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!demoEnabled()) return NextResponse.json({ ok: false, reason: DEMO_DISABLED_REASON }, { status: 404 });
  if (!isSameOriginRequest(req)) return NextResponse.json({ ok: false, reason: BAD_ORIGIN_REASON }, { status: 403 });
  try {
    const { businessId } = await ensureDemoCustomer();
    // Сессия клиента — подписанный JWT в cookie; readCustomerSession его проверит по business_id.
    // createCustomer идемпотентен: сначала ищет клиента по (business_id, email) и только потом вставляет,
    // поэтому повторный заход в демо не плодит дубликаты строк в customers.
    const customer = await createCustomer(businessId, DEMO_CUSTOMER_EMAIL, { name: DEMO_CUSTOMER_NAME });
    startCustomerSession({ id: customer.id, email: customer.email });
    return NextResponse.redirect(new URL(`/${DEMO_PREFIX}/${DEMO_SLUG}/my`, req.url));
  } catch (err) {
    // Текст ошибки — только в журнал: в URL он раскрывал бы внутренние детали (имена таблиц, env).
    await logError('demo', err instanceof Error ? err.message : String(err), { route: 'demo/customer' });
    return NextResponse.redirect(new URL('/demo/business?error=unavailable', req.url));
  }
}
