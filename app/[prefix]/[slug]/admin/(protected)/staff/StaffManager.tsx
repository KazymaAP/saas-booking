'use client';
// staff/StaffManager.tsx — карточки сотрудников: добавление, правка на месте, скрытие, удаление.
// Это витрина на сайте, а не учётные записи: доступ сотрудника к кабинету настраивается в «Команде».
import { useCallback, useState, useTransition } from 'react';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { addStaff, deleteStaff, setStaffActive, updateStaff, STAFF_LIMITS, type StaffFormValues, type StaffRow } from './actions';

const EMPTY: StaffFormValues = { name: '', position: '', experience_years: '', photo_url: '', description: '' };

function toForm(row: StaffRow): StaffFormValues {
  return {
    name: row.name,
    position: row.position ?? '',
    experience_years: row.experience_years === null ? '' : String(row.experience_years),
    photo_url: row.photo_url ?? '',
    description: row.description ?? '',
  };
}

export function StaffManager({ slug, rows, canEdit }: { slug: string; rows: StaffRow[]; canEdit: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();
  const onAdded = useCallback((row: StaffRow) => toast.success(`Добавлен сотрудник: ${row.name}`), [toast]);

  const active = rows.filter((r) => r.is_active);
  const hidden = rows.filter((r) => !r.is_active);

  return (
    <div className="grid gap-8">
      {canEdit && (
        <section className="rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 sm:p-5">
          <h2>Добавить сотрудника</h2>
          <div className="max-w-[560px]">
            <StaffForm defaults={EMPTY} submitLabel="Добавить" onSubmit={(values) => addStaff(slug, values)} onDone={onAdded} resetOnDone />
          </div>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="!mb-0">На сайте <span className="font-normal text-[#595959]">({active.length})</span></h2>
        {active.length === 0 ? (
          <p className="!mb-0 rounded-xl border border-dashed border-[#d4d4d4] bg-[var(--surface)] p-6 text-center text-[14px] text-[#595959]">
            Сотрудников пока нет. Блок «Команда» появится на сайте, как только добавите первого.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {active.map((row) => (
              <StaffCard key={row.id} slug={slug} row={row} canEdit={canEdit} editing={editingId === row.id} onEdit={setEditingId} onStopEdit={() => setEditingId(null)} />
            ))}
          </ul>
        )}
      </section>

      {hidden.length > 0 && (
        <section className="grid gap-3">
          <h2 className="!mb-0">Скрытые <span className="font-normal text-[#595959]">({hidden.length})</span></h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {hidden.map((row) => (
              <StaffCard key={row.id} slug={slug} row={row} canEdit={canEdit} editing={editingId === row.id} onEdit={setEditingId} onStopEdit={() => setEditingId(null)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StaffCard({ slug, row, canEdit, editing, onEdit, onStopEdit }: {
  slug: string; row: StaffRow; canEdit: boolean; editing: boolean; onEdit: (id: string) => void; onStopEdit: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const toggle = useCallback(() => {
    startTransition(async () => {
      const res = await callAction(() => setStaffActive(slug, row.id, !row.is_active));
      if (res.ok) toast.success(res.message ?? 'Готово'); else toast.error(res.error);
    });
  }, [row.id, row.is_active, slug, toast]);

  const remove = useCallback(() => {
    if (!window.confirm(`Удалить сотрудника «${row.name}»?`)) return;
    startTransition(async () => {
      const res = await callAction(() => deleteStaff(slug, row.id));
      if (res.ok) toast.success(res.message ?? 'Удалено'); else toast.error(res.error);
    });
  }, [row.id, row.name, slug, toast]);

  if (editing) {
    return (
      <li className="rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4">
        <StaffForm defaults={toForm(row)} submitLabel="Сохранить" onSubmit={(values) => updateStaff(slug, row.id, values)} onDone={onStopEdit} onCancel={onStopEdit} />
      </li>
    );
  }

  return (
    <li className={`rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 ${row.is_active ? '' : 'bg-[#fafafa]'}`}>
      <div className="flex items-center gap-3">
        {row.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photo_url} alt="" className="size-12 shrink-0 rounded-full border border-[#e5e5e5] object-cover" loading="lazy" />
        ) : (
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full border border-[#e5e5e5] bg-[#f5f5f5] text-[15px] font-semibold text-[#8a8a8a]">
            {row.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="!mb-0 truncate text-[15px] font-semibold">{row.name}</p>
          {row.position && <p className="!mb-0 truncate text-[13px] text-[#595959]">{row.position}</p>}
        </div>
      </div>
      {row.experience_years !== null && row.experience_years > 0 && (
        <p className="!mb-0 mt-2 text-[13px] text-[#8a8a8a]">Стаж {row.experience_years} {row.experience_years === 1 ? 'год' : row.experience_years < 5 ? 'года' : 'лет'}</p>
      )}
      {row.description && <p className="!mb-0 mt-1 text-[14px] leading-6">{row.description}</p>}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2" aria-busy={pending}>
          <button type="button" onClick={() => onEdit(row.id)} disabled={pending} className="!min-h-[44px] md:!min-h-[36px]">Изменить</button>
          <button type="button" onClick={toggle} disabled={pending} className="!min-h-[44px] md:!min-h-[36px]">
            {row.is_active ? 'Скрыть с сайта' : 'Показать на сайте'}
          </button>
          <button type="button" onClick={remove} disabled={pending} className="!min-h-[44px] md:!min-h-[36px] text-[#b91c1c]">Удалить</button>
        </div>
      )}
    </li>
  );
}

function StaffForm({ defaults, submitLabel, onSubmit, onDone, onCancel, resetOnDone = false }: {
  defaults: StaffFormValues;
  submitLabel: string;
  onSubmit: (values: StaffFormValues) => Promise<{ ok: true; message?: string; data?: StaffRow } | { ok: false; error: string; fieldErrors?: Record<string, string> }>;
  onDone: (row: StaffRow) => void;
  onCancel?: () => void;
  resetOnDone?: boolean;
}) {
  const toast = useToast();
  const [values, setValues] = useState<StaffFormValues>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = useCallback(<K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const res = await callAction(() => onSubmit(values));
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(res.message ?? 'Сохранено');
      if (res.data) onDone(res.data);
      if (resetOnDone) setValues(defaults);
    });
  }, [defaults, onDone, onSubmit, resetOnDone, toast, values]);

  const field = 'w-full rounded-lg border border-[#d4d4d4] px-3 py-2 text-[14px]';

  return (
    <form onSubmit={submit} className="grid gap-3" aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[14px]">
          <span className="font-medium">Имя</span>
          <input value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={STAFF_LIMITS.nameMax} required className={field} autoComplete="off" />
          {errors.name && <span className="text-[12px] text-[#b91c1c]">{errors.name}</span>}
        </label>
        <label className="grid gap-1 text-[14px]">
          <span className="font-medium">Должность</span>
          <input value={values.position} onChange={(e) => set('position', e.target.value)} maxLength={STAFF_LIMITS.positionMax} placeholder="Мастер-детейлер" className={field} autoComplete="off" />
          {errors.position && <span className="text-[12px] text-[#b91c1c]">{errors.position}</span>}
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[14px]">
          <span className="font-medium">Стаж, лет</span>
          <input value={values.experience_years} onChange={(e) => set('experience_years', e.target.value)} inputMode="numeric" className={field} autoComplete="off" />
          {errors.experience_years && <span className="text-[12px] text-[#b91c1c]">{errors.experience_years}</span>}
        </label>
        <label className="grid gap-1 text-[14px]">
          <span className="font-medium">Ссылка на фото</span>
          <input value={values.photo_url} onChange={(e) => set('photo_url', e.target.value)} placeholder="https://…" className={field} autoComplete="off" />
          {errors.photo_url && <span className="text-[12px] text-[#b91c1c]">{errors.photo_url}</span>}
        </label>
      </div>
      <label className="grid gap-1 text-[14px]">
        <span className="font-medium">О сотруднике</span>
        <textarea value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={STAFF_LIMITS.descriptionMax} rows={3} className={field} />
        {errors.description && <span className="text-[12px] text-[#b91c1c]">{errors.description}</span>}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={pending} className="!min-h-[44px]">{pending ? 'Сохраняем…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={pending} className="!min-h-[44px]">Отмена</button>}
      </div>
    </form>
  );
}
