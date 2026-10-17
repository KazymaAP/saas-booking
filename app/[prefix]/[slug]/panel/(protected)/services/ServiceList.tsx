'use client';
// services/ServiceList.tsx — список услуг: мгновенное скрытие/показ (useOptimistic) и правка на месте.
// Клиентский: optimistic-состояние, режим редактирования строки. Manager получает canEdit=false — только просмотр.
// Вёрстка — карточки на любой ширине: у услуги 4 поля, таблица не даёт выигрыша и ломается на телефоне.
import { useCallback, useOptimistic, useState, useTransition } from 'react';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { useBusyIds } from '../_lib/busy';
import { addService, setServiceActive, updateService } from './actions';
import { EMPTY_SERVICE, formatDuration, formatPrice, toFormValues, type ServiceFormValues, type ServiceRow } from './schema';
import { ServiceForm } from './ServiceForm';

type Patch = { id: string; is_active: boolean };

const ADD_FORM_ID = 'add-service';

function applyPatch(rows: ServiceRow[], p: Patch): ServiceRow[] {
  return rows.map((r) => (r.id === p.id ? { ...r, is_active: p.is_active } : r));
}

export function ServiceList({ slug, rows, canEdit }: { slug: string; rows: ServiceRow[]; canEdit: boolean }) {
  const [optimisticRows, setOptimistic] = useOptimistic(rows, applyPatch);
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const busy = useBusyIds();
  const [announce, setAnnounce] = useState('');
  const toast = useToast();

  const toggle = useCallback((row: ServiceRow) => {
    if (busy.isBusy(row.id)) return;
    const next = !row.is_active;
    busy.start(row.id);
    startTransition(async () => {
      setOptimistic({ id: row.id, is_active: next });
      const res = await callAction(() => setServiceActive(slug, row.id, next));
      busy.stop(row.id);
      if (res.ok) {
        toast.success(res.message ?? 'Готово');
        setAnnounce(`${row.name}: ${next ? 'показана на сайте' : 'скрыта'}`);
      } else {
        // Откат: transition завершён, props rows прежние → useOptimistic вернёт исходное состояние.
        toast.error(res.error);
        setAnnounce(`Ошибка: ${res.error}`);
      }
    });
  }, [busy, setOptimistic, slug, toast]);

  const add = useCallback((values: ServiceFormValues) => addService(slug, values), [slug]);
  const stopEdit = useCallback(() => setEditingId(null), []);
  const onAdded = useCallback((row: ServiceRow) => setAnnounce(`Добавлена услуга ${row.name}`), []);

  const active = optimisticRows.filter((r) => r.is_active);
  const hidden = optimisticRows.filter((r) => !r.is_active);

  return (
    <div className="grid gap-8">
      <p className="sr-only" aria-live="polite">{announce}</p>

      {canEdit && (
        <section id={ADD_FORM_ID} aria-labelledby="add-service-title" className="rounded-xl border border-[#e5e5e5] bg-white p-4 sm:p-5">
          <h2 id="add-service-title">Добавить услугу</h2>
          <div className="max-w-[560px]">
            <ServiceForm defaults={EMPTY_SERVICE} submitLabel="Добавить" onSubmit={add} onDone={onAdded} resetOnDone />
          </div>
        </section>
      )}

      <section aria-labelledby="services-active-title" className="grid gap-3">
        <h2 id="services-active-title" className="!mb-0">На сайте <span className="font-normal text-[#595959]">({active.length})</span></h2>
        {active.length === 0 ? (
          <EmptyState canEdit={canEdit} />
        ) : (
          <ServiceCards rows={active} slug={slug} canEdit={canEdit} editingId={editingId} isBusy={busy.isBusy} onEdit={setEditingId} onStopEdit={stopEdit} onToggle={toggle} />
        )}
      </section>

      {hidden.length > 0 && (
        <section aria-labelledby="services-hidden-title" className="grid gap-3">
          <h2 id="services-hidden-title" className="!mb-0">Скрытые <span className="font-normal text-[#595959]">({hidden.length})</span></h2>
          <p className="!mb-0 text-[14px] text-[#595959]">Не видны клиентам. Старые брони с этими услугами сохраняются.</p>
          <ServiceCards rows={hidden} slug={slug} canEdit={canEdit} editingId={editingId} isBusy={busy.isBusy} onEdit={setEditingId} onStopEdit={stopEdit} onToggle={toggle} />
        </section>
      )}
    </div>
  );
}

type CardsProps = {
  rows: ServiceRow[];
  slug: string;
  canEdit: boolean;
  editingId: string | null;
  isBusy: (id: string) => boolean;
  onEdit: (id: string) => void;
  onStopEdit: () => void;
  onToggle: (row: ServiceRow) => void;
};

function ServiceCards({ rows, ...rest }: CardsProps) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((row) => <ServiceCard key={row.id} row={row} {...rest} />)}
    </ul>
  );
}

function ServiceCard({ row, slug, canEdit, editingId, isBusy, onEdit, onStopEdit, onToggle }: Omit<CardsProps, 'rows'> & { row: ServiceRow }) {
  const editing = editingId === row.id;
  const busy = isBusy(row.id);
  const startEdit = useCallback(() => onEdit(row.id), [onEdit, row.id]);
  const toggle = useCallback(() => onToggle(row), [onToggle, row]);
  const save = useCallback((values: ServiceFormValues) => updateService(slug, row.id, values), [slug, row.id]);

  return (
    <li className={`rounded-xl border border-[#e5e5e5] bg-white p-4 ${row.is_active ? '' : 'bg-[#fafafa]'}`}>
      {editing ? (
        <ServiceForm defaults={toFormValues(row)} submitLabel="Сохранить" onSubmit={save} onDone={onStopEdit} onCancel={onStopEdit} />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="!mb-0 text-[16px]">{row.name}</h3>
            <span className="font-semibold">{formatPrice(row.price)}</span>
          </div>
          <p className="!mb-0 text-[14px] text-[#595959]">{formatDuration(row.duration_minutes)}</p>
          {row.description && <p className="!mb-0 mt-1 text-[14px]">{row.description}</p>}
          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2" aria-busy={busy}>
              <button type="button" onClick={startEdit} disabled={busy} className="!min-h-[44px] md:!min-h-[36px]" aria-label={`Изменить: ${row.name}`}>Изменить</button>
              <button type="button" onClick={toggle} disabled={busy} className="!min-h-[44px] md:!min-h-[36px]" aria-label={`${row.is_active ? 'Скрыть' : 'Показать'}: ${row.name}`}>
                {row.is_active ? 'Скрыть с сайта' : 'Показать на сайте'}
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

// Кнопка «Добавить услугу» пустого состояния: прокрутка к форме и фокус в поле «Название».
// Раньше была якорная ссылка — фокус оставался на ссылке, с клавиатуры и в экранном дикторе приходилось искать поле.
function focusAddForm(): void {
  const input = document.getElementById(ADD_FORM_ID)?.querySelector<HTMLInputElement>('input');
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  input.focus({ preventScroll: true });
}

// ТЗ §19.3: иконка + заголовок + кнопка «Добавить» (ведёт к форме выше).
function EmptyState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[#d4d4d4] bg-white p-8 text-center">
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
      <p className="!mb-0 font-medium">Услуг на сайте пока нет</p>
      {canEdit
        ? <button type="button" onClick={focusAddForm} className="btn-primary !min-h-[44px]">Добавить услугу</button>
        : <p className="!mb-0 text-[14px] text-[#595959]">Услуги добавляет владелец.</p>}
    </div>
  );
}
