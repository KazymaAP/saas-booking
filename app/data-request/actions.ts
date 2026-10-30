// app/data-request/actions.ts — приём запроса субъекта ПД (ТЗ 4.0 §4.42, §7.2, §15.4; ст. 14, 20, 21 ФЗ-152).
// Порядок: CSRF (Origin) → zod → ловушка для ботов → лимит 3/24ч/IP → INSERT data_requests → уведомление админу.
// Логи и уведомления — без PII: email маскируется, текст запроса в Telegram не уходит.
'use server';
import { headers } from 'next/headers';
import { adminClient } from '@/lib/supabase';
import { hitRateLimit } from '@/lib/rate-limit';
import { notifyAdmin } from '@/lib/admin-notify';
import { sendMail } from '@/lib/notify';
import {
  DATA_REQUEST_ANSWER_DAYS, LEGAL_EMAIL, getClientIp, getRequisites, isTrustedOrigin, isUnsubscribed, logLegalError, maskEmail,
  unsubscribeEmail,
} from '@/lib/legal';
import {
  DATA_REQUEST_RATE_LIMIT, DATA_REQUEST_RATE_WINDOW_SECONDS, DATA_REQUEST_TYPE_LABELS,
  parseDataRequestForm, type DataRequestInput, type DataRequestState,
} from '@/lib/data-request';
import { SITE_URL } from '@/lib/site';

// Сохранение запроса. Ошибка БД — исключение наружу: запрос субъекта нельзя «потерять» молча.
// ТЗ «лог + 500»: server action не задаёт HTTP-статус, поэтому 500 = состояние { reason: 'server' } + запись в журнал.
async function saveRequest(input: DataRequestInput): Promise<string> {
  const request_text = [input.request_text, input.business ? `Бизнес: ${input.business}` : ''].filter(Boolean).join('\n\n');
  const { data, error } = await adminClient()
    .from('data_requests')
    .insert({ email: input.email, type: input.type, request_text: request_text || null, status: 'new' })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'insert вернул пустой результат');
  return String(data.id);
}

// Отказ от писем исполняется сразу, не дожидаясь ручной обработки (ст. 15 ч. 2 ФЗ-152 — немедленно).
async function applyUnsubscribe(input: DataRequestInput): Promise<void> {
  if (input.type !== 'unsubscribe' || (await isUnsubscribed(input.email))) return;
  await unsubscribeEmail(input.email, 'data_request');
}

// Письмо и Telegram админу. Сбой уведомления не отменяет принятый запрос: он уже в БД и виден в панели.
async function notifyOperator(id: string, input: DataRequestInput): Promise<void> {
  const requisites = await getRequisites();
  const to = requisites.email ?? LEGAL_EMAIL;
  const label = DATA_REQUEST_TYPE_LABELS[input.type];
  const summary = `Запрос субъекта ПД № ${id.slice(0, 8)}: «${label}» от ${maskEmail(input.email)}. Срок ответа — ${DATA_REQUEST_ANSWER_DAYS} рабочих дней.`;
  await notifyAdmin(summary).catch(() => false);
  if (!to) return;
  const text = [
    summary,
    '',
    `Email заявителя: ${input.email}`,
    input.business ? `Бизнес: ${input.business}` : '',
    input.request_text ? `Текст запроса:\n${input.request_text}` : 'Текст запроса не указан.',
    '',
    `Ответ направить на email заявителя. Запросы: ${SITE_URL}/panel`,
  ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');
  // №26: запрос субъекта ПД (ФЗ-152) — транзакционное письмо, не расходует лимит рассылки.
  await sendMail({ to, subject: `Запрос субъекта ПД: ${label}`, text, transactional: true }).catch(() => false);
}

export async function submitDataRequest(_prev: DataRequestState, form: FormData): Promise<DataRequestState> {
  const request_headers = headers();
  if (!isTrustedOrigin(request_headers.get('origin'), request_headers.get('host'))) {
    return { status: 'error', reason: 'forbidden' };
  }

  const parsed = parseDataRequestForm(form);
  if (!parsed.ok) return { status: 'error', reason: 'validation', fields: parsed.fields };
  // Бот: отвечаем успехом, чтобы не подсказывать, но ничего не сохраняем.
  if (parsed.honeypot) return { status: 'success', type: parsed.data.type };

  const ip = getClientIp(request_headers);
  try {
    const allowed = await hitRateLimit(`data_request:${ip}`, DATA_REQUEST_RATE_LIMIT, DATA_REQUEST_RATE_WINDOW_SECONDS);
    if (!allowed) return { status: 'error', reason: 'rate_limited' };

    const id = await saveRequest(parsed.data);
    await applyUnsubscribe(parsed.data).catch(() => undefined);
    await notifyOperator(id, parsed.data);
    return { status: 'success', type: parsed.data.type };
  } catch (error) {
    // В журнал — только тип запроса и маска email, без текста запроса.
    const message = error instanceof Error ? error.message : 'неизвестная ошибка';
    await logLegalError(`data_request: ${message}`, { type: parsed.data.type, email: maskEmail(parsed.data.email) });
    return { status: 'error', reason: 'server' };
  }
}
