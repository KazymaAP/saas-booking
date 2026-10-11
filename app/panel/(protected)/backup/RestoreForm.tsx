'use client';
// Восстановление из копии: требует ввести ВОССТАНОВИТЬ (ТЗ §35). Вызывает /api/backup/restore.
import { useState } from 'react';

export function RestoreForm({ file }: { file: string }) {
  const [word, setWord] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, confirm: word }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !j.ok) return setMsg(`Ошибка: ${j.reason ?? 'сервер'}`);
    setMsg('Восстановлено: ' + Object.entries(j.result as Record<string, { rows: number; error?: string }>).map(([t, r]) => `${t} ${r.rows}${r.error ? ' (ошибка)' : ''}`).join(', '));
  }

  return (
    <details className="text-[14px]">
      <summary className="cursor-pointer text-[#dc2626]">Восстановить из этой копии</summary>
      <div className="mt-2 grid max-w-[420px] gap-2">
        <p className="text-[#666666]">Существующие записи с теми же id будут перезаписаны. Введите ВОССТАНОВИТЬ для подтверждения.</p>
        <input value={word} onChange={(e) => setWord(e.target.value)} className="input" placeholder="ВОССТАНОВИТЬ" />
        <button type="button" className="h-11 rounded-md border border-[#dc2626] px-4 text-[#dc2626] disabled:opacity-40" disabled={word !== 'ВОССТАНОВИТЬ' || busy} onClick={run}>
          {busy ? 'Восстанавливаю…' : 'Восстановить'}
        </button>
        {msg && <p>{msg}</p>}
      </div>
    </details>
  );
}
