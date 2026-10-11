// app/[prefix]/[slug]/panel/(protected)/services/page.tsx — услуги владельца (ТЗ §5.3).
import { adminClient } from '@/lib/supabase';
import { currentOwner } from '@/lib/owner-session';
import { addService, updateService, toggleService } from './actions';

export const dynamic = 'force-dynamic';

export default async function ServicesPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = (await currentOwner(params.slug))!;
  const { data } = await adminClient()
    .from('services').select('id, name, description, price, duration_minutes, is_active')
    .eq('business_id', access.business.id).order('sort_order');
  const { prefix, slug } = params;

  return (
    <div className="grid gap-8">
      <h1 className="text-[24px] font-semibold">Услуги</h1>

      <section>
        <h2 className="text-[18px] font-semibold">Добавить услугу</h2>
        <form action={addService.bind(null, prefix, slug)} className="mt-3 grid max-w-[520px] gap-2">
          <input name="name" className="input" placeholder="Название" required minLength={2} />
          <div className="grid grid-cols-2 gap-2">
            <input name="price" type="number" className="input" placeholder="Цена, ₽" required min={0} />
            <input name="duration_minutes" type="number" className="input" placeholder="Минут" required min={5} />
          </div>
          <textarea name="description" className="input h-auto py-2" placeholder="Описание (необязательно)" />
          <button className="btn-primary" type="submit">Добавить</button>
        </form>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Список</h2>
        <ul className="mt-3 grid gap-4">
          {(data ?? []).map((s) => (
            <li key={s.id} className={`rounded-md border border-[#e5e5e5] p-4 ${s.is_active ? '' : 'opacity-60'}`}>
              <form action={updateService.bind(null, prefix, slug)} className="grid max-w-[520px] gap-2">
                <input type="hidden" name="id" value={s.id} />
                <input name="name" defaultValue={s.name} className="input" required minLength={2} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="price" type="number" defaultValue={s.price} className="input" required min={0} />
                  <input name="duration_minutes" type="number" defaultValue={s.duration_minutes} className="input" required min={5} />
                </div>
                <textarea name="description" defaultValue={s.description ?? ''} className="input h-auto py-2" />
                <div className="flex gap-2">
                  <button className="h-9 rounded-md border border-[#e5e5e5] px-3" type="submit">Сохранить</button>
                </div>
              </form>
              <form action={toggleService.bind(null, prefix, slug)} className="mt-2">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="active" value={s.is_active ? '0' : '1'} />
                <button className="text-[14px] underline" type="submit">{s.is_active ? 'Скрыть услугу' : 'Показать услугу'}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
