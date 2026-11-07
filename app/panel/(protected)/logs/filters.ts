// app/panel/(protected)/logs/filters.ts — разбор фильтров журнала /panel/logs из searchParams (ТЗ §13.7).
// Всё, что не прошло проверку, игнорируется: фильтр не применяется, страница не падает.
import type { LogSource } from '@/lib/log';
import { ACTION_LABEL, ENTITY_LABEL, isLogSource } from '@/главная/lib/audit-labels';
import { one, pageNumber, searchTerm, uuidParam, type Params } from '@/главная/lib/url';

export type LogTab = 'errors' | 'audit';

export type LogFilters = {
  tab: LogTab;
  source: LogSource | '';
  action: string;
  entity: string;
  entity_id: string;
  from: string;
  to: string;
  q: string;
  page: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Дата из <input type="date"> (YYYY-MM-DD) — только существующая календарная дата.
export function dateParam(raw: string | string[] | undefined): string {
  const v = one(raw) ?? '';
  if (!DATE_RE.test(v)) return '';
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : '';
}

export function readLogFilters(sp: Params): LogFilters {
  const tab: LogTab = one(sp.tab) === 'audit' ? 'audit' : 'errors';
  const source = one(sp.source);
  const action = one(sp.action) ?? '';
  const entity = one(sp.entity) ?? '';
  let from = dateParam(sp.from);
  let to = dateParam(sp.to);
  // Перепутанные границы периода — меняем местами, а не показываем пустой список.
  if (from && to && from > to) [from, to] = [to, from];
  return {
    tab,
    // Фильтры чужой вкладки не применяются: источник — только для ошибок, действие/объект — только для аудита.
    source: tab === 'errors' && isLogSource(source) ? source : '',
    action: tab === 'audit' && action in ACTION_LABEL ? action : '',
    entity: tab === 'audit' && entity in ENTITY_LABEL ? entity : '',
    entity_id: tab === 'audit' ? uuidParam(sp.entity_id) : '',
    from,
    to,
    // Поиск по тексту сообщения — только у ошибок (у аудита текста нет, есть действие и объект).
    q: tab === 'errors' ? searchTerm(sp.q) : '',
    page: pageNumber(sp.page),
  };
}

// Граница «по» включительно: конец дня по Москве (журнал показывается в Europe/Moscow, UTC+3 без перехода).
export function periodBounds(f: Pick<LogFilters, 'from' | 'to'>): { gte?: string; lt?: string } {
  const shift = (d: string, days: number) => {
    const t = new Date(`${d}T00:00:00+03:00`);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString();
  };
  return { gte: f.from ? shift(f.from, 0) : undefined, lt: f.to ? shift(f.to, 1) : undefined };
}

export function hasFilters(f: LogFilters): boolean {
  return Boolean(f.source || f.action || f.entity || f.entity_id || f.from || f.to || f.q);
}
