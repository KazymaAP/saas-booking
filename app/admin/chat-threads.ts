// app/admin/chat-threads.ts — чистая логика группировки переписки (без 'use server').
// Вынесена отдельно, чтобы её можно было покрыть тестами: серверные экшены тестировать
// неудобно, а вся арифметика «кто кому когда писал» живёт именно здесь.
export type RawMessage = {
  id: number | string;
  direction: string | null;
  chat_id: string | null;
  business_id: string | null;
  text: string | null;
  created_at: string | null;
};

export type MessageGroup = {
  last: RawMessage;
  count: number;
  chatId: string | null;
  businessId: string | null;
};

/** Ключ диалога: привязанный бизнес важнее чата — переписка не должна разъезжаться при перепривязке. */
export function threadKey(row: { business_id: string | null; chat_id: string | null }): string | null {
  if (row.business_id) return `b:${row.business_id}`;
  if (row.chat_id) return `c:${row.chat_id}`;
  return null;
}

/** Превью последнего сообщения: одна строка, не длиннее 120 символов. */
export function shortText(text: string | null): string {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > 120 ? `${value.slice(0, 119)}…` : value;
}

/**
 * Группирует сообщения (ожидаются отсортированными по убыванию времени) в диалоги.
 * Первое встреченное сообщение группы — последнее в диалоге.
 */
export function groupMessages(rows: RawMessage[]): Map<string, MessageGroup> {
  const grouped = new Map<string, MessageGroup>();
  for (const row of rows) {
    const key = threadKey(row);
    if (!key) continue;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { last: row, count: 1, chatId: row.chat_id, businessId: row.business_id });
  }
  return grouped;
}

/** Порядок диалогов: свежие сверху. */
export function sortGroups<T extends { lastAt: string }>(threads: T[]): T[] {
  return threads.slice().sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
}
