// bookings/status.ts — переходы статусов брони (ТЗ §10.7, DECISIONS.md: new/confirmed/cancelled/done/no_show).
// Чистый модуль: одни и те же правила у кнопок (какие показывать), optimistic-состояния и server action.
import type { BookingStatus } from '@/lib/database.types';

// Кортеж as const: из него выводится тип и строится z.enum без приведений.
export const BOOKING_ACTIONS = ['confirm', 'done', 'no_show', 'cancel'] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

export const TRANSITIONS: Record<BookingAction, { from: readonly BookingStatus[]; to: BookingStatus }> = {
  confirm: { from: ['new'], to: 'confirmed' },
  done: { from: ['new', 'confirmed'], to: 'done' },
  no_show: { from: ['new', 'confirmed'], to: 'no_show' },
  cancel: { from: ['new', 'confirmed'], to: 'cancelled' },
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  new: 'Новая',
  confirmed: 'Подтверждена',
  cancelled: 'Отменена',
  done: 'Выполнена',
  no_show: 'Не пришёл',
};

export const ACTION_LABEL: Record<BookingAction, string> = {
  confirm: 'Подтвердить',
  done: 'Выполнено',
  no_show: 'Не пришёл',
  cancel: 'Отменить',
};

// Сообщение в toast и aria-live после успешной смены статуса.
export const ACTION_DONE: Record<BookingAction, string> = {
  confirm: 'Запись подтверждена',
  done: 'Отмечено: выполнено',
  no_show: 'Отмечено: не пришёл',
  cancel: 'Запись отменена',
};

export function isBookingAction(v: unknown): v is BookingAction {
  return BOOKING_ACTIONS.some((a) => a === v);
}

export function canApply(action: BookingAction, status: BookingStatus): boolean {
  return TRANSITIONS[action].from.includes(status);
}

// Отметки визита («Выполнено», «Не пришёл») имеют смысл только после начала записи.
// До начала на карточке остаются «Подтвердить» и «Отменить» — меньше кнопок под пальцем, нет случайной «неявки».
// Сервер это не запрещает (владелец может отметить заранее через «Все»), это правило интерфейса.
export const VISIT_ACTIONS: readonly BookingAction[] = ['done', 'no_show'];

export function availableActions(status: BookingStatus, started = true): BookingAction[] {
  return BOOKING_ACTIONS.filter((a) => canApply(a, status) && (started || !VISIT_ACTIONS.includes(a)));
}

// Активные брони — ещё могут измениться; остальные статусы финальные.
export function isActiveStatus(status: BookingStatus): boolean {
  return status === 'new' || status === 'confirmed';
}
