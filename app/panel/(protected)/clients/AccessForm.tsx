'use client';
// «Создать доступ» владельцу (ТЗ §14.2 п.2–3, §19.2). Форма раскрывается по кнопке, чтобы не занимать строку.
// Пароль приходит в ответе server action и живёт только в состоянии компонента: после перезагрузки страницы
// его не видно (раньше лежал в cookie 5 минут и показывался при каждом обновлении).
import { useCallback, useId, useState } from 'react';
import { ActionForm, Field, SubmitButton } from '@/главная/components/ActionForm';
import type { ActionResult } from '@/главная/lib/action';
import { createOwnerAccess, type AccessCreated } from './actions';

export function AccessForm({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<AccessCreated | null>(null);
  const panelId = useId();
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const hide = useCallback(() => {
    setCreated(null);
    setOpen(false);
  }, []);
  const onDone = useCallback((res: ActionResult<AccessCreated>) => {
    if (res.ok) setCreated(res.data);
  }, []);

  if (created) return <Credentials data={created} onHide={hide} />;

  return (
    <div className="grid gap-2">
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId}>
        Создать доступ<span className="sr-only">: {name}</span>
      </button>
      {open && (
        <div id={panelId}>
          <ActionForm action={createOwnerAccess} onDone={onDone} className="grid w-[240px] gap-2" label={`Доступ владельцу «${name}»`}>
            <input type="hidden" name="id" value={id} />
            <Field name="email" label="Email владельца" type="email" inputMode="email" autoComplete="off" required hint="На него придёт пароль" />
            <SubmitButton pendingText="Создаю…">Создать</SubmitButton>
          </ActionForm>
        </div>
      )}
    </div>
  );
}

// Блок с паролем: role="alert" — скринридер объявит сразу. Кнопка «Скопировать» и «Скрыть».
function Credentials({ data, onHide }: { data: AccessCreated; onHide: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(`${data.email}\n${data.password}`).then(() => setCopied(true));
  }, [data]);
  return (
    <div role="alert" className="grid w-[260px] gap-1 rounded-[12px] border border-[#16a34a] bg-[#f0fdf4] p-3 text-[13px]">
      <p className="m-0 font-semibold">Пароль показывается один раз</p>
      <p className="m-0">{data.mailed ? 'Он уже отправлен владельцу на почту.' : 'Письмо не ушло — передайте вручную.'}</p>
      <p className="m-0 break-all">Логин: {data.email}</p>
      <p className="m-0 break-all">Пароль: <code>{data.password}</code></p>
      <div className="flex gap-2">
        <button type="button" onClick={copy}>{copied ? 'Скопировано' : 'Скопировать'}</button>
        <button type="button" onClick={onHide}>Скрыть</button>
      </div>
    </div>
  );
}
