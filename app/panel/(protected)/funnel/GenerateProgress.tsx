'use client';
// Шаг 2 воронки: генерация по одному с прогресс-баром (ТЗ §5.4). Каждый прототип — отдельный вызов.
import { useState } from 'react';
import { generateOne } from '../actions';

export function GenerateProgress({ items }: { items: { id: string; name: string }[] }) {
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const list = items.slice(0, 20);

  async function run() {
    setRunning(true);
    setDone(0);
    setFailed([]);
    for (const it of list) {
      const r = await generateOne(it.id);
      if (!r.ok) setFailed((f) => [...f, it.name]);
      setDone((d) => d + 1);
    }
    setRunning(false);
    window.location.reload();
  }

  if (list.length === 0) return <p className="text-[14px] text-[#666666]">Нет бизнесов «В работе».</p>;
  const pct = Math.round((done / list.length) * 100);
  return (
    <div className="grid max-w-[520px] gap-2 text-[14px]">
      <button type="button" className="btn-primary w-fit" onClick={run} disabled={running}>
        {running ? `Генерация ${done} из ${list.length}…` : `Сгенерировать для ${list.length}`}
      </button>
      <div className="h-2 w-full rounded bg-[#e5e5e5]"><div className="h-2 rounded bg-[#111111]" style={{ width: `${pct}%` }} /></div>
      {failed.length > 0 && <p className="text-[#dc2626]">Не получилось: {failed.join(', ')}</p>}
    </div>
  );
}
