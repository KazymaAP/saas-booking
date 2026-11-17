// app/api/yookassa/webhook/route.test.ts — вебхук оплаты: подпись, событие, сумма, идемпотентность.
// Регрессии: (1) сумма не сверялась со счётом — платёж на 1 ₽ активировал бы сайт за 5 000 ₽;
// (2) повторный вебхук начислял комиссию дважды (закрыто индексом 0030, здесь — что повтор не ломает ответ).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  signatureOk: true,
  checkout: { amount: 5000 } as { amount: number } | null,
  paid: vi.fn(async (_id: string) => ({ id: _id })),
  logged: [] as string[],
}));

vi.mock('@/lib/yookassa', () => ({ verifyYookassaWebhook: () => h.signatureOk }));
vi.mock('@/lib/partners', () => ({ markCheckoutPaid: h.paid }));
vi.mock('@/lib/log', () => ({ logError: async (_scope: string, message: string) => { h.logged.push(message); } }));
vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.checkout, error: null }),
        }),
      }),
    }),
  }),
}));

const { POST } = await import('./route');

const CHECKOUT_ID = '11111111-1111-1111-1111-111111111111';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/yookassa/webhook', {
    method: 'POST',
    headers: { 'webhook-id': 'w1', 'webhook-timestamp': '1', 'webhook-signature': 'sig' },
    body: JSON.stringify(body),
  });
}

const payment = (value: string) => ({
  event: 'payment.succeeded',
  object: { id: 'pay-1', status: 'succeeded', amount: { value, currency: 'RUB' }, metadata: { checkoutId: CHECKOUT_ID } },
});

describe('POST /api/yookassa/webhook', () => {
  beforeEach(() => {
    h.signatureOk = true;
    h.checkout = { amount: 5000 };
    h.paid.mockClear();
    h.logged.length = 0;
  });

  it('подпись неверна — 401 и никакой активации', async () => {
    h.signatureOk = false;
    const res = await POST(request(payment('5000.00')));
    expect(res.status).toBe(401);
    expect(h.paid).not.toHaveBeenCalled();
  });

  it('сумма совпадает — счёт отмечается оплаченным', async () => {
    const res = await POST(request(payment('5000.00')));
    expect(res.status).toBe(200);
    expect(h.paid).toHaveBeenCalledWith(CHECKOUT_ID);
  });

  it('сумма меньше счёта — активации нет, ответ 200 без ретраев, запись в журнал', async () => {
    const res = await POST(request(payment('1.00')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: 'amount_mismatch' });
    expect(h.paid).not.toHaveBeenCalled();
    expect(h.logged).toContain('yookassa_amount_mismatch');
  });

  it('счёт не найден в БД — сверку пропускаем, решение принимает markCheckoutPaid', async () => {
    h.checkout = null;
    const res = await POST(request(payment('5000.00')));
    expect(res.status).toBe(200);
    expect(h.paid).toHaveBeenCalledWith(CHECKOUT_ID);
  });

  it('не payment.succeeded — игнор', async () => {
    const res = await POST(request({ event: 'payment.canceled', object: { id: 'pay-1' } }));
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(h.paid).not.toHaveBeenCalled();
  });

  it('битый JSON — 400', async () => {
    const res = await POST(new NextRequest('http://localhost/api/yookassa/webhook', { method: 'POST', body: '{' }));
    expect(res.status).toBe(400);
  });
});
