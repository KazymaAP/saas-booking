// app/panel/(protected)/verticals/page.tsx — ниши: список, правка, создание, предпросмотр, JSON (ТЗ §5.4, §14).
import { adminClient } from '@/lib/supabase';
import { saveVertical, importVerticals } from './actions';

export const dynamic = 'force-dynamic';

export default async function VerticalsPage({ searchParams }: { searchParams: { edit?: string } }) {
  const { data } = await adminClient()
    .from('vertical_templates').select('*').order('name');
  const editing = (data ?? []).find((v) => v.id === searchParams.edit);

  return (
    <div className="grid gap-8">
      <h1 className="text-[24px] font-semibold">Ниши</h1>
      <p className="text-[14px] text-[#666666]">
        <a className="underline" href="/api/verticals">Скачать все ниши (JSON)</a>
      </p>

      <section>
        <h2 className="text-[18px] font-semibold">{editing ? `Правка: ${editing.name}` : 'Новая ниша'}</h2>
        <form action={saveVertical} className="mt-3 grid max-w-[640px] gap-2 text-[14px]">
          <input type="hidden" name="id" value={editing?.id ?? ''} />
          <div className="grid grid-cols-2 gap-2">
            <input name="name" placeholder="Название" defaultValue={editing?.name ?? ''} className="input" required />
            <input name="slug" placeholder="slug, например tire-service" defaultValue={editing?.slug ?? ''} className="input" required />
            <input name="url_prefix" placeholder="префикс URL, например t" defaultValue={editing?.url_prefix ?? ''} className="input" required />
            <input name="icon" placeholder="иконка" defaultValue={editing?.icon ?? ''} className="input" />
          </div>
          <input name="description" placeholder="Описание" defaultValue={editing?.description ?? ''} className="input" />
          <textarea name="default_services" placeholder='[{"name":"Стрижка","price":1500,"duration":60}]' defaultValue={editing ? JSON.stringify(editing.default_services, null, 2) : ''} className="input h-[160px] py-2 font-mono text-[12px]" />
          <textarea name="default_texts" placeholder='{"hero_title":"{name}","cta":"Записаться"}' defaultValue={editing ? JSON.stringify(editing.default_texts, null, 2) : ''} className="input h-[120px] py-2 font-mono text-[12px]" />
          <label className="flex items-center gap-2"><input type="checkbox" name="is_active" value="1" defaultChecked={editing?.is_active ?? true} /> Активна</label>
          <button className="btn-primary w-fit" type="submit">{editing ? 'Сохранить' : 'Создать'}</button>
        </form>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Список</h2>
        <ul className="mt-3 grid gap-3 text-[14px]">
          {(data ?? []).map((v) => (
            <li key={v.id} className="rounded-md border border-[#e5e5e5] p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span>{v.icon ?? ''} {v.name} <span className="text-[#666666]">/{v.url_prefix} · {v.slug}{v.is_active ? '' : ' · выключена'}</span></span>
                <a className="underline" href={`?edit=${v.id}`}>Править</a>
              </div>
              <ul className="mt-2 list-disc pl-5 text-[#666666]">
                {(v.default_services as { name: string; price: number; duration: number }[]).map((s) => (
                  <li key={s.name}>{s.name} — {Number(s.price).toLocaleString('ru-RU')} ₽, {s.duration} мин</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Импорт JSON</h2>
        <form action={importVerticals} className="mt-3 grid max-w-[640px] gap-2 text-[14px]">
          <textarea name="json" placeholder="Массив ниш в формате из скачанного файла" className="input h-[160px] py-2 font-mono text-[12px]" />
          <button className="btn-primary w-fit" type="submit">Импортировать</button>
        </form>
      </section>
    </div>
  );
}
