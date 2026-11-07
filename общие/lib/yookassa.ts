// lib/yookassa.ts — интеграция с ЮKassa (платежи предпринимателей по партнёрским счетам).
// Документация: https://yookassa.ru/docs/api/ (v3). Работает в двух режимах:
//   - боевой: YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY заданы → реальные платежи;
//   - песочный/дев: ключи не заданы или YOOKASSA_TEST_MODE=true → возвращает мок-платёж
//     с confirmation_url, ведущей на return_url?mock_paid=1 (для локальной проверки без ключей).
import { createHmac } from 'crypto';

const API_BASE = 'https://api.yookassa.ru/v3';

export type YookassaPayment = {
  id: string;
  status: string;
  confirmationUrl: string | null;
};

function shopId(): string {
  return (process.env.YOOKASSA_SHOP_ID ?? '').trim();
}
function secretKey(): string {
  return (process.env.YOOKASSA_SECRET_KEY ?? '').trim();
}
function isTestMode(): boolean {
  return (process.env.YOOKASSA_TEST_MODE ?? '').trim() === 'true';
}
export function isYookassaConfigured(): boolean {
  return Boolean(shopId() && secretKey()) && !isTestMode();
}
function authHeader(): string {
  const raw = `${shopId()}:${secretKey()}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

// Создаёт платёж. idempotenceKey гарантирует, что повторный вызов не создаст второй платёж.
export async function createYookassaPayment(opts: {
  amount: number;
  description: string;
  returnUrl: string;
  idempotenceKey: string;
  metadata?: Record<string, string>;
}): Promise<YookassaPayment> {
  if (!isYookassaConfigured()) {
    // В продакшене мок допустим только при явном YOOKASSA_TEST_MODE=true:
    // иначе счёт «оплачивался» бы без денег — это скрытая заглушка в боевом пути.
    if (process.env.NODE_ENV === 'production' && !isTestMode()) {
      throw new Error('Платёжный провайдер не настроен: задайте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY');
    }
    // Дев/тест: ссылка ведёт на return_url с флагом, деньги не списываются.
    const sep = opts.returnUrl.includes('?') ? '&' : '?';
    return {
      id: `test_${opts.idempotenceKey}`,
      status: 'pending',
      confirmationUrl: `${opts.returnUrl}${sep}mock_paid=1`,
    };
  }

  const body = {
    amount: { value: opts.amount.toFixed(2), currency: 'RUB' },
    confirmation: { type: 'redirect', return_url: opts.returnUrl },
    capture: true,
    description: opts.description.slice(0, 128),
    metadata: opts.metadata ?? {},
  };

  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      'Idempotence-Key': opts.idempotenceKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YooKassa createPayment ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    id: string;
    status: string;
    confirmation?: { type: string; return_url?: string; confirmation_url?: string };
  };
  return {
    id: data.id,
    status: data.status,
    confirmationUrl: data.confirmation?.confirmation_url ?? data.confirmation?.return_url ?? null,
  };
}

// Верификация подписи вебхука ЮKassa.
// Схема: Webhook-Signature: sha256=base64(hmac_sha256(secretKey, id + "\n" + timestamp + "\n" + rawBody)).
export function verifyYookassaWebhook(headers: {
  id?: string | null;
  timestamp?: string | null;
  signature?: string | null;
  authorization?: string | null;
}, rawBody: string): boolean {
  const key = secretKey();
  if (!key) return false;

  // Вариант 1: Basic-авторизация магазином (shopId:secret) — допустимо для приватных эндпоинтов.
  if (headers.authorization) {
    const expected = `Basic ${Buffer.from(`${shopId()}:${key}`).toString('base64')}`;
    if (headers.authorization === expected) return true;
  }

  // Вариант 2: подпись Webhook-Signature.
  const sigHeader = (headers.signature ?? '').trim();
  if (!sigHeader || !headers.id || !headers.timestamp) return false;
  const sigValue = sigHeader.startsWith('sha256=') ? sigHeader.slice('sha256='.length) : sigHeader;
  const expected = createHmac('sha256', key)
    .update(`${headers.id}\n${headers.timestamp}\n${rawBody}`)
    .digest('base64');
  try {
    const a = Buffer.from(sigValue);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqualLocal(a, b);
  } catch {
    return false;
  }
}

function timingSafeEqualLocal(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
