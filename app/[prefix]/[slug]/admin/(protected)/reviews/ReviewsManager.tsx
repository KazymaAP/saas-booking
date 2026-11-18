'use client';
// reviews/ReviewsManager.tsx — список отзывов: добавление, правка на месте, скрытие и удаление.
// Клиентский: локальный режим правки строки и optimistic-скрытие. Валидация — та же zod-схема на сервере.
import { useCallback, useState, useTransition } from 'react';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { addReview, deleteReview, setReviewPublished, updateReview, REVIEW_LIMITS, type ReviewFormValues, type ReviewRow } from './actions';

const EMPTY: ReviewFormValues = { author_name: '', rating: 5, body: '', service_name: '', source: '' };

function toForm(row: ReviewRow): ReviewFormValues {
  return {
    author_name: row.author_name,
    rating: row.rating,
    body: row.body ?? '',
    service_name: row.service_name ?? '',
    source: row.source ?? '',
  };
}

function Stars({ value }: { value: number }) {
  return (
    <span className="text-[13px] text-[#b45309]" aria-label={`Оценка ${value} из 5`}>
      {'★'.repeat(value)}
      <span className="text-[#d4d4d4]">{'★'.repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

export function ReviewsManager({ slug, rows, canEdit }: { slug: string; rows: ReviewRow[]; canEdit: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();

  const onAdded = useCallback((row: ReviewRow) => toast.success(`Добавлен отзыв: ${row.author_name}`), [toast]);

  const published = rows.filter((r) => r.is_published);
  const hidden = rows.filter((r) => !r.is_published);

  return (
    <div className="grid gap-8">
      {canEdit && (
        <section className="rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 sm:p-5">
          <h2>Добавить отзыв</h2>
          <div className="max-w-[560px]">
            <ReviewForm defaults={EMPTY} submitLabel="Добавить" onSubmit={(values) => addReview(slug, values)} onDone={onAdded} resetOnDone />
          </div>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="!mb-0">На сайте <span className="font-normal text-[#595959]">({published.length})</span></h2>
        {published.length === 0 ? (
          <p className="!mb-0 rounded-xl border border-dashed border-[#d4d4d4] bg-[var(--surface)] p-6 text-center text-[14px] text-[#595959]">
            Отзывов пока нет. Блок «Отзывы» появится на сайте, как только добавите первый.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {published.map((row) => (
              <ReviewCard key={row.id} slug={slug} row={row} canEdit={canEdit} editing={editingId === row.id} onEdit={setEditingId} onStopEdit={() => setEditingId(null)} />
            ))}
          </ul>
        )}
      </section>

      {hidden.length > 0 && (
        <section className="grid gap-3">
          <h2 className="!mb-0">Скрытые <span className="font-normal text-[#595959]">({hidden.length})</span></h2>
          <p className="!mb-0 text-[14px] text-[#595959]">Не видны на сайте, но сохранены — можно вернуть одним нажатием.</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {hidden.map((row) => (
              <ReviewCard key={row.id} slug={slug} row={row} canEdit={canEdit} editing={editingId === row.id} onEdit={setEditingId} onStopEdit={() => setEditingId(null)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReviewCard({ slug, row, canEdit, editing, onEdit, onStopEdit }: {
  slug: string; row: ReviewRow; canEdit: boolean; editing: boolean; onEdit: (id: string) => void; onStopEdit: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const toggle = useCallback(() => {
    startTransition(async () => {
      const res = await callAction(() => setReviewPublished(slug, row.id, !row.is_published));
      if (res.ok) toast.success(res.message ?? 'Готово'); else toast.error(res.error);
    });
  }, [row.id, row.is_published, slug, toast]);

  const remove = useCallback(() => {
    if (!window.confirm(`Удалить отзыв «${row.author_name}»? Восстановить его будет нельзя.`)) return;
    startTransition(async () => {
      const res = await callAction(() => deleteReview(slug, row.id));
      if (res.ok) toast.success(res.message ?? 'Удалено'); else toast.error(res.error);
    });
  }, [row.author_name, row.id, slug, toast]);

  if (editing) {
    return (
      <li className="rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4">
        <ReviewForm
          defaults={toForm(row)}
          submitLabel="Сохранить"
          onSubmit={(values) => updateReview(slug, row.id, values)}
          onDone={onStopEdit}
          onCancel={onStopEdit}
        />
      </li>
    );
  }

  return (
    <li className={`rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 ${row.is_published ? '' : 'bg-[#fafafa]'}`}>
      <div className="flex items-center justify-between gap-2">
        <Stars value={row.rating} />
        {row.source && <span className="text-[12px] text-[#8a8a8a]">{row.source}</span>}
      </div>
      {row.body && <p className="!mb-0 mt-2 text-[14px] leading-6">{row.body}</p>}
      <p className="!mb-0 mt-2 text-[13px] font-medium">
        {row.author_name}
        {row.service_name && <span className="font-normal text-[#8a8a8a]"> · {row.service_name}</span>}
      </p>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2" aria-busy={pending}>
          <button type="button" onClick={() => onEdit(row.id)} disabled={pending} className="!min-h-[44px] md:!min-h-[36px]">Изменить</button>
          <button type="button" onClick={toggle} disabled={pending} className="!min-h-[44px] md:!min-h-[36px]">
            {row.is_published ? 'Скрыть с сайта' : 'Показать на сайте'}
          </button>
          <button type="button" onClick={remove} disabled={pending} className="!min-h-[44px] md:!min-h-[36px] text-[#b91c1c]">Удалить</button>
        </div>
      )}
    </li>
  );
}

function ReviewForm({ defaults, submitLabel, onSubmit, onDone, onCancel, resetOnDone = false }: {
  defaults: ReviewFormValues;
  submitLabel: string;
  onSubmit: (values: ReviewFormValues) => Promise<{ ok: true; message?: string; data?: ReviewRow } | { ok: false; error: string; fieldErrors?: Record<string, string> }>;
  onDone: (row: ReviewRow) => void;
  onCancel?: () => void;
  resetOnDone?: boolean;
}) {
  const toast = useToast();
  const [values, setValues] = useState<ReviewFormValues>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = useCallback(<K extends keyof ReviewFormValues>(key: K, value: ReviewFormValues[K]) => {
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
      <label className="grid gap-1 text-[14px]">
        <span className="font-medium">Имя клиента</span>
        <input value={values.author_name} onChange={(e) => set('author_name', e.target.value)} maxLength={REVIEW_LIMITS.authorMax} required className={field} autoComplete="off" />
        {errors.author_name && <span className="text-[12px] text-[#b91c1c]">{errors.author_name}</span>}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[14px]">
          <span className="font-medium">Оценка</span>
          <select value={values.rating} onChange={(e) => set('rating', Number(e.target.value))} className={field}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} из 5</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[14px]">
          <span className="font-medium">Источник</span>
          <input value={values.source} onChange={(e) => set('source', e.target.value)} maxLength={REVIEW_LIMITS.sourceMax} placeholder="Яндекс, 2ГИС, Сайт" className={field} autoComplete="off" />
          {errors.source && <span className="text-[12px] text-[#b91c1c]">{errors.source}</span>}
        </label>
      </div>
      <label className="grid gap-1 text-[14px]">
        <span className="font-medium">Текст отзыва</span>
        <textarea value={values.body} onChange={(e) => set('body', e.target.value)} maxLength={REVIEW_LIMITS.bodyMax} rows={3} className={field} />
        {errors.body && <span className="text-[12px] text-[#b91c1c]">{errors.body}</span>}
      </label>
      <label className="grid gap-1 text-[14px]">
        <span className="font-medium">Услуга</span>
        <input value={values.service_name} onChange={(e) => set('service_name', e.target.value)} maxLength={REVIEW_LIMITS.serviceMax} placeholder="Керамика" className={field} autoComplete="off" />
        {errors.service_name && <span className="text-[12px] text-[#b91c1c]">{errors.service_name}</span>}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={pending} className="!min-h-[44px]">{pending ? 'Сохраняем…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={pending} className="!min-h-[44px]">Отмена</button>}
      </div>
    </form>
  );
}
