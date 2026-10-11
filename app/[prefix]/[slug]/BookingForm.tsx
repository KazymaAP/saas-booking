'use client';
// Форма брони (ТЗ §5.2): дата → свободное время из API → данные → согласие.
// Состояние на useState; react-hook-form по ТЗ добавим отдельным шагом.
import { useEffect, useState } from 'react';
import { formatPhoneMask } from '@/lib/phone';

type Props = { prefix: string; slug: string; services: { id: string; name: string }[] };
type Result = { ok: true } | { ok: false; message: string };

export function BookingForm({ prefix, slug, services }: Props) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [email, setEmail] = useState('');
  const [comment, setComment] = useState('');
  const [privacy, setPrivacy] = useState(false); // §7: не предзаполнен
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    setStartsAt(null);
    setSlots([]);
    if (!date || !serviceId) return;
    setSlotsLoading(true);
    const qs = new URLSearchParams({ prefix, slug, serviceId, date });
    fetch(`/api/bookings/slots?${qs}`)
      .then((r) => r.json())
      .then((j) => setSlots(j.ok ? j.slots : []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [date, serviceId, prefix, slug, refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startsAt) return setResult({ ok: false, message: 'Выберите время' });
    setBusy(true);
    setResult(null);
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, slug, serviceId, startsAt, date, name, phone, email, comment, privacyAccepted: privacy }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && json.ok) {
      setResult({ ok: true });
      return;
    }
    const messages: Record<string, string> = {
      slot_taken: 'Это время уже занято. Выберите другое.',
      rate_limited: 'Слишком много попыток. Попробуйте через 10 минут.',
      validation: 'Проверьте заполненные поля.',
      service_not_found: 'Услуга недоступна.',
      server: 'Не удалось сохранить запись. Попробуйте позже.',
    };
    setResult({ ok: false, message: messages[json.reason] ?? 'Ошибка' });
    if (json.reason === 'slot_taken') {
      setStartsAt(null);
      setRefresh((n) => n + 1); // перезагружаем список слотов
    }
  }

  if (result?.ok) return <p className="mt-4 rounded-md bg-[#f5f5f5] p-4">Заявка принята. Мы свяжемся с вами для подтверждения.</p>;

  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

  return (
    <form onSubmit={submit} className="mt-4 grid max-w-[520px] gap-3">
      <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Услуга">
        {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Дата" required />

      {slotsLoading && <p className="text-[14px] text-[#666666]">Загружаем свободное время…</p>}
      {date && !slotsLoading && slots.length === 0 && <p className="text-[14px] text-[#666666]">На эту дату свободного времени нет.</p>}
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Свободное время">
          {slots.map((iso) => (
            <button
              key={iso}
              type="button"
              aria-pressed={startsAt === iso}
              onClick={() => setStartsAt(iso)}
              className={`h-11 rounded-md border px-3 ${startsAt === iso ? 'border-transparent text-white' : 'border-[#e5e5e5]'}`}
              style={startsAt === iso ? { background: 'var(--brand-color)' } : undefined}
            >
              {timeLabel(iso)}
            </button>
          ))}
        </div>
      )}

      <input className="input" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="tel" className="input" value={phone} onChange={(e) => setPhone(formatPhoneMask(e.target.value))} aria-label="Телефон" required />
      <input type="email" className="input" placeholder="Email (необязательно)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <textarea className="input h-auto py-2" placeholder="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-1" />
        <span>Согласен на обработку персональных данных согласно политике конфиденциальности.</span>
      </label>
      {result && !result.ok && <p role="alert" className="text-[#dc2626]">{result.message}</p>}
      <button type="submit" className="btn-primary" disabled={busy || !privacy || !startsAt}>
        {busy ? 'Отправляем…' : 'Записаться'}
      </button>
    </form>
  );
}
