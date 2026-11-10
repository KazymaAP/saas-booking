'use client';
// _lib/busy.ts — набор «занятых» строк списка (идёт запрос по этой строке).
// Раньше был один busyId на список: при двух параллельных действиях ответ по первой строке
// снимал блокировку со второй, хотя её запрос ещё шёл, — второй клик уходил на сервер повторно.
import { useCallback, useMemo, useState } from 'react';

// Чистые функции — для тестов и чтобы updater setState не создавал новый Set без изменений.
export function withBusy(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (set.has(id)) return set;
  const next = new Set(set);
  next.add(id);
  return next;
}

export function withoutBusy(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}

export type BusyIds = { isBusy: (id: string) => boolean; start: (id: string) => void; stop: (id: string) => void };

export function useBusyIds(): BusyIds {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const start = useCallback((id: string) => setIds((s) => withBusy(s, id)), []);
  const stop = useCallback((id: string) => setIds((s) => withoutBusy(s, id)), []);
  const isBusy = useCallback((id: string) => ids.has(id), [ids]);
  // Объект стабилен между рендерами, пока не изменился набор: его можно класть в deps useCallback.
  return useMemo(() => ({ isBusy, start, stop }), [isBusy, start, stop]);
}
