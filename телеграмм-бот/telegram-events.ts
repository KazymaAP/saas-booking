// lib/telegram-events.ts — форматирование уведомлений Telegram (ТЗ §18.4, §18.5, §10.3–10.6).
// Чистые функции: принимают данные, возвращают HTML-текст. Все пользовательские значения экранируются.
// Отправка — через sendBusinessEvent / sendAdminEvent (lib/telegram.ts).
import { escapeHtml, logTelegramError, sendTelegram, type SendResult } from './telegram';
import { rebindChat, unbindChat } from './telegram-connect';

const DEFAULT_TIMEZONE = 'Europe/Moscow';

/** Эмодзи-префиксы событий (ТЗ §18.4 + события бизнеса §18.5). */
export const EVENT_EMOJI = {
  newBooking: '🎉',
  cancel: '❌',
  reschedule: '🔄',
  reminder24h: '⏰',
  reminder1h: '⏰',
  unconfirmed: '⏳',
  subscriptionReminder: '💳',
  subscriptionExpired: '⛔',
  clientReply: '📩',
  licenseUnverified: '⚠️',
  licenseUnknown: '🚨',
  payment: '💰',
  smtpError: '❌',
  generationFailed: '⚠️',
  restoreTest: '🔄',
  domainsProblem: '⚠️',
  deletionRequest: '🗑',
} as const;

export type TelegramEventKind = keyof typeof EVENT_EMOJI;

export interface BookingInfo {
  businessName: string;
  serviceName?: string | null;
  scheduledAt: string | Date;
  clientName?: string | null;
  clientPhone?: string | null;
  timezone?: string | null;
  /** Ссылка на брони в кабинете — кнопка/строка в сообщении. */
  panelUrl?: string | null;
}

export interface RescheduleInfo extends BookingInfo {
  previousAt?: string | Date | null;
}

/** Дата и время по-русски в часовом поясе бизнеса. Невалидная дата — как есть. */
export function formatWhen(value: string | Date, timezone?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', {
    timeZone: timezone || DEFAULT_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Сумма в рублях с разделителями разрядов. */
export function formatAmount(amount: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(amount).replace(/\u00a0/g, ' ')} ₽`;
}

function header(kind: TelegramEventKind, title: string): string {
  return `${EVENT_EMOJI[kind]} <b>${escapeHtml(title)}</b>`;
}

/** Склейка строк без пустых значений. */
function lines(...parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join('\n');
}

/** Telegram принимает в <a href> только http(s) и tg:; прочее (javascript:, относительные) — 400 или риск. */
const SAFE_LINK = /^(https?:\/\/|tg:\/\/)/i;

/** Ссылка в сообщении. Небезопасный или битый URL — строка пропускается, сообщение всё равно уходит. */
function link(url: string | null | undefined, label: string): string | null {
  if (!url || !SAFE_LINK.test(url.trim())) return null;
  return `<a href="${escapeHtml(url.trim())}">${escapeHtml(label)}</a>`;
}

function bookingBody(info: BookingInfo): string {
  const client = [info.clientName, info.clientPhone].filter(Boolean).join(', ');
  return lines(
    escapeHtml(info.businessName),
    `${escapeHtml(info.serviceName || 'Услуга')}, ${escapeHtml(formatWhen(info.scheduledAt, info.timezone))}`,
    client ? `Клиент: ${escapeHtml(client)}` : null,
    link(info.panelUrl, 'Открыть брони'),
  );
}

// ---------- События бизнеса (ТЗ §18.5) ----------

export function newBooking(info: BookingInfo): string {
  return lines(header('newBooking', 'Новая запись'), bookingBody(info));
}

export function cancel(info: BookingInfo): string {
  return lines(header('cancel', 'Запись отменена клиентом'), bookingBody(info));
}

export function reschedule(info: RescheduleInfo): string {
  const before = info.previousAt ? `Было: ${escapeHtml(formatWhen(info.previousAt, info.timezone))}` : null;
  return lines(header('reschedule', 'Запись перенесена'), bookingBody(info), before);
}

export function reminder24h(info: BookingInfo): string {
  return lines(header('reminder24h', 'Запись завтра'), bookingBody(info));
}

export function reminder1h(info: BookingInfo): string {
  return lines(header('reminder1h', 'Запись через час'), bookingBody(info));
}

export function unconfirmed(info: BookingInfo): string {
  return lines(header('unconfirmed', 'Запись ждёт подтверждения'), bookingBody(info));
}

export interface SubscriptionInfo {
  businessName: string;
  until: string | Date;
  daysLeft: number;
  payUrl?: string | null;
}

/** Склонение «день/дня/дней». */
export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

export function subscriptionReminder(info: SubscriptionInfo): string {
  const until = escapeHtml(formatWhen(info.until).slice(0, 10));
  if (info.daysLeft <= 0) {
    return lines(
      header('subscriptionExpired', 'Подписка истекла'),
      `${escapeHtml(info.businessName)}: подписка закончилась ${until}. Продлите, чтобы сайт продолжал работать.`,
      link(info.payUrl, 'Продлить'),
    );
  }
  return lines(
    header('subscriptionReminder', 'Продление подписки'),
    `${escapeHtml(info.businessName)}: подписка истекает через ${info.daysLeft} ${pluralDays(info.daysLeft)} (${until}).`,
    link(info.payUrl, 'Продлить'),
  );
}

// ---------- События владельца сервиса (ТЗ §18.4) ----------

export interface AdminBookingInfo {
  businessName: string;
  serviceName?: string | null;
  scheduledAt: string | Date;
  clientName?: string | null;
}

/** «🎉 Бронь: {business}, {service}, {date}, {client}» — без телефона клиента (минимум ПД). */
export function adminNewBooking(info: AdminBookingInfo): string {
  const parts = [info.businessName, info.serviceName || 'Услуга', formatWhen(info.scheduledAt), info.clientName || 'клиент'];
  return `${EVENT_EMOJI.newBooking} <b>Бронь</b>: ${parts.map(escapeHtml).join(', ')}`;
}

export function clientReply(info: { businessName: string; email: string }): string {
  return `${EVENT_EMOJI.clientReply} <b>Ответ</b>: ${escapeHtml(info.businessName)}, ${escapeHtml(info.email)}`;
}

export type LicenseAlertKind = 'unverified' | 'unknown';

export function licenseAlert(info: { kind: LicenseAlertKind; licenseId: string; domain: string }): string {
  const kind: TelegramEventKind = info.kind === 'unknown' ? 'licenseUnknown' : 'licenseUnverified';
  const title = info.kind === 'unknown' ? 'Неизвестный запуск' : 'Запуск на другом домене';
  return lines(
    header(kind, title),
    `Домен: <code>${escapeHtml(info.domain)}</code>`,
    `Лицензия: <code>${escapeHtml(info.licenseId)}</code>`,
  );
}

export function payment(info: { businessName: string; amount: number; comment?: string | null }): string {
  const tail = info.comment ? ` (${escapeHtml(info.comment)})` : '';
  return `${EVENT_EMOJI.payment} <b>Оплата</b>: ${escapeHtml(info.businessName)}, ${escapeHtml(formatAmount(info.amount))}${tail}`;
}

export function smtpError(info: { account?: string | null; reason?: string | null } = {}): string {
  return lines(
    header('smtpError', 'SMTP error'),
    info.account ? `Ящик: ${escapeHtml(info.account)}` : null,
    info.reason ? `Причина: ${escapeHtml(info.reason.slice(0, 300))}` : null,
  );
}

export function generationFailed(info: { businessName: string; reason?: string | null }): string {
  return lines(
    `${EVENT_EMOJI.generationFailed} <b>Generation failed</b>: ${escapeHtml(info.businessName)}`,
    info.reason ? `Причина: ${escapeHtml(info.reason.slice(0, 300))}` : null,
  );
}

export function restoreTest(info: { ok: boolean; details?: string | null }): string {
  const result = info.ok ? 'успешно' : 'ошибка';
  return lines(
    `${EVENT_EMOJI.restoreTest} <b>Restore test</b>: ${result}`,
    info.details ? escapeHtml(info.details.slice(0, 300)) : null,
  );
}

export function domainsProblem(domains: string[]): string {
  return `${EVENT_EMOJI.domainsProblem} <b>Домены не проверены</b>: ${domains.map(escapeHtml).join(', ')}`;
}

export function deletionRequest(info: { businessName: string; slug: string; purgeAt: string | Date }): string {
  return `${EVENT_EMOJI.deletionRequest} <b>Запрос на удаление</b>: ${escapeHtml(info.businessName)} (${escapeHtml(info.slug)}), очистка ${escapeHtml(formatWhen(info.purgeAt).slice(0, 10))}`;
}

// ---------- Ответы бизнес-бота (ТЗ §18.3) ----------

export const BOT_REPLIES = {
  startWithoutCode: 'Отправьте код вида <b>BIZ-xxxxx</b> из админки: раздел «Уведомления» → «Получить код».',
  connected: (businessName: string) => `✅ Готово! Уведомления о записях для <b>${escapeHtml(businessName)}</b> будут приходить в этот чат.`,
  codeExpired: '⌛ Код истёк. Создайте новый в кабинете: раздел «Уведомления».',
  codeUsed: 'Код уже использован. Создайте новый в кабинете: раздел «Уведомления».',
  codeNotFound: 'Код не найден. Проверьте его или создайте новый в кабинете.',
  tooManyAttempts: 'Слишком много попыток ввода кода. Попробуйте через 10 минут.',
  unknownCommand: 'Неизвестная команда. Чтобы подключить уведомления, отправьте /start и код из админки.',
  /** Привязанный чат: любое сообщение — обращение к платформе, оно попадает в админку. */
  messageForwarded: 'Сообщение передано команде платформы — ответим здесь же.',
  internalError: 'Не получилось подключить уведомления. Попробуйте ещё раз через минуту.',
} as const;

// ---------- Отправка ----------

/** 403 от Telegram: бот заблокирован в чате или удалён из группы — слать туда бессмысленно. */
const BLOCKED_ERROR = 'http_403';

/**
 * Сообщение бизнесу в его чат. Пустой chat_id — без запроса.
 * Если чат заблокировал бота (403), а my_chat_member не дошёл — отвязываем чат здесь,
 * чтобы следующие события не упирались в ту же ошибку; владелец увидит «не подключён» в кабинете.
 * Группа стала супергруппой — привязка переносится на новый chat_id.
 */
export async function sendBusinessEvent(chatId: string | null | undefined, businessId: string, text: string): Promise<SendResult> {
  const result = await sendTelegram(chatId, text, { role: 'business', businessId });
  if (result.migratedTo && chatId) {
    // Сообщение уже ушло в новый чат; сохраняем его, чтобы не ловить 400 на каждом событии.
    const moved = await rebindChat(chatId, result.migratedTo);
    if (moved > 0) await logTelegramError('chat_migrated_rebound', { businesses: moved });
  }
  if (result.error === BLOCKED_ERROR && chatId) {
    const unbound = await unbindChat(chatId);
    if (unbound > 0) await logTelegramError('chat_blocked_unbound', { businesses: unbound });
  }
  return result;
}

/** Сообщение владельцу сервиса в TELEGRAM_CHAT_ID. */
export function sendAdminEvent(text: string): Promise<SendResult> {
  return sendTelegram(process.env.TELEGRAM_CHAT_ID, text, { role: 'admin', alertOnFailure: false });
}
