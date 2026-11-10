'use client';
// Кнопка ручного бэкапа: состояние «идёт», результат в aria-live (экранные дикторы озвучивают итог).
import { useState, useTransition } from 'react';
import { runBackupNow, type BackupActionResult } from './actions';

export function BackupNowButton() {
  const [result, setResult] = useState<BackupActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await runBackupNow().catch(() => ({ ok: false, message: 'Сервер не ответил' })));
    });
  }

  return (
    <div className="grid gap-2">
      <button type="button" className="btn-primary w-fit" onClick={onClick} disabled={pending} aria-busy={pending}>
        {pending ? 'Создаю копию…' : 'Сделать копию сейчас'}
      </button>
      <p role="status" aria-live="polite" className={`text-[14px] ${result && !result.ok ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
        {result?.message ?? ''}
      </p>
    </div>
  );
}
