// Пагинация через searchParams: ровно 50 записей на странице, фильтры сохраняются (промт агента 7).
// Next <Link> переходит без полной перезагрузки; сервер отдаёт только нужную страницу (.range()).
import Link from 'next/link';
import { pagerState, withParams, type Params } from '../_lib/url';

type Props = {
  params: Params;
  page: number;
  pageSize: number;
  total: number | null;
  shown: number;
  pageKey?: string;
  label?: string;
  // Явный признак следующей страницы (выборка PAGE + 1 без count) — точнее эвристики shown === pageSize.
  hasNext?: boolean;
};

export function Pager({ params, page, pageSize, total, shown, pageKey = 'page', label = 'Страницы', hasNext }: Props) {
  const st = pagerState({ page, pageSize, total, shown, hasNext });
  if (st.prev === null && st.next === null) return null;
  // Первая страница — без параметра: одна каноническая ссылка вместо ?page=1.
  const href = (n: number) => withParams(params, { [pageKey]: n === 1 ? undefined : n });
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center gap-3 text-[14px]">
      {st.prev !== null ? (
        <Link className="underline" href={href(st.prev)} rel="prev">{st.outOfRange ? `← К странице ${st.prev}` : '← Назад'}</Link>
      ) : (
        <span className="text-[#999999]" aria-hidden="true">← Назад</span>
      )}
      <span aria-current="page">Страница {page}{st.pages !== null ? ` из ${st.pages}` : ''}</span>
      {st.next !== null ? (
        <Link className="underline" href={href(st.next)} rel="next">Дальше →</Link>
      ) : (
        <span className="text-[#999999]" aria-hidden="true">Дальше →</span>
      )}
      {st.outOfRange && <span role="status" className="w-full text-[#666666]">Такой страницы нет — записей меньше.</span>}
    </nav>
  );
}
