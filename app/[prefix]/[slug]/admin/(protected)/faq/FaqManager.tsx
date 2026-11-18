'use client';
// faq/FaqManager.tsx — вопросы и ответы: добавление, правка на месте, скрытие, удаление.
import { useCallback, useState, useTransition } from 'react';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { addFaq, deleteFaq, setFaqPublished, updateFaq, FAQ_LIMITS, type FaqFormValues, type FaqRow } from './actions';

const EMPTY: FaqFormValues = { question: '', answer: '' };

export function FaqManager({ slug, rows, canEdit }: { slug: string; rows: FaqRow[]; canEdit: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();
  const onAdded = useCallback((row: FaqRow) => toast.success(`Добавлен вопрос: ${row.question.slice(0, 40)}`), [toast]);

  const published = rows.filter((r) => r.is_published);
  const hidden = rows.filter((r) => !r.is_published);

  return (
    <div className="grid gap-8">
      {canEdit && (
        <section className="rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 sm:p-5">
          <h2>Добавить вопрос</h2>
          <div className="max-w-[640px]">
            <FaqForm defaults={EMPTY} submitLabel="Добавить" onSubmit={(values) => addFaq(slug, values)} onDone={onAdded} resetOnDone />
          </div>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="!mb-0">На сайте <span className="font-normal text-[#595959]">({published.length})</span></h2>
        {published.length === 0 ? (
          <p className="!mb-0 rounded-xl border border-dashed border-[#d4d4d4] bg-[var(--surface)] p-6 text-center text-[14px] text-[#595959]">
            Вопросов пока нет. Блок «Частые вопросы» появится на сайте, как только добавите первый.
          </p>
        ) : (
          <ul className="grid gap-3">
            {published.map((row) => (
              <FaqCard key={row.id} slug={slug} row={row} canEdit={canEdit} editing={editingId === row.id} onEdit={setEditingId} onStopEdit={() => setEditingId(null)} />
            ))}
          </ul>
        )}
      </section>

      {hidden.length > 0 && (
        <section className="grid gap-3">
          <h2 className="!mb-0">Скрытые <span className="font-normal text-[#595959]">({hidden.length})</span></h2>
          <ul className="grid gap-3">
            {hidden.map((row) => (
              <FaqCard key={row.id} slug={slug} row={row} canEdit={canEdit} editing={editingId === row.id} onEdit={setEditingId} onStopEdit={() => setEditingId(null)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FaqCard({ slug, row, canEdit, editing, onEdit, onStopEdit }: {
  slug: string; row: FaqRow; canEdit: boolean; editing: boolean; onEdit: (id: string) => void; onStopEdit: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const toggle = useCallback(() => {
    startTransition(async () => {
      const res = await callAction(() => setFaqPublished(slug, row.id, !row.is_published));
      if (res.ok) toast.success(res.message ?? 'Готово'); else toast.error(res.error);
    });
  }, [row.id, row.is_published, slug, toast]);

  const remove = useCallback(() => {
    if (!window.confirm('Удалить вопрос? Восстановить его будет нельзя.')) return;
    startTransition(async () => {
      const res = await callAction(() => deleteFaq(slug, row.id));
      if (res.ok) toast.success(res.message ?? 'Удалено'); else toast.error(res.error);
    });
  }, [row.id, slug, toast]);

  if (editing) {
    return (
      <li className="rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4">
        <FaqForm defaults={{ question: row.question, answer: row.answer }} submitLabel="Сохранить" onSubmit={(values) => updateFaq(slug, row.id, values)} onDone={onStopEdit} onCancel={onStopEdit} />
      </li>
    );
  }

  return (
    <li className={`rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 ${row.is_published ? '' : 'bg-[#fafafa]'}`}>
      <p className="!mb-0 text-[15px] font-semibold">{row.question}</p>
      <p className="!mb-0 mt-1 whitespace-pre-line text-[14px] leading-6 text-[#404040]">{row.answer}</p>
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

function FaqForm({ defaults, submitLabel, onSubmit, onDone, onCancel, resetOnDone = false }: {
  defaults: FaqFormValues;
  submitLabel: string;
  onSubmit: (values: FaqFormValues) => Promise<{ ok: true; message?: string; data?: FaqRow } | { ok: false; error: string; fieldErrors?: Record<string, string> }>;
  onDone: (row: FaqRow) => void;
  onCancel?: () => void;
  resetOnDone?: boolean;
}) {
  const toast = useToast();
  const [values, setValues] = useState<FaqFormValues>(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

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
        <span className="font-medium">Вопрос</span>
        <input value={values.question} onChange={(e) => setValues((p) => ({ ...p, question: e.target.value }))} maxLength={FAQ_LIMITS.questionMax} required className={field} autoComplete="off" />
        {errors.question && <span className="text-[12px] text-[#b91c1c]">{errors.question}</span>}
      </label>
      <label className="grid gap-1 text-[14px]">
        <span className="font-medium">Ответ</span>
        <textarea value={values.answer} onChange={(e) => setValues((p) => ({ ...p, answer: e.target.value }))} maxLength={FAQ_LIMITS.answerMax} rows={3} required className={field} />
        {errors.answer && <span className="text-[12px] text-[#b91c1c]">{errors.answer}</span>}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={pending} className="!min-h-[44px]">{pending ? 'Сохраняем…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={pending} className="!min-h-[44px]">Отмена</button>}
      </div>
    </form>
  );
}
