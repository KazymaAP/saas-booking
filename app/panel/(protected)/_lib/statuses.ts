// app/panel/(protected)/_lib/statuses.ts — статусы бизнеса и их подписи (ТЗ §3.6). Общие для всех разделов зоны 7.
import type { BusinessStatus } from '@/lib/database.types';

export const BUSINESS_STATUSES = [
  'new', 'no_contact', 'in_progress', 'preview_ready', 'approved', 'sent', 'viewed', 'replied',
  'client', 'refused', 'archived', 'transferred_out', 'pending_deletion',
] as const satisfies readonly BusinessStatus[];

// Статусы, которые можно выставить массово из списка. client — только через оплату в /panel/clients.
export const MASS_STATUSES = ['new', 'in_progress', 'preview_ready', 'approved', 'refused', 'no_contact', 'archived'] as const satisfies readonly BusinessStatus[];
export type MassStatus = (typeof MASS_STATUSES)[number];

export const STATUS_LABEL: Record<BusinessStatus, string> = {
  new: 'Новый',
  no_contact: 'Нет контакта',
  in_progress: 'В работе',
  preview_ready: 'Прототип готов',
  approved: 'Одобрен',
  sent: 'Письмо отправлено',
  viewed: 'Открыл письмо',
  replied: 'Ответил',
  client: 'Клиент',
  refused: 'Отказ',
  archived: 'Архив',
  transferred_out: 'Код передан',
  pending_deletion: 'К удалению',
  deleted: 'Удалён',
};

// Тон бейджа: цвет не единственный признак — рядом всегда текст (design-spec §9).
export type Tone = 'green' | 'red' | 'yellow' | 'gray';
export const STATUS_TONE: Record<BusinessStatus, Tone> = {
  new: 'gray', no_contact: 'gray', in_progress: 'yellow', preview_ready: 'yellow', approved: 'green',
  sent: 'yellow', viewed: 'yellow', replied: 'green', client: 'green', refused: 'red',
  archived: 'gray', transferred_out: 'gray', pending_deletion: 'red', deleted: 'red',
};

export function isBusinessStatus(s: unknown): s is BusinessStatus {
  return typeof s === 'string' && s in STATUS_LABEL;
}

export function statusLabel(s: string): string {
  return isBusinessStatus(s) ? STATUS_LABEL[s] : s;
}
