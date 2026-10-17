// app/panel/(protected)/clients/schema.ts — схемы и чистая логика раздела «Клиенты» (ТЗ §13.5, §14.2).
// Отдельный модуль: из 'use server' можно экспортировать только async-функции, а это нужно и клиенту
// (предсказание optimistic-изменений), и тестам.
import { z } from 'zod';

export const DAY_MS = 86_400_000;
// ТЗ §14.2 п.7: «Оплачено» → subscription_until + 30 дней. §14.4: поддержка после передачи кода — 30 дней.
export const PERIOD_DAYS = 30;
export const DEFAULT_INITIAL = 5000;
export const DEFAULT_MONTHLY = 1000;

export const CLIENT_OPS = ['paid', 'extend', 'disable', 'remind', 'refuse', 'transfer'] as const;
export type ClientOp = (typeof CLIENT_OPS)[number];
export const clientOpSchema = z.enum(CLIENT_OPS);

// Кандидаты в клиенты: получили прототип или письмо. Остальные статусы в разделе не показываются.
export const CANDIDATE_STATUSES = ['preview_ready', 'approved', 'sent', 'viewed', 'replied', 'pending_deletion'] as const;
// Из этих статусов «Отметить оплату» запрещена: клиент уже есть, код передан, запись удалена.
export const NOT_PAYABLE = ['client', 'transferred_out', 'deleted'] as const;

export const accessSchema = z.object({
  id: z.string().uuid('Бизнес не найден'),
  email: z.string().trim().toLowerCase().min(1, 'Укажите email владельца').max(200, 'Слишком длинный email').email('Некорректный email'),
});

// Строка таблицы клиентов: без ПД (вместо списка email — только признак, что он есть).
export type ClientRow = {
  id: string;
  name: string;
  status: string;
  paid_initial_at: string | null;
  plan_type: string | null;
  subscription_price: number | null;
  subscription_active: boolean;
  subscription_until: string | null;
  custom_domain: string | null;
  code_transferred_at: string | null;
  support_until: string | null;
  has_email: boolean;
};

export type ClientPatch = Partial<Omit<ClientRow, 'id' | 'name' | 'has_email'>> & { removed?: boolean };

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Продление: от текущей даты окончания, если она в будущем, иначе от сегодня (оплата после просрочки).
export function extendFrom(until: string | null, now: Date = new Date(), days = PERIOD_DAYS): string {
  const current = until ? new Date(`${until}T00:00:00Z`) : null;
  const base = current && current.getTime() > now.getTime() ? current : now;
  return isoDate(new Date(base.getTime() + days * DAY_MS));
}

// Что изменится в строке после действия. Тот же расчёт на клиенте (optimistic) и на сервере (UPDATE),
// поэтому после ответа сервера значения в таблице не «прыгают».
export function predictPatch(op: ClientOp, row: Pick<ClientRow, 'subscription_until'>, now: Date = new Date(), monthly = DEFAULT_MONTHLY): ClientPatch {
  switch (op) {
    case 'paid':
      return { status: 'client', paid_initial_at: now.toISOString(), subscription_active: true, subscription_until: isoDate(new Date(now.getTime() + PERIOD_DAYS * DAY_MS)), plan_type: 'basic', subscription_price: monthly };
    case 'extend':
      return { subscription_until: extendFrom(row.subscription_until, now), subscription_active: true };
    case 'disable':
      return { subscription_active: false };
    case 'refuse':
      return { status: 'refused', removed: true };
    case 'transfer':
      return { code_transferred_at: now.toISOString(), support_until: isoDate(new Date(now.getTime() + PERIOD_DAYS * DAY_MS)) };
    case 'remind':
      return {};
  }
}

// Какие кнопки доступны строке (ТЗ §13.5). Один источник правды для таблицы и для проверки на сервере.
export function allowedOps(row: Pick<ClientRow, 'status' | 'subscription_active' | 'has_email' | 'code_transferred_at'>): ClientOp[] {
  if (row.status !== 'client') return (NOT_PAYABLE as readonly string[]).includes(row.status) ? [] : ['paid', 'refuse'];
  const out: ClientOp[] = ['extend'];
  if (row.subscription_active) out.push('disable');
  if (row.has_email) out.push('remind');
  if (!row.code_transferred_at) out.push('transfer');
  return out;
}

export const OP_LABEL: Record<ClientOp, string> = {
  paid: 'Отметить оплату',
  extend: 'Продлить на 30 дней',
  disable: 'Отключить',
  remind: 'Напомнить',
  refuse: 'Отказ',
  transfer: 'Передать код',
};

// Подтверждение для необратимых или заметных клиенту действий (design-spec §6).
export const OP_CONFIRM: Partial<Record<ClientOp, string>> = {
  disable: 'Сайт клиента покажет заглушку, пока подписку не продлят.',
  refuse: 'Бизнес уйдёт из списка, через 30 дней — в архив.',
  transfer: 'Сайт будет работать 30 дней поддержки, затем — заглушка «Сервис перенесён».',
};
