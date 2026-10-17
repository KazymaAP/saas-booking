'use client';
// Форма выдачи лицензии: подписанные поля, результат в aria-live.
import { useRef, useState, useTransition } from 'react';
import { createLicense, type ActionResult } from './actions';

export function CreateLicenseForm({ businesses }: { businesses: { id: string; name: string }[] }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(fd: FormData) {
    startTransition(async () => {
      const r = await createLicense(fd);
      setResult(r);
      if (r.ok) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={submit} className="mt-3 flex flex-wrap items-end gap-3 text-[14px]">
      <label className="grid gap-1">
        <span>Бизнес</span>
        <select name="business_id" className="input max-w-[280px]" required>
          <option value="">Выберите бизнес</option>
          {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1">
        <span>Домен</span>
        <input name="domain" placeholder="client.ru" className="input max-w-[280px]" required inputMode="url" autoComplete="off" />
      </label>
      <button className="btn-primary" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? 'Выдаю…' : 'Выдать'}
      </button>
      <p role="status" aria-live="polite" className={result?.ok ? 'text-[#16a34a]' : 'text-[#dc2626]'}>
        {result?.message ?? ''}
      </p>
    </form>
  );
}
