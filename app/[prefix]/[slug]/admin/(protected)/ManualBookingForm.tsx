'use client';

// ManualBookingForm.tsx — «Добавить запись вручную» на главной кабинета.
// Наш стиль (токены .panel-shell), наша схема данных; по смыслу повторяет блок из Детейленга.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './_components/Toast';
import { callAction } from './_lib/client-action';
import { createManualBookingAction } from './dashboard-actions';

type ServiceOption = { id: string; name: string; price: number };

/** Сегодня в поясе бизнеса: на сервере в UTC «ближайшая дата» может отличаться на день. */
function todayLocal(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function ManualBookingForm({
  slug, services, timeZone,
}: {
  slug: string;
  services: ServiceOption[];
  /** IANA-пояс бизнеса: дата и время формы относятся к нему, а не к часовому поясу сервера. */
  timeZone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    serviceId: services[0]?.id ?? '',
    date: todayLocal(timeZone),
    time: '10:00',
    name: '',
    phone: '',
    email: '',
    comment: '',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // защита от двойной отправки: повтор создал бы вторую запись
    if (!form.serviceId) { toast.error('Сначала добавьте услугу'); return; }
    setBusy(true);
    try {
      // Повтор здесь опасен: если сервер уже создал запись, но ответ потерялся, retry
      // запишет клиента второй раз. Обёртка callAction по умолчанию повторяет сетевые сбои.
      const res = await callAction(() => createManualBookingAction(slug, form), 0);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message ?? 'Запись добавлена');
      setForm((prev) => ({ ...prev, name: '', phone: '', email: '', comment: '' }));
      router.refresh();
    } finally {
      // Без finally падение callAction (сетевой сбой, digest у server action) навсегда
      // оставляло кнопку заблокированной — пользователь видел «кнопка не реагирует».
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="manual-booking-title" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 id="manual-booking-title">Добавить запись вручную</h2>
      <p className="!mb-0 text-[14px] text-[var(--muted)]">
        Для клиентов, которые записались по телефону. Такая запись сразу считается подтверждённой.
        Время указывается в часовом поясе бизнеса — {timeZone}.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] text-[var(--muted)]">
          Услуга
          <select name="serviceId" value={form.serviceId} onChange={set('serviceId')} required>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {Number(s.price).toLocaleString('ru-RU')} ₽</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[13px] text-[var(--muted)]">
          Дата
          <input name="date" type="date" value={form.date} onChange={set('date')} required />
        </label>
        <label className="grid gap-1 text-[13px] text-[var(--muted)]">
          Время
          <input name="time" type="time" value={form.time} onChange={set('time')} required />
        </label>
        <label className="grid gap-1 text-[13px] text-[var(--muted)]">
          Клиент
          <input name="name" type="text" value={form.name} onChange={set('name')} placeholder="Имя" maxLength={120} required />
        </label>
        <label className="grid gap-1 text-[13px] text-[var(--muted)]">
          Телефон
          <input name="phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+7 999 123-45-67" required />
        </label>
        <label className="grid gap-1 text-[13px] text-[var(--muted)]">
          Email (необязательно)
          <input name="email" type="email" value={form.email} onChange={set('email')} placeholder="client@example.ru" maxLength={200} />
        </label>
        <label className="grid gap-1 text-[13px] text-[var(--muted)] sm:col-span-2">
          Комментарий (необязательно)
          <textarea name="comment" value={form.comment} onChange={set('comment')} placeholder="Марка авто, пожелания…" maxLength={2000} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy || services.length === 0} className="btn-primary" aria-busy={busy}>
            {busy ? 'Добавляем…' : 'Добавить запись'}
          </button>
          {services.length === 0 && <span className="ml-3 text-[13px] text-[var(--muted)]">Сначала добавьте услуги</span>}
        </div>
      </form>
    </section>
  );
}
