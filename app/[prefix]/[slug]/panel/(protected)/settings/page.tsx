// app/[prefix]/[slug]/panel/(protected)/settings/page.tsx — настройки и тексты (ТЗ §5.3, §47).
import { currentOwner } from '@/lib/owner-session';
import { formatIntervals } from '@/lib/hours';
import { saveSettings } from './actions';
import type { WorkingHours } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

const DAYS: [string, string][] = [['mon', 'Понедельник'], ['tue', 'Вторник'], ['wed', 'Среда'], ['thu', 'Четверг'], ['fri', 'Пятница'], ['sat', 'Суббота'], ['sun', 'Воскресенье']];

export default async function SettingsPage({ params, searchParams }: { params: { prefix: string; slug: string }; searchParams: { saved?: string; error?: string } }) {
  const b = (await currentOwner(params.slug))!.business;
  const hours = (b.working_hours ?? {}) as WorkingHours;
  const save = saveSettings.bind(null, params.prefix, params.slug);

  return (
    <div className="grid gap-6">
      <h1 className="text-[24px] font-semibold">Настройки</h1>
      {searchParams.saved && <p className="rounded-md bg-[#f5f5f5] p-3 text-[14px]">Сохранено</p>}
      {searchParams.error && <p role="alert" className="text-[#dc2626]">{searchParams.error}</p>}

      <form action={save} className="grid max-w-[560px] gap-4">
        <label className="grid gap-1 text-[14px]">Название
          <input name="name" defaultValue={b.name} className="input" required minLength={2} />
        </label>
        <label className="grid gap-1 text-[14px]">Описание
          <textarea name="description" defaultValue={b.description ?? ''} className="input h-auto py-2" />
        </label>
        <label className="grid gap-1 text-[14px]">Город
          <input name="city" defaultValue={b.city ?? ''} className="input" />
        </label>
        <label className="grid gap-1 text-[14px]">Адрес
          <input name="address" defaultValue={b.address ?? ''} className="input" />
        </label>
        <label className="grid gap-1 text-[14px]">Телефоны (через запятую)
          <input name="phones" defaultValue={b.phones?.join(', ') ?? ''} className="input" />
        </label>
        <label className="grid gap-1 text-[14px]">Email (через запятую)
          <input name="emails" defaultValue={b.emails?.join(', ') ?? ''} className="input" />
        </label>
        <label className="grid gap-1 text-[14px]">Цвет сайта
          <input name="brand_color" type="color" defaultValue={b.brand_color} className="h-11 w-24 rounded-md border border-[#e5e5e5]" />
        </label>

        <fieldset className="grid gap-2">
          <legend className="text-[14px] font-medium">Рабочее время (формат 09:00-13:00, 14:00-21:00; пусто = выходной)</legend>
          {DAYS.map(([key, label]) => (
            <label key={key} className="grid grid-cols-[160px_1fr] items-center gap-2 text-[14px]">
              {label}
              <input name={`hours_${key}`} defaultValue={formatIntervals(hours[key as keyof WorkingHours])} className="input" />
            </label>
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-3 text-[14px]">
          <label className="grid gap-1">Шаг слота, мин
            <select name="slot_step_minutes" defaultValue={b.slot_step_minutes} className="input">
              {[30, 60, 90, 120].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="grid gap-1">Отмена за, ч
            <input name="cancel_hours_before" type="number" min={0} max={72} defaultValue={b.cancel_hours_before} className="input" />
          </label>
          <label className="grid gap-1">Минимум до записи, ч
            <input name="min_hours_before" type="number" min={0} max={72} defaultValue={b.min_hours_before} className="input" />
          </label>
          <label className="grid gap-1">Записи вперёд, дней
            <input name="max_days_ahead" type="number" min={1} max={365} defaultValue={b.max_days_ahead} className="input" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" name="auto_confirm" value="1" defaultChecked={b.auto_confirm} /> Подтверждать записи автоматически
        </label>

        <button type="submit" className="btn-primary">Сохранить</button>
      </form>
    </div>
  );
}
