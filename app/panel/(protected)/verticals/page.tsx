// app/panel/(protected)/verticals/page.tsx — ниши (ТЗ §4.5, §13.1): список, правка, создание, импорт/экспорт JSON.
// Server Component. Правка — через ?edit=<id> (ссылка, без JS работает тоже), число бизнесов по нише — один запрос.
import Link from 'next/link';
import { adminClient } from '@/lib/supabase';
import { countOf } from '@/главная/lib/db';
import type { VerticalTemplate } from '@/lib/database.types';
import { uuidParam, type Params } from '@/главная/lib/url';
import { JSON_FIELDS, type JsonField } from './schema';
import { ActiveToggle, ImportVerticalsForm, VerticalForm, type VerticalView } from './VerticalForms';

export const dynamic = 'force-dynamic';

const PRETTY = 2;

function toView(v: VerticalTemplate): VerticalView {
  const json = {} as Record<JsonField, string>;
  for (const f of JSON_FIELDS) json[f] = JSON.stringify(v[f] ?? null, null, PRETTY);
  return { id: v.id, name: v.name, slug: v.slug, url_prefix: v.url_prefix, icon: v.icon, description: v.description, is_active: v.is_active, show_demo_mode: v.show_demo_mode, json };
}

async function load() {
  const db = adminClient();
  const list = await db.from('vertical_templates').select('*').order('name').returns<VerticalTemplate[]>();
  const verticals = list.data ?? [];
  // Число бизнесов по нише: head-count (без строк) параллельно. Выборка всех vertical_template_id упёрлась бы
  // в лимит PostgREST (1000 строк) и дала бы неверные числа. Ниш — единицы, запросы идут одновременно.
  const counts = await Promise.all(
    verticals.map((v) => db.from('businesses').select('id', { count: 'exact', head: true }).eq('vertical_template_id', v.id).neq('status', 'deleted')),
  );
  // Сбой подсчёта — исключение: «бизнесов: 0» подтолкнул бы отключить нишу, которой пользуются.
  const usage = new Map(verticals.map((v, i) => [v.id, counts[i] ? countOf(counts[i]) : 0]));
  return { verticals, counts: usage, failed: Boolean(list.error) };
}

export default async function VerticalsPage({ searchParams }: { searchParams: Params }) {
  const editId = uuidParam(searchParams.edit);
  const { verticals, counts, failed } = await load();
  const editing = verticals.find((v) => v.id === editId) ?? null;

  return (
    <div className="grid gap-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0">Ниши</h1>
        <a className="underline" href="/api/verticals" download>Скачать все ниши (JSON)</a>
      </header>
      {failed && <p role="alert" className="text-[14px] text-[#dc2626]">Не удалось загрузить ниши. Обновите страницу.</p>}

      <section aria-labelledby="vert-list">
        <h2 id="vert-list">{failed ? 'Список' : `Список (${verticals.length})`}</h2>
        {/* Сбой: «Ниш пока нет. Создайте первую» подтолкнуло бы создать или импортировать дубли существующих ниш. */}
        {failed ? null : verticals.length === 0 ? (
          <p className="text-[14px] text-[#666666]">Ниш пока нет. Создайте первую ниже или импортируйте JSON.</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 text-[14px]">
            {verticals.map((v) => (
              <VerticalItem key={v.id} v={v} used={counts.get(v.id) ?? 0} current={v.id === editId} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="vert-form">
        <h2 id="vert-form">{editing ? `Правка: ${editing.name}` : 'Новая ниша'}</h2>
        {/* key: при переходе к другой нише форма и JSON-редакторы пересоздаются с её значениями. */}
        <VerticalForm key={editing?.id ?? 'new'} v={editing ? toView(editing) : null} />
      </section>

      <section aria-labelledby="vert-import">
        <h2 id="vert-import">Импорт JSON</h2>
        <ImportVerticalsForm />
      </section>
    </div>
  );
}

function VerticalItem({ v, used, current }: { v: VerticalTemplate; used: number; current: boolean }) {
  const services = Array.isArray(v.default_services) ? v.default_services : [];
  return (
    <li className={`rounded-[12px] border bg-white p-3 ${current ? 'border-[#111111]' : 'border-[#e5e5e5]'}`} aria-current={current ? 'true' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span aria-hidden="true">{v.icon ? `${v.icon} ` : ''}</span>
          <strong>{v.name}</strong>{' '}
          <span className="text-[#666666]">/{v.url_prefix} · {v.slug} · бизнесов: {used}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <ActiveToggle id={v.id} name={v.name} active={v.is_active} />
          <Link className="underline" href={`?edit=${v.id}#vert-form`} aria-label={`Править нишу «${v.name}»`}>Править</Link>
        </span>
      </div>
      {services.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-[#666666]">
          {services.slice(0, 8).map((s, i) => (
            <li key={`${s.name}-${i}`}>{s.name} — {Number(s.price).toLocaleString('ru-RU')} ₽, {s.duration} мин</li>
          ))}
          {services.length > 8 && <li>и ещё {services.length - 8}</li>}
        </ul>
      )}
    </li>
  );
}
