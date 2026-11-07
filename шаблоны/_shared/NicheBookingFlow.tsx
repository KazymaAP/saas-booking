'use client';
// шаблоны/_shared/NicheBookingFlow.tsx — универсальный 4-шаговый визард записи.
// Порт DetailingBookingFlow: шаг «данные» использует tenant.detailField (метка/плейсхолдер/
// валидация берутся из темы ниши), а копирайт — tenant.businessNoun. Один визард на все ниши.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarPlus, CalendarX, Check, Copy } from '@phosphor-icons/react';
import { formatPhoneMask } from '@/lib/phone';
import { formatSlotDateTime, formatSlotTime } from '@/lib/slots';
import { dateBounds, dateOptions, firstOpenDate, isDateInBounds, resolveSchedule } from '@/lib/booking-dates';
import { useSlots } from '@/lib/use-slots';
import { browserBookingClient } from '@/lib/booking-client';
import {
  bookingFormSchema,
  nameSchema,
  phoneSchema,
  PRIVACY_VERSION,
  type BookingCreated,
} from '@/lib/schemas';
import { formatCurrency, formatDuration, type NicheTenant } from './niche-tenant';
import type { WorkingHours } from '@/lib/database.types';

type Step = 'service' | 'datetime' | 'details' | 'review' | 'done';
const STEPS: Exclude<Step, 'done'>[] = ['service', 'datetime', 'details', 'review'];
const TITLES: Record<Exclude<Step, 'done'>, string> = {
  service: 'Услуга',
  datetime: 'Дата и время',
  details: 'Ваши данные',
  review: 'Проверьте запись',
};

function toSaasHours(t: NicheTenant): WorkingHours {
  const arr = (d: { open: string; close: string } | null) => (d ? [{ open: d.open, close: d.close }] : null);
  return {
    mon: arr(t.workHours.monday),
    tue: arr(t.workHours.tuesday),
    wed: arr(t.workHours.wednesday),
    thu: arr(t.workHours.thursday),
    fri: arr(t.workHours.friday),
    sat: arr(t.workHours.saturday),
    sun: arr(t.workHours.sunday),
  };
}

const DAY_BY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
function dayKeyOf(date: string): keyof NicheTenant['workHours'] | null {
  const ms = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return DAY_BY_INDEX[new Date(ms).getUTCDay()] ?? null;
}
function minutesOf(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function StepBar({ step }: { step: Exclude<Step, 'done'> }) {
  const idx = STEPS.indexOf(step);
  return (
    <div className="step-bar" role="progressbar" aria-label="Шаг записи" aria-valuemin={1} aria-valuemax={4} aria-valuenow={idx + 1}>
      {STEPS.map((s, i) => (
        <span key={s} className={`step-bar__seg${i <= idx ? ' is-done' : ''}`} />
      ))}
    </div>
  );
}

export function NicheBookingFlow({
  tenant,
  prefix,
  slug,
  initialServiceId,
  onClose,
  onBusyChange,
  onBooked,
}: {
  tenant: NicheTenant;
  prefix: string;
  slug: string;
  initialServiceId?: string;
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
  onBooked?: () => void;
}) {
  const services = useMemo(() => tenant.services.filter((s) => s.isActive), [tenant.services]);
  const resolved = useMemo(
    () =>
      resolveSchedule({
        timeZone: tenant.timezone,
        minHoursBefore: Math.round(tenant.booking.minAdvanceMinutes / 60),
        maxDaysAhead: tenant.booking.advanceBookingDays,
        workingHours: toSaasHours(tenant),
      }),
    [tenant],
  );
  const [nowMs] = useState(() => Date.now());
  const options = useMemo(() => dateOptions(resolved, nowMs), [resolved, nowMs]);
  const bounds = useMemo(() => dateBounds(resolved, nowMs), [resolved, nowMs]);

  const detail = tenant.detailField;
  const prefill = initialServiceId ?? '';
  const [step, setStep] = useState<Step>(prefill ? 'datetime' : 'service');
  const [serviceId, setServiceId] = useState(prefill);
  const [date, setDate] = useState(() => (prefill ? firstOpenDate(options) : ''));
  const [startsAt, setStartsAt] = useState('');
  const [form, setForm] = useState({ name: '', phone: '+7', detail: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'phone' | 'detail', string>>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingCreated | null>(null);

  const slots = useSlots({ prefix, slug }, serviceId, date);
  const service = services.find((s) => s.id === serviceId);

  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStartsAt('');
  }, [serviceId, date]);

  const currentStep = step as Exclude<Step, 'done'>;
  const stepIdx = STEPS.indexOf(currentStep);

  const goBack = useCallback(() => {
    if (step === 'datetime') setStep('service');
    else if (step === 'details') setStep('datetime');
    else if (step === 'review') setStep('details');
    else if (step === 'done') onClose?.();
  }, [step, onClose]);

  const pickService = useCallback(
    (id: string) => {
      setServiceId(id);
      setDate(firstOpenDate(options));
      setStartsAt('');
      setStep('datetime');
    },
    [options],
  );

  const validateDetails = useCallback((): boolean => {
    const next: Partial<Record<'name' | 'phone' | 'detail', string>> = {};
    const name = nameSchema.safeParse(form.name.trim());
    if (!name.success) next.name = name.error.issues[0]?.message ?? 'Введите имя';
    const phone = phoneSchema.safeParse(form.phone);
    if (!phone.success) next.phone = phone.error.issues[0]?.message ?? 'Введите телефон';
    if (!detail.optional) {
      const v = form.detail.trim();
      if (detail.pattern && !new RegExp(detail.pattern).test(v)) {
        next.detail = detail.patternMessage ?? `Поле «${detail.label}» заполнено неверно`;
      } else if (!v) {
        next.detail = `Укажите ${detail.label.toLowerCase()}`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, detail]);

  const confirm = useCallback(async () => {
    if (submitting || !service || !date || !startsAt) return;
    const detailValue = form.detail.trim();
    const comment = detailValue ? `${detail.label}: ${detailValue}` : '';
    const payload = {
      prefix,
      slug,
      serviceId: service.id,
      date,
      startsAt,
      name: form.name.trim(),
      phone: form.phone,
      email: '',
      telegram: '',
      comment,
      privacyAccepted: true,
      privacyVersion: PRIVACY_VERSION,
    };
    const parsed = bookingFormSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? 'Проверьте данные записи');
      return;
    }
    setSubmitting(true);
    setServerError('');
    const res = await browserBookingClient().create(payload);
    setSubmitting(false);
    if (res.ok) {
      setResult(res.value);
      setStep('done');
      onBooked?.();
      return;
    }
    if (res.reason === 'slot_taken') {
      setStartsAt('');
      setStep('datetime');
      slots.reload();
      setServerError(res.message);
      return;
    }
    setServerError(res.message);
  }, [submitting, service, date, startsAt, prefix, slug, form, detail, slots, onBooked]);

  const tz = resolved.timeZone;
  const grid = useMemo(() => {
    if (!date || !service) return [] as { time: string; available: boolean }[];
    const key = dayKeyOf(date);
    const sched = key ? tenant.workHours[key] : null;
    if (!sched) return [];
    const open = minutesOf(sched.open);
    const close = minutesOf(sched.close);
    const step = tenant.slotStepMinutes > 0 ? tenant.slotStepMinutes : 30;
    const free = new Set(slots.state.kind === 'ready' ? slots.state.slots.map((iso) => formatSlotTime(iso, tz)) : []);
    const out: { time: string; available: boolean }[] = [];
    for (let m = open; m + service.durationMinutes <= close; m += step) {
      const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      out.push({ time, available: free.has(time) });
    }
    return out;
  }, [date, service, tenant.workHours, tenant.slotStepMinutes, slots.state, tz]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-heading-lg">{step === 'done' ? 'Готово' : TITLES[currentStep]}</h2>
          {step !== 'done' && (
            <p className="mt-1 text-caption text-brand-text-muted">
              Шаг {stepIdx + 1} из {STEPS.length}
            </p>
          )}
        </div>
        {step !== 'done' && (
          <button
            type="button"
            onClick={goBack}
            disabled={submitting}
            aria-label={step === 'service' ? 'Закрыть' : 'Назад'}
            className="grid size-9 place-items-center rounded-full text-brand-text-muted transition-colors hover:bg-brand-border-hover hover:text-brand-text disabled:opacity-50"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
        )}
      </div>
      {step !== 'done' && <StepBar step={currentStep} />}

      {service && step !== 'service' && step !== 'done' && (
        <div className="mt-4 flex items-center justify-between gap-3 text-body-sm">
          <span className="text-brand-text">{service.name}</span>
          <span className="text-brand-text-muted">{formatCurrency(service.price)}</span>
        </div>
      )}

      {step === 'service' && (
        <div className="mt-5 space-y-3">
          {services.map((s) => (
            <button key={s.id} type="button" onClick={() => pickService(s.id)} className="service-row">
              <div>
                <div className="text-heading-sm">{s.name}</div>
                <div className="mt-0.5 text-caption text-brand-text-muted">{formatDuration(s.durationMinutes)}</div>
              </div>
              <div className="ml-auto shrink-0 text-heading-sm">{formatCurrency(s.price)}</div>
            </button>
          ))}
        </div>
      )}

      {step === 'datetime' && (
        <div className="mt-5">
          <div className="flex gap-2">
            {options.slice(0, 7).map((o) => {
              const active = o.date === date;
              return (
                <button
                  key={o.date}
                  type="button"
                  aria-pressed={active}
                  aria-label={o.label}
                  disabled={o.closed}
                  onClick={() => setDate(o.date)}
                  className={`day-chip flex-1${active ? ' is-active' : ''}${o.closed ? ' opacity-50' : ''}`}
                >
                  <span className="text-caption">{o.weekday}</span>
                  <span className="text-heading-sm">{o.day}</span>
                </button>
              );
            })}
          </div>

          <label className="label mt-4" htmlFor="niche-other-date">
            Другая дата
          </label>
          <input
            id="niche-other-date"
            type="date"
            className="input"
            min={bounds.min}
            max={bounds.max}
            value={date}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || isDateInBounds(v, bounds)) setDate(v);
            }}
          />

          {date && (
            <div className="mt-5">
              {slots.state.kind === 'loading' ? (
                <p role="status" className="py-4 text-center text-body-sm text-brand-text-muted">
                  Загрузка свободного времени…
                </p>
              ) : slots.state.kind === 'error' ? (
                <div className="rounded-2xl border border-brand-border p-4 text-center">
                  <p role="alert" className="text-body-sm text-brand-text-muted">
                    {slots.state.message}
                  </p>
                  <button type="button" onClick={slots.reload} className="btn-secondary mt-3 text-body-sm">
                    Повторить
                  </button>
                </div>
              ) : grid.length === 0 ? (
                <div className="rounded-2xl border border-brand-border p-4 text-center">
                  <CalendarX size={28} weight="bold" className="mx-auto text-brand-text-subtle" />
                  <p className="mt-2 text-body-sm text-brand-text-muted">
                    На этот день {tenant.businessNoun} закрыт(а) или свободных окон нет. Выберите другую дату.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    {grid.map(({ time, available }) => {
                      const iso = slots.state.kind === 'ready' ? slots.state.slots.find((s) => formatSlotTime(s, tz) === time) : undefined;
                      const selected = !!iso && iso === startsAt;
                      return (
                        <button
                          key={time}
                          type="button"
                          disabled={!available}
                          aria-pressed={selected}
                          aria-label={`${time} — ${available ? 'свободно' : 'занято'}`}
                          onClick={() => { if (iso) setStartsAt(iso); }}
                          className={`time-chip${selected ? ' is-active' : ''}`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-caption text-brand-text-subtle">
                    {grid.some((g) => !g.available) ? 'Серые окна уже заняты. Выберите любое свободное время.' : 'Выберите любое свободное время.'}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {serverError && (
              <p role="alert" className="text-body-sm text-brand-error">
                {serverError}
              </p>
            )}
            <button type="button" disabled={!startsAt || slots.state.kind === 'loading'} onClick={() => setStep('details')} className="btn-primary w-full text-body-md">
              Продолжить <ArrowRight size={18} weight="bold" />
            </button>
            <button type="button" onClick={goBack} disabled={submitting} className="btn-ghost w-full text-body-sm">
              <ArrowLeft size={16} weight="bold" /> Назад
            </button>
          </div>
        </div>
      )}

      {step === 'details' && (
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (validateDetails()) setStep('review');
          }}
        >
          <div>
            <label className="label" htmlFor="niche-name">Имя</label>
            <input
              id="niche-name"
              className={`input${errors.name ? ' input-error' : ''}`}
              value={form.name}
              autoComplete="name"
              placeholder="Как вас зовут"
              aria-invalid={errors.name ? true : undefined}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {errors.name && <p className="mt-1 text-caption text-brand-error">{errors.name}</p>}
          </div>
          <div>
            <label className="label" htmlFor="niche-phone">Телефон</label>
            <input
              id="niche-phone"
              type="tel"
              inputMode="tel"
              className={`input${errors.phone ? ' input-error' : ''}`}
              value={form.phone}
              autoComplete="tel"
              placeholder="+7 999 123-45-67"
              aria-invalid={errors.phone ? true : undefined}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneMask(e.target.value) }))}
            />
            {errors.phone && <p className="mt-1 text-caption text-brand-error">{errors.phone}</p>}
          </div>
          <div>
            <label className="label" htmlFor="niche-detail">{detail.label}</label>
            <input
              id="niche-detail"
              className={`input${errors.detail ? ' input-error' : ''}`}
              value={form.detail}
              autoComplete="off"
              placeholder={detail.placeholder}
              aria-invalid={errors.detail ? true : undefined}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
            />
            {detail.hint && !errors.detail && <p className="mt-1 text-caption text-brand-text-subtle">{detail.hint}</p>}
            {errors.detail && <p className="mt-1 text-caption text-brand-error">{errors.detail}</p>}
          </div>
          {serverError && <p role="alert" className="text-body-sm text-brand-error">{serverError}</p>}
          <button type="submit" className="btn-primary w-full text-body-md">
            Проверить запись <ArrowRight size={18} weight="bold" />
          </button>
          <button type="button" onClick={goBack} disabled={submitting} className="btn-ghost w-full text-body-sm">
            <ArrowLeft size={16} weight="bold" /> Назад
          </button>
        </form>
      )}

      {step === 'review' && service && (
        <div className="mt-5 space-y-5">
          <dl className="space-y-2 text-body-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-brand-text-muted">Заезд</dt>
              <dd className="text-right">{formatSlotDateTime(startsAt, resolved.timeZone)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-brand-text-muted">Выдача, ориентир</dt>
              <dd className="text-right">
                {formatSlotDateTime(
                  new Date(Date.parse(startsAt) + service.durationMinutes * 60000).toISOString(),
                  resolved.timeZone,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-brand-text-muted">Стоимость</dt>
              <dd className="text-right">{formatCurrency(service.price)}</dd>
            </div>
          </dl>
          <div className="rounded-2xl border border-brand-border p-4 text-body-sm">
            <p>{form.name.trim()}{form.detail.trim() ? ` / ${form.detail.trim()}` : ''}</p>
            <p className="mt-1 text-brand-text-muted">{form.phone}</p>
            <p className="mt-2 text-brand-text-muted">{tenant.address}</p>
          </div>
          <p className="text-caption text-brand-text-subtle">
            Отмена онлайн не позднее чем за {tenant.booking.cancellationPolicy.freeUntilHoursBefore} ч до визита. Время {tenant.businessNoun}: {tenant.timezone}.
          </p>
          <label className="flex items-start gap-3 text-body-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-brand-accent" />
            <span>Передать эти данные {tenant.businessNoun} для оформления записи</span>
          </label>
          {serverError && <p role="alert" className="text-body-sm text-brand-error">{serverError}</p>}
          <button type="button" disabled={!consent || submitting} onClick={confirm} className="btn-primary w-full text-body-md">
            <Check size={18} weight="bold" /> Подтвердить запись
          </button>
          <button type="button" onClick={goBack} disabled={submitting} className="btn-ghost w-full text-body-sm">
            <ArrowLeft size={16} weight="bold" /> Назад
          </button>
        </div>
      )}

      {step === 'done' && result && (
        <div className="mt-6 text-center animate-scale-in">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-success/15 text-brand-success">
            <Check size={30} weight="bold" />
          </div>
          <p className="mt-3 text-heading-md">
            {result.status === 'confirmed' ? 'Запись подтверждена' : `${tenant.businessNoun} подтвердит заявку`}
          </p>
          <p className="mt-2 text-body-sm text-brand-text-muted">
            {service?.name} · {formatSlotDateTime(result.startsAt, resolved.timeZone)}
          </p>
          <div className="mt-4 break-all rounded-xl border border-brand-border bg-brand-surface p-3 text-caption text-brand-text-muted">
            {typeof window !== 'undefined'
              ? `${window.location.origin}/booking/cancel/${result.cancelToken}`
              : `/booking/cancel/${result.cancelToken}`}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (navigator.clipboard?.writeText) {
                  const url = `${window.location.origin}/booking/cancel/${result.cancelToken}`;
                  navigator.clipboard.writeText(url).catch(() => {});
                }
              }}
              className="btn-secondary text-body-sm"
              aria-live="polite"
            >
              <Copy size={18} weight="bold" /> Копировать ссылку
            </button>
            <a className="btn-secondary text-body-sm" href={`/booking/cancel/${result.cancelToken}`}>
              Моя запись
            </a>
            <a
              className="btn-secondary text-body-sm"
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics(result, service?.name ?? '', form.detail.trim(), tenant.address, service?.durationMinutes ?? 0))}`}
              download="booking.ics"
            >
              <CalendarPlus size={18} weight="bold" /> В календарь
            </a>
          </div>
          <p className="mt-3 text-caption text-brand-text-subtle">Сохраните ссылку — по ней можно посмотреть или отменить запись.</p>
        </div>
      )}
    </div>
  );
}

function ics(result: BookingCreated, serviceName: string, detail: string, address: string, durationMinutes: number): string {
  const dt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const desc = [serviceName, detail, address].filter(Boolean).join(' — ');
  const end = new Date(Date.parse(result.startsAt) + durationMinutes * 60000).toISOString();
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NicheBooking//Booking//RU', 'BEGIN:VEVENT',
    `UID:${result.bookingId}`, `DTSTART:${dt(result.startsAt)}`, `DTEND:${dt(end)}`, `SUMMARY:${serviceName}`,
    `DESCRIPTION:${desc}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
