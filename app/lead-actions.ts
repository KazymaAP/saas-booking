// app/lead-actions.ts — приём заявки с лендинга («хочу сайт»).
// Порядок: CSRF (Origin) → zod → ловушка для ботов → лимит 3/24ч/IP → INSERT leads → уведомление.
// Заявка ложится в ту же таблицу leads, что читает раздел «Лиды» в супер-админке,
// поэтому заявка сразу видна в панели — отдельной настройки не требуется.
'use server';
import { headers } from 'next/headers';
import { adminClient } from '@/lib/supabase';
import { hitRateLimit } from '@/lib/rate-limit';
import { notifyAdmin } from '@/lib/admin-notify';
import { sendMail } from '@/lib/notify';
import { LEGAL_EMAIL, getClientIp, getRequisites, isTrustedOrigin, maskEmail } from '@/lib/legal';
import {
  LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS, maskPhone, parseLeadForm, type LeadInput, type LeadState,
} from '@/lib/lead';
import { SITE_URL } from '@/lib/site';

// Журнал ошибок: та же таблица audit_log, что у юридических запросов, но своё действие.
// В payload — только маска телефона, полный номер в логи не попадает.
async function logLeadError(message: string, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      user_id: null,
      action: 'error:lead',
      entity: 'lead',
      entity_id: null,
      payload: { message: message.slice(0, 500), ...payload },
    });
  } catch {
    // Журнал недоступен — пользователь уже получил статус, дальше сделать нечего.
  }
}

// Ошибка БД — исключение наружу: заявку нельзя «потерять» молча (как и запрос субъекта ПД).
async function saveLead(input: LeadInput): Promise<string> {
  const { data, error } = await adminClient()
    .from('leads')
    .insert({
      name: input.name,
      phone: input.phone,
      email: input.email,
      message: input.message,
      source: input.source,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'insert вернул пустой результат');
  return String(data.id);
}

// Отметка «в Telegram ушло»: колонка уже есть в таблице, по ней видно, что заявку не пропустили.
async function markTelegramSent(id: string): Promise<void> {
  try {
    await adminClient().from('leads').update({ telegram_sent_at: new Date().toISOString() }).eq('id', id);
  } catch {
    // Не критично: отметка нужна только для разбора, сама заявка уже сохранена.
  }
}

// Уведомление владельцу: в Telegram — маска телефона (внешний канал), полные контакты — в письме
// и в панели. Сбой уведомления не отменяет заявку: она уже в БД.
async function notifyOperator(id: string, input: LeadInput): Promise<void> {
  const short_id = id.slice(0, 8);
  const summary = [
    `Новая заявка № ${short_id} с сайта.`,
    `Имя: ${input.name}`,
    `Телефон: ${maskPhone(input.phone)}`,
    `Email: ${input.email ? maskEmail(input.email) : 'не указан'}`,
    input.message ? `Задача: ${input.message.slice(0, 200)}` : 'Задача не описана.',
    `Открыть: ${SITE_URL}/admin → «Лиды»`,
  ].join('\n');

  if (await notifyAdmin(summary).catch(() => false)) await markTelegramSent(id);

  const requisites = await getRequisites();
  const to = requisites.email ?? LEGAL_EMAIL;
  if (!to) return;
  const text = [
    `Новая заявка № ${short_id} с ${SITE_URL}`,
    '',
    `Имя: ${input.name}`,
    `Телефон: ${input.phone ?? 'не указан'}`,
    `Email: ${input.email ?? 'не указан'}`,
    input.message ? `Задача:\n${input.message}` : 'Задача не описана.',
    '',
    'Ответить: раздел «Лиды» в панели или напрямую по контактам выше.',
  ].join('\n');
  // Заявка клиента — транзакционное письмо, лимит рассылки не расходует.
  await sendMail({ to, subject: `Заявка с сайта: ${input.name}`, text, transactional: true }).catch(() => false);
}

export async function submitLead(_prev: LeadState, form: FormData): Promise<LeadState> {
  const request_headers = headers();
  if (!isTrustedOrigin(request_headers.get('origin'), request_headers.get('host'))) {
    return { status: 'error', reason: 'forbidden' };
  }

  const parsed = parseLeadForm(form);
  if (!parsed.ok) return { status: 'error', reason: 'validation', fields: parsed.fields };
  // Бот: отвечаем успехом, чтобы не подсказывать, но ничего не сохраняем.
  if (parsed.honeypot) return { status: 'success' };

  const ip = getClientIp(request_headers);
  try {
    const allowed = await hitRateLimit(`lead:${ip}`, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_SECONDS);
    if (!allowed) return { status: 'error', reason: 'rate_limited' };

    const id = await saveLead(parsed.data);
    await notifyOperator(id, parsed.data);
    return { status: 'success' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'неизвестная ошибка';
    await logLeadError(`lead: ${message}`, { phone: maskPhone(parsed.data.phone) });
    return { status: 'error', reason: 'server' };
  }
}
