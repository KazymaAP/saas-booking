'use client';
// Выбор нового времени при переносе (ТЗ §18). Слоты берём из публичного API, перенос — из API переноса.
import { useEffect, useState } from 'react';

type Props = { token: string; serviceId: string; prefix: string; slug: string };

export function RescheduleForm({ token, serviceId, prefix, slug }: Props) {
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPicked(null);
    setSlots([]);
    if (!date) return;
    const qs = new URLSearchParams({ prefix, slug, serviceId, date });
    fetch(`/api/bookings/slots?${qs}`).then((r) => r.json()).then((j) => setSlots(j.ok ? j.slots : []));
  }, [date, prefix, slug, serviceId]);

  async function submit() {
    if (!picked) return;
    const res = await fetch(`/api/bookings/${token}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startsAt: picked, date }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) setDone(true);
    else setMessage(j.reason === 'slot_taken' ? 'Это время занято, выберите другое.' : j.reason === 'too_late' ? 'Перенос уже недоступен онлайн.' : 'Не удалось перенести.');
  }

  if (done) return <p className="mt-6 rounded-md bg-[#f5f5f5] p-4">Запись перенесена.</p>;

  return (
    <div className="mt-6 grid gap-3">
      <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Новая дата" />
      <div className="flex flex-wrap gap-2">
        {slots.map((iso) => (
          <button key={iso} type="button" aria-pressed={picked === iso} onClick={() => setPicked(iso)}
            className={`h-11 rounded-md border px-3 ${picked === iso ? 'border-transparent text-white' : 'border-[#e5e5e5]'}`}
            style={picked === iso ? { background: 'var(--brand-color)' } : undefined}>
            {new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}
          </button>
        ))}
      </div>
      {date && slots.length === 0 && <p className="text-[14px] text-[#666666]">Свободного времени нет.</p>}
      {message && <p role="alert" className="text-[#dc2626]">{message}</p>}
      <button type="button" className="btn-primary" disabled={!picked} onClick={submit}>Перенести</button>
    </div>
  );
}
