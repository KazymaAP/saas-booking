// app/panel/(protected)/_lib/url.ts — сборка ссылок с сохранением фильтров (пагинация через searchParams).
// Раньше пагинация теряла city и q: ссылки «Дальше» собирались вручную только из status.

export type Params = Record<string, string | string[] | undefined>;

// Берёт первое значение параметра (Next отдаёт массив при повторе ключа).
export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Копирует текущие параметры, применяет patch (undefined/'' — удалить ключ) и возвращает "?a=1&b=2".
export function withParams(current: Params, patch: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const val = one(v);
    if (val) sp.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') sp.delete(k);
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '?';
}

export function pageNumber(raw: string | string[] | undefined, max = 10_000): number {
  const n = Number(one(raw));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : 1;
}

// Очистка строки поиска для ilike: убираем спецсимволы шаблона и запятые/скобки (ломают .or() PostgREST).
export function searchTerm(raw: string | string[] | undefined, max = 100): string {
  return (one(raw) ?? '').replace(/[%_,()\\*]/g, ' ').trim().slice(0, max);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UUID из searchParams или '' (невалидное значение = фильтр не применяется).
export function uuidParam(raw: string | string[] | undefined): string {
  const v = one(raw) ?? '';
  return UUID_RE.test(v) ? v : '';
}

export type PagerState = { pages: number | null; prev: number | null; next: number | null; outOfRange: boolean };

// Соседние страницы для Pager. Номер за пределами (?page=99 при 3 страницах, или записи удалили) —
// «Назад» ведёт сразу на последнюю существующую страницу, а не на такую же пустую page − 1.
export function pagerState(o: { page: number; pageSize: number; total: number | null; shown: number; hasNext?: boolean }): PagerState {
  const pages = o.total !== null ? Math.max(1, Math.ceil(o.total / o.pageSize)) : null;
  const outOfRange = pages !== null && o.page > pages;
  const hasNext = o.hasNext ?? (pages !== null ? o.page < pages : o.shown === o.pageSize);
  const prev = o.page > 1 ? (outOfRange && pages !== null ? pages : o.page - 1) : null;
  return { pages, prev, next: hasNext && !outOfRange ? o.page + 1 : null, outOfRange };
}
