// app/panel/(protected)/_lib/business-filters.ts — разбор и проверка фильтров списка бизнесов.
// Общий для страницы /panel/businesses и экспорта /api/export/businesses: один и тот же набор строк
// на экране и в файле. Всё, что не прошло проверку, просто игнорируется (фильтр не применяется).
import type { BusinessStatus } from '@/lib/database.types';
import { isBusinessStatus } from './statuses';
import { one, pageNumber, searchTerm, uuidParam, type Params } from './url';

export type BusinessFilters = { status: BusinessStatus | ''; city: string; vertical: string; q: string; page: number };

export function readBusinessFilters(sp: Params): BusinessFilters {
  const status = one(sp.status);
  return {
    status: isBusinessStatus(status) ? status : '',
    city: searchTerm(sp.city, 80),
    vertical: uuidParam(sp.vertical),
    q: searchTerm(sp.q),
    page: pageNumber(sp.page),
  };
}

// URLSearchParams → Params (для route handlers, где нет готового searchParams-объекта).
export function paramsFromUrl(url: URL): Params {
  const out: Params = {};
  url.searchParams.forEach((v, k) => {
    if (!(k in out)) out[k] = v;
  });
  return out;
}

// Минимальный интерфейс построителя запроса PostgREST, нужный фильтрам (совместим с PostgrestFilterBuilder).
type Filterable<Q> = { eq: (column: string, value: string) => Q; neq: (column: string, value: string) => Q; ilike: (column: string, pattern: string) => Q };

// Фильтры → условия запроса. Один код для списка и экспорта: на экране и в файле одна и та же выборка.
// Индексы: businesses(status, city), businesses(vertical_template_id).
export function applyBusinessFilters<Q extends Filterable<Q>>(q: Q, f: Omit<BusinessFilters, 'page'>): Q {
  // Без фильтра статуса скрываются удалённые (status='deleted' — запись ждёт hard delete, ТЗ §15.4).
  let out = f.status ? q.eq('status', f.status) : q.neq('status', 'deleted');
  if (f.city) out = out.ilike('city', f.city);
  if (f.vertical) out = out.eq('vertical_template_id', f.vertical);
  if (f.q) out = out.ilike('name', `%${f.q}%`);
  return out;
}
