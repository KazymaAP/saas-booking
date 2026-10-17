'use client';
// Шаг 4 воронки: кнопка «Отправить всем одобренным» с подтверждением и результатом в тосте.
// Подтверждение обязательно: письма уходят реальным людям (design-spec §6 — опасное действие).
import { useCallback, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionForm } from '../_components/ActionForm';
import { ConfirmDialog } from '../_components/ConfirmDialog';
import { queueOutreach } from './actions';

export function QueueForm({ templateId, approved, withEmail }: { templateId: string; approved: number; withEmail: number }) {
  const formRef = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const ask = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setAsking(true);
  }, []);
  const cancel = useCallback(() => setAsking(false), []);
  // Подтверждено — отправляем форму программно (requestSubmit сохраняет валидацию и server action).
  const confirm = useCallback(() => {
    setAsking(false);
    formRef.current?.querySelector('form')?.requestSubmit();
  }, []);

  return (
    <div ref={formRef}>
      <ActionForm action={queueOutreach} className="flex flex-wrap items-center gap-3 text-[14px]" label="Отправка одобренным">
        <input type="hidden" name="template_id" value={templateId} />
        <span>Одобрено: {approved}, из них с email: {withEmail}. Отправка по одному письму в минуту через cron.</span>
        {withEmail > 0 ? <QueueButton count={withEmail} onAsk={ask} /> : <span className="text-[#666666]">Нет одобренных с email.</span>}
      </ActionForm>
      <ConfirmDialog
        open={asking}
        title="Отправить письма?"
        text={`Письма уйдут ${withEmail} адресатам по одному в минуту. Отменить отправку уже ушедших писем нельзя.`}
        confirmLabel="Отправить"
        onConfirm={confirm}
        onCancel={cancel}
      />
    </div>
  );
}

// Кнопка внутри формы: useFormStatus показывает «Ставлю в очередь…», пока server action выполняется.
function QueueButton({ count, onAsk }: { count: number; onAsk: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const { pending } = useFormStatus();
  return (
    <button type="button" className="btn-primary" onClick={onAsk} disabled={pending} aria-disabled={pending}>
      {pending ? 'Ставлю в очередь…' : `Отправить всем одобренным (${count})`}
    </button>
  );
}
