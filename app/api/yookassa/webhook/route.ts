import { NextRequest, NextResponse } from 'next/server';
import { verifyYookassaWebhook } from '@/lib/yookassa';
import { markCheckoutPaid } from '@/lib/partners';
import { logError } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Вебхук ЮKassa: подтверждает подпись и отмечает чекаут оплаченным.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const headers = {
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
    authorization: req.headers.get('authorization'),
  };

  if (!verifyYookassaWebhook(headers, raw)) {
    return NextResponse.json({ ok: false, error: 'bad_signature' }, { status: 401 });
  }

  let payload: {
    event?: string;
    object?: {
      id?: string;
      status?: string;
      amount?: { value?: string; currency?: string };
      metadata?: Record<string, string>;
    };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  // Обрабатываем только успешную оплату.
  if (payload.event !== 'payment.succeeded' || !payload.object?.id) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const yookassaPaymentId = payload.object.id;
  const checkoutId = payload.object.metadata?.checkoutId;

  try {
    // Ищем чекаут по metadata (точно) или по yookassa_payment_id (fallback).
    const { adminClient } = await import('@/lib/supabase');
    const client = adminClient() as any;
    let targetId = checkoutId;
    if (!targetId) {
      const { data } = await client
        .from('partner_checkouts')
        .select('id')
        .eq('yookassa_payment_id', yookassaPaymentId)
        .maybeSingle();
      targetId = (data as { id: string } | null)?.id ?? undefined;
    }
    if (!targetId) return NextResponse.json({ ok: true, ignored: 'no_checkout' });

    // Сумма: платёж создаётся на сумму счёта, но вебхуку верить на слово нельзя —
    // без сверки платёж на 1 ₽ активировал бы сайт за 5 000 ₽. При расхождении сайт не включаем,
    // отвечаем 200 (иначе ЮKassa будет ретраить вечно) и пишем в журнал.
    const paid = Number(payload.object.amount?.value);
    if (Number.isFinite(paid)) {
      const { data: row } = await client.from('partner_checkouts').select('amount').eq('id', targetId).maybeSingle();
      const expected = Number((row as { amount?: number } | null)?.amount);
      if (Number.isFinite(expected) && Math.abs(expected - paid) > 0.009) {
        await logError('admin', 'yookassa_amount_mismatch', { checkout: targetId, expected, paid });
        return NextResponse.json({ ok: true, ignored: 'amount_mismatch' });
      }
    }

    await markCheckoutPaid(targetId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
