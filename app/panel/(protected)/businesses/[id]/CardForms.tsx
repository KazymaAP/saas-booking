'use client';
// Формы карточки бизнеса: slug, домен, SSL, заметки (ActionForm — ошибки под полями, тост),
// статус (optimistic: бейдж меняется сразу, откат при ошибке), кнопки действий с подтверждением.
import { useCallback, useMemo, useOptimistic, useState, useTransition } from 'react';
import { ActionForm, Field, SubmitButton } from '../../_components/ActionForm';
import { ConfirmDialog } from '../../_components/ConfirmDialog';
import { StatusBadge } from '../../_components/StatusBadge';
import { useToast } from '../../_components/Toast';
import { orNetworkError } from '../../_lib/network';
import { MASS_STATUSES, STATUS_LABEL } from '../../_lib/statuses';
import { cardAction, changeSlug, changeStatus, checkSsl, saveDomain, saveNotes } from './actions';
import { MAX_NOTES } from './schema';

export function SlugForm({ id, slug }: { id: string; slug: string }) {
  return (
    <ActionForm action={changeSlug} className="grid max-w-[520px] gap-2" label="Сменить адрес сайта">
      <input type="hidden" name="id" value={id} />
      <Field name="slug" label="Адрес (slug)" defaultValue={slug} required hint="Латиница, цифры, дефис. Старый адрес будет перенаправлять на новый (301)." />
      <SubmitButton pendingText="Меняю…" variant="secondary">Сменить slug</SubmitButton>
    </ActionForm>
  );
}

export function DomainForms({ id, domain }: { id: string; domain: string | null }) {
  return (
    <div className="grid max-w-[520px] gap-3">
      <ActionForm action={saveDomain} className="grid gap-2" label="Кастомный домен">
        <input type="hidden" name="id" value={id} />
        <Field name="domain" label="Домен клиента" defaultValue={domain} placeholder="client.ru" inputMode="url" hint="Пусто — отвязать домен." />
        <SubmitButton>Сохранить домен</SubmitButton>
      </ActionForm>
      {domain && (
        <ActionForm action={checkSsl} label="Проверка SSL">
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="secondary" pendingText="Проверяю…">Проверить SSL</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function NotesForm({ id, notes }: { id: string; notes: string | null }) {
  return (
    <ActionForm action={saveNotes} className="grid max-w-[560px] gap-2" label="Заметки">
      <input type="hidden" name="id" value={id} />
      <Field name="notes" label="Заметки (видите только вы)" defaultValue={notes} multiline rows={5} maxLength={MAX_NOTES} />
      <SubmitButton>Сохранить заметку</SubmitButton>
    </ActionForm>
  );
}

const LOCKED = new Set(['client', 'transferred_out', 'pending_deletion', 'deleted']);

export function StatusControl({ id, status }: { id: string; status: string }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [isPending, start] = useTransition();
  const [shown, setShown] = useOptimistic(status);
  const pick = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => setValue(e.target.value), []);
  const apply = useCallback(() => {
    if (!value) return;
    start(async () => {
      setShown(value);
      const res = await orNetworkError(changeStatus(id, value));
      toast.show(res.ok ? res.message : res.error, res.ok ? 'success' : 'error');
      if (res.ok) setValue('');
    });
  }, [id, value, setShown, toast]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-[14px]" aria-busy={isPending}>
      <span>Статус:</span>
      <StatusBadge status={shown} pending={isPending} />
      {LOCKED.has(status) ? (
        <span className="text-[#666666]">меняется в разделе «Клиенты»</span>
      ) : (
        <>
          <label htmlFor="card-status" className="sr-only">Новый статус</label>
          <select id="card-status" value={value} onChange={pick} className="input max-w-[220px]">
            <option value="" disabled>Сменить статус на…</option>
            {MASS_STATUSES.filter((s) => s !== status).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button type="button" onClick={apply} disabled={!value || isPending} aria-disabled={!value || isPending}>Сменить статус</button>
        </>
      )}
    </div>
  );
}

type Op = 'approve' | 'send' | 'archive' | 'delete';
type Button = { op: Op; label: string; confirm?: string; danger?: boolean };

// Набор кнопок зависит от статуса (ТЗ §13.3): одобрить — только готовый прототип, отправить — одобренный с email.
function cardButtons(status: string, hasEmail: boolean): Button[] {
  const out: Button[] = [];
  if (status === 'preview_ready') out.push({ op: 'approve', label: 'Одобрить' });
  if (status === 'approved' && hasEmail) out.push({ op: 'send', label: 'Отправить письмо', confirm: 'Письмо уйдёт владельцу бизнеса через очередь рассылки.' });
  if (!LOCKED.has(status) && status !== 'archived') out.push({ op: 'archive', label: 'Архивировать', confirm: 'Бизнес пропадёт из воронки.' });
  if (!LOCKED.has(status)) out.push({ op: 'delete', label: 'Удалить', danger: true, confirm: 'Через 30 дней бизнес и его данные будут удалены. До этого можно вернуть статус.' });
  return out;
}

export function CardButtons({ id, status, previewUrl, hasEmail }: { id: string; status: string; previewUrl: string | null; hasEmail: boolean }) {
  const toast = useToast();
  const [isPending, start] = useTransition();
  const [asking, setAsking] = useState<Button | null>(null);

  const buttons = useMemo(() => cardButtons(status, hasEmail), [status, hasEmail]);

  const run = useCallback(
    (b: Button) => {
      start(async () => {
        const res = await orNetworkError(cardAction(id, b.op));
        toast.show(res.ok ? res.message : res.error, res.ok ? 'success' : 'error');
      });
    },
    [id, toast],
  );
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const b = buttons.find((x) => x.op === e.currentTarget.value);
      if (!b) return;
      if (b.confirm) setAsking(b);
      else run(b);
    },
    [buttons, run],
  );
  const confirm = useCallback(() => {
    if (asking) run(asking);
    setAsking(null);
  }, [asking, run]);
  const cancel = useCallback(() => setAsking(null), []);

  return (
    <div className="flex flex-wrap gap-2" aria-busy={isPending}>
      {previewUrl && <a className="btn-primary no-underline" href={previewUrl} target="_blank" rel="noreferrer noopener">Открыть прототип<span className="sr-only"> (в новой вкладке)</span></a>}
      {buttons.map((b) => (
        <button key={b.op} type="button" value={b.op} onClick={onClick} disabled={isPending} className={b.danger ? '!border-[#dc2626] !text-[#dc2626]' : ''}>{b.label}</button>
      ))}
      <ConfirmDialog open={asking !== null} title={asking ? `${asking.label}?` : ''} text={asking?.confirm ?? ''} confirmLabel={asking?.label ?? 'Да'} onConfirm={confirm} onCancel={cancel} />
    </div>
  );
}
