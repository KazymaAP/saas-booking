// Фильтры шага 1 воронки (ТЗ §13.2: city, vertical_template_id, has_email). GET-форма без JS:
// значения в URL, страница сбрасывается на первую, выбранный шаблон шага 4 сохраняется.
import Link from 'next/link';
import { one, type Params } from '@/главная/lib/url';

type Props = { params: Params; city: string; vertical: string; email: boolean; verticals: { id: string; name: string }[] };

export function FunnelFilters({ params, city, vertical, email, verticals }: Props) {
  const tpl = one(params.tpl);
  const active = Boolean(city || vertical || email);
  return (
    <form className="mb-3 flex flex-wrap items-end gap-2 text-[14px]" method="get" aria-label="Фильтр новых бизнесов">
      {tpl && <input type="hidden" name="tpl" value={tpl} />}
      <label className="grid gap-1" htmlFor="funnel-city">
        Город
        <input id="funnel-city" name="city" defaultValue={city} className="input max-w-[200px]" autoComplete="address-level2" />
      </label>
      <label className="grid gap-1" htmlFor="funnel-vertical">
        Ниша
        <select id="funnel-vertical" name="vertical" defaultValue={vertical} className="input max-w-[220px]">
          <option value="">Все ниши</option>
          {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <label className="inline-flex min-h-[44px] items-center gap-2" htmlFor="funnel-email">
        <input id="funnel-email" type="checkbox" name="email" value="1" defaultChecked={email} className="h-5 w-5" />
        только с email
      </label>
      <button className="btn-primary" type="submit">Фильтровать</button>
      {active && <Link className="min-h-[44px] leading-[44px] underline" href={tpl ? `?tpl=${tpl}` : '?'}>Сбросить</Link>}
    </form>
  );
}
