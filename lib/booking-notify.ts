// lib/booking-notify.ts — уведомления о событиях брони из зоны бронирования (только сервер).
// Зачем отдельно от lib/notify.ts (зона 8): там BusinessEvent = 'new' | 'cancel' | 'reschedule', события
// 'confirm' нет, и при auto_confirm=true владелец получал «🎉 Новая запись», хотя запись уже подтверждена.
// Здесь текст собирается из уже загруженных данных (без двух лишних SELECT) и экранируется для HTML Telegram,
// а отправка идёт через экспортируемые примитивы sendTelegram/sendMail зоны 8.
import { notifyAdmin } from './admin-notify';
import { notifyBusinessEvent, sendMail, sendTelegram } from './notify';
import { logError } from './log';
import { formatSlotDateTime } from './slots';

export type CreatedEvent = 'new' | 'confirm';

const EVENT_TITLE: Record<CreatedEvent, string> = {
  new: '🎉 Новая запись — нужно подтвердить',
  confirm: '✅ Новая запись (подтверждена автоматически)',
};

export type CreatedNotice = {
  business: { id: string; name: string; telegram_chat_id: string | null; emails: string[] | null };
  serviceName: string;
  startsAt: string;
  timeZone: string;
  clientName: string;
  clientPhone: string;
  autoConfirmed: boolean;
};

// Telegram parse_mode=HTML: пользовательский ввод (имя, услуга) экранируется, иначе «<» ломает сообщение.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Событие для бизнеса по результату создания брони (ТЗ §10.3 п.8, §10.7).
export function createdEvent(autoConfirmed: boolean): CreatedEvent {
  return autoConfirmed ? 'confirm' : 'new';
}

export function createdText(notice: CreatedNotice): string {
  const when = formatSlotDateTime(notice.startsAt, notice.timeZone);
  return [
    EVENT_TITLE[createdEvent(notice.autoConfirmed)],
    notice.business.name,
    `${notice.serviceName}, ${when}`,
    `${notice.clientName} ${notice.clientPhone}`,
  ]
    .map(escapeHtml)
    .join('\n');
}

async function safely(task: Promise<unknown>, what: string): Promise<void> {
  try {
    await task;
  } catch (error) {
    // Уведомление не должно ронять бронь: запись уже создана, ошибку — в журнал без PII.
    await logError('booking', `notify_failed:${what}`, { error: error instanceof Error ? error.message : String(error) });
  }
}

// Бизнесу (Telegram + email) и владельцу сервиса. Все каналы параллельно; ответ API ждёт их,
// потому что на serverless фоновые промисы после ответа обрываются.
export async function notifyCreated(notice: CreatedNotice): Promise<void> {
  const text = createdText(notice);
  const subject = EVENT_TITLE[createdEvent(notice.autoConfirmed)];
  const tasks: Promise<void>[] = [];
  if (notice.business.telegram_chat_id) tasks.push(safely(sendTelegram(notice.business.telegram_chat_id, text), 'telegram'));
  const email = notice.business.emails?.[0];
  if (email) tasks.push(safely(sendMail({ to: email, subject, text }), 'email'));
  // Владельцу сервиса — без персональных данных клиента.
  tasks.push(safely(notifyAdmin(`🎉 Бронь: ${notice.business.name}, ${notice.serviceName}`), 'admin'));
  await Promise.all(tasks);
}

// Отмена и перенос: события есть в зоне 8, используем её функцию.
export function notifyChanged(businessId: string, event: 'cancel' | 'reschedule', bookingId: string): Promise<void> {
  return safely(notifyBusinessEvent(businessId, event, bookingId), event);
}
