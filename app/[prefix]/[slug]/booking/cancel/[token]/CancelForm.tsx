'use client';
// Кнопка отмены: подтверждение в два шага (опасное действие, design-spec §6), useFormState + server action.
// Мгновенный отклик: useFormStatus().pending становится true в том же кадре, что и нажатие, — кнопка
// блокируется и показывает «Отменяем…»; при ошибке pending сбрасывается сам (откат), текст ошибки — в aria-live.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { cancelAction } from './actions';
import { IDLE_STATE, type ActionState } from '@/lib/booking-action-state-types';
import { telHref } from '../../booking-page-ui';

type Props = { token: string; when: string };

function ConfirmButton() {
  const { pending } = useFormStatus();
  // Пока действие на сервере, кнопка заблокирована: повторное нажатие не отправит второй запрос.
  return (
    <button type="submit" className="btn-primary min-h-[44px] !border-[#b91c1c] !bg-[#b91c1c]" disabled={pending} aria-busy={pending}>
      {pending ? 'Отменяем…' : 'Да, отменить запись'}
    </button>
  );
}

function Result({ state, when }: { state: ActionState; when: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.kind !== 'idle') ref.current?.focus();
  }, [state]);
  if (state.kind === 'done') {
    return (
      <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="mt-6 rounded-xl bg-[#f5f5f5] p-4 outline-none">
        <p className="m-0 font-semibold">{state.already ? 'Запись уже отменена' : 'Запись отменена'}</p>
        <p className="m-0 mt-1 text-[14px] text-[#595959]">Запись на {when} больше не действует.</p>
      </div>
    );
  }
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-live="assertive" className="mt-4 outline-none">
      {state.kind === 'error' ? (
        <p className="m-0 text-[#b91c1c]">
          {state.message}{' '}
          {state.phone ? <a href={telHref(state.phone)} className="underline">{state.phone}</a> : null}
        </p>
      ) : null}
    </div>
  );
}

export function CancelForm({ token, when }: Props) {
  const [state, formAction] = useFormState(cancelAction, IDLE_STATE);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const ask = useCallback(() => setConfirming(true), []);
  const back = useCallback(() => setConfirming(false), []);
  useEffect(() => {
    if (confirming) confirmRef.current?.querySelector<HTMLButtonElement>('button[type="button"]')?.focus();
  }, [confirming]);

  if (state.kind === 'done') return <Result state={state} when={when} />;
  return (
    <>
      {confirming ? (
        <div ref={confirmRef} role="group" aria-label="Подтверждение отмены" className="mt-6 rounded-xl border border-[#e5e5e5] p-4">
          <p className="m-0">Отменить запись на {when}? Действие нельзя отменить.</p>
          <form action={formAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="token" value={token} />
            <button type="button" onClick={back} className="min-h-[44px] rounded-lg border border-[#e5e5e5] bg-white px-4">
              Нет, оставить
            </button>
            <ConfirmButton />
          </form>
        </div>
      ) : (
        <div className="mt-6">
          <button type="button" onClick={ask} className="btn-primary min-h-[44px]">Отменить запись</button>
        </div>
      )}
      <Result state={state} when={when} />
    </>
  );
}
