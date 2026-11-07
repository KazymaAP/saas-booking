'use client';

// app/partner/ready-panel.tsx — готовые сервисы у партнёра, в стиле супер-админки.
// Партнёр видит одобренные сервисы, берёт (макс 5 в процессе), отмечает «написал»;
// через 3 дня — выбор итога «отказался» / «не ответил». Данные только из БД.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { takeReadyServiceAction, setOutcomeAction, setPartnerCoverAction, listReadyPhotosAction, setReadyPhotosAction } from './ready-actions';
import type { ReadyService, ReadyPhotoOptions } from '@/lib/ready-services';

type Message = { id: string; body: string; from_admin: boolean; created_at: string };

function daysLeft(r: ReadyService): number | null {
  if (!r.taken_at) return null;
  const elapsed = (Date.now() - Date.parse(r.taken_at)) / (24 * 60 * 60 * 1000);
  return Math.ceil(3 - elapsed);
}

function Contacts({ r }: { r: ReadyService }) {
  return (
    <div className="text-caption text-brand-text-subtle">
      {r.phone && <div>Тел: <a className="text-brand-accent hover:underline" href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a></div>}
      {r.email && <div>Email: <a className="text-brand-accent hover:underline" href={`mailto:${r.email}`}>{r.email}</a></div>}
      {(r.city || r.address) && <div>{[r.city, r.address].filter(Boolean).join(', ')}</div>}
    </div>
  );
}

// Названия ниш для колонки «Сервис»: партнёр не обязан знать внутренние slug'и.
const NICHE_LABELS: Record<string, string> = {
  detailing: 'Детейлинг',
  'auto-service': 'Автосервис',
  'tire-service': 'Шиномонтаж',
  barbershop: 'Барбершоп',
  sauna: 'Сауна / баня',
  manicure: 'Маникюр',
  dentistry: 'Стоматология',
  vet: 'Ветклиника',
  cleaning: 'Клининг',
  photographer: 'Фотограф',
  tutor: 'Репетитор',
};

/** Оценка из выгрузки парсера, если она там есть. */
function ratingOf(r: ReadyService): string | null {
  // В выгрузке парсера отзывы лежат в `reviews`, в базе бизнеса — в reviews_count.
  const p = (r.payload ?? {}) as { rating?: number | string; reviews?: number | string; reviews_count?: number | string };
  const rating = Number(p.rating);
  const reviews = Number(p.reviews ?? p.reviews_count);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return Number.isFinite(reviews) && reviews > 0 ? `${rating.toFixed(1)} · ${reviews} отз.` : rating.toFixed(1);
}

export function PartnerReadyPanel({
  available, mine, overdue, inProcessCount, messages, outreach,
}: {
  available: ReadyService[];
  mine: ReadyService[];
  overdue: ReadyService[];
  inProcessCount: number;
  messages: Message[];
  /** Готовый текст первого сообщения по каждому сервису (id → текст). */
  outreach: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<{ id: string; name: string; options: ReadyPhotoOptions | null } | null>(null);

  async function openPhotos(id: string) {
    const row = available.find((r) => r.id === id) ?? mine.find((r) => r.id === id);
    setPhotoFor({ id, name: row?.name ?? 'Сервис', options: null });
    const res = await listReadyPhotosAction(id);
    if (res.ok) setPhotoFor((cur) => (cur && cur.id === id ? { ...cur, options: res.data } : cur));
    else { setPhotoFor(null); setErr(res.error); }
  }

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(id);
    setErr(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) setErr(res.error ?? 'Не удалось выполнить действие');
    else router.refresh();
  };

  const inProcess = mine.filter((r) => r.assignment_status === 'in_process');
  const written = mine.filter((r) => r.assignment_status === 'written');

  return (
    <div className="space-y-5">
      {err && <div className="rounded-2xl border border-brand-error/40 bg-brand-error/10 px-4 py-2 text-body-sm text-brand-error">{err}</div>}

      {overdue.length > 0 && (
        <section className="rounded-3xl border border-brand-accent/40 bg-brand-accent/[0.06] p-5">
          <h2 className="text-heading-sm">Прошло 3 дня — выберите итог</h2>
          <p className="mt-1 text-caption text-brand-text-muted">Пока не выберете категорию, сервис остаётся у вас. После выбора он вернётся в общую таблицу.</p>
          <div className="mt-3 space-y-2">
            {overdue.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-body-sm">{r.name}</div>
                  <div className="truncate text-caption text-brand-text-subtle">{r.niche} · {r.phone ?? 'нет телефона'}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy === r.id} onClick={() => run(r.id, () => setOutcomeAction(r.id, 'refused'))} className="btn-ghost px-2 py-1 text-caption text-brand-error">Отказался</button>
                  <button type="button" disabled={busy === r.id} onClick={() => run(r.id, () => setOutcomeAction(r.id, 'no_answer'))} className="btn-secondary press text-caption">Не ответил</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {messages.length > 0 && (
        <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
          <h2 className="text-heading-sm">Сообщения от платформы</h2>
          <ul className="mt-3 space-y-1.5">
            {messages.slice(0, 5).map((m) => (
              <li key={m.id} className="rounded-2xl border border-white/[0.06] px-3 py-2 text-caption text-brand-text-muted">
                <span className="text-brand-text-subtle">{new Date(m.created_at).toLocaleString('ru-RU')}: </span>{m.body}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading-sm">В процессе</h2>
          <span className={`text-caption ${inProcessCount >= 5 ? 'text-brand-error' : 'text-brand-text-subtle'}`}>{inProcessCount} / 5</span>
        </div>
        <p className="mt-1 text-caption text-brand-text-muted">Возьмите сервис, напишите предпринимателю и отметьте «Написал». Одновременно можно держать не более 5.</p>

        {inProcess.length === 0 ? (
          <p className="mt-3 rounded-3xl border border-brand-border bg-brand-surface px-4 py-3 text-body-sm text-brand-text-muted">
            Пока нет сервисов в работе — возьмите из таблицы ниже.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {inProcess.map((r) => {
              const left = daysLeft(r);
              return (
                <div key={r.id} className="rounded-3xl border border-brand-border bg-brand-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-body-sm font-medium">{r.name}</div>
                    <span className={`shrink-0 text-caption ${left !== null && left <= 0 ? 'text-brand-error' : 'text-brand-text-subtle'}`}>
                      {left !== null ? (left > 0 ? `осталось ${left} дн.` : 'срок истёк') : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 text-caption text-brand-text-subtle">{r.niche}</div>
                  <div className="mt-2"><Contacts r={r} /></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.business_id && (
                      <a href={`/${r.niche}/${r.slug}`} target="_blank" rel="noreferrer" className="btn-secondary press text-caption">Посмотреть сайт</a>
                    )}
                    <button type="button" disabled={busy === r.id} onClick={() => run(r.id, () => setOutcomeAction(r.id, 'written'))} className="btn-primary press text-caption disabled:opacity-50">Написал</button>
                    <button type="button" disabled={busy === r.id} onClick={() => run(r.id, () => setOutcomeAction(r.id, 'refused'))} className="btn-ghost px-2 py-1 text-caption text-brand-error">Отказался</button>
                    <button type="button" disabled={busy === r.id} onClick={() => run(r.id, () => setOutcomeAction(r.id, 'no_answer'))} className="btn-ghost px-2 py-1 text-caption">Не ответил</button>
                    {r.business_id && (
                      <>
                        <button type="button" disabled={busy === r.id} onClick={() => run(r.id, () => setPartnerCoverAction(r.id, true))} className="btn-ghost px-2 py-1 text-caption">Без фото</button>
                        <button type="button" disabled={busy === r.id} onClick={() => run(r.id, () => setPartnerCoverAction(r.id, false))} className="btn-ghost px-2 py-1 text-caption">Вернуть фото</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {written.length > 0 && (
        <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
          <h2 className="text-heading-sm">Написал</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {written.map((r) => (
              <span key={r.id} className="rounded-full border border-brand-success/30 bg-brand-success/10 px-3 py-1 text-caption text-brand-success">{r.name}</span>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-heading-sm">Готовые сервисы</h2>
            <p className="mt-1 text-caption text-brand-text-muted">
              Одобренные платформой сайты. Видны всем партнёрам, пока сервис не взяли в работу.
            </p>
          </div>
          <span className="text-caption text-brand-text-subtle">доступно: {available.length}</span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-3xl border border-brand-border bg-brand-surface">
          <table className="w-full min-w-[900px] text-left text-body-sm">
            <thead className="text-caption uppercase tracking-wide text-brand-text-subtle">
              <tr>
                <th className="px-4 py-3">Сервис</th>
                <th className="px-4 py-3">Город</th>
                <th className="px-4 py-3">Контакты</th>
                <th className="px-4 py-3">Оценка</th>
                <th className="px-4 py-3">История</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {available.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-body-sm text-brand-text-muted">Пока нет доступных сервисов — платформа ещё не одобрила.</td></tr>
              )}
              {available.map((r) => (
                <tr key={r.id} className="border-t border-white/[0.06] align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-caption text-brand-text-subtle">{NICHE_LABELS[r.niche] ?? r.niche}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-text-muted">{r.city ?? '—'}</td>
                  <td className="px-4 py-3"><Contacts r={r} /></td>
                  <td className="px-4 py-3 text-brand-text-muted">
                    {ratingOf(r) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-caption text-brand-text-subtle">
                    {r.refusal_count > 0 && <div>отказался {r.refusal_count} раз</div>}
                    {r.no_answer_count > 0 && <div>не ответил {r.no_answer_count} раз</div>}
                    {r.refusal_count === 0 && r.no_answer_count === 0 && <span>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.business_id && <a href={`/${r.niche}/${r.slug}`} target="_blank" rel="noreferrer" className="btn-secondary press text-caption">Открыть</a>}
                      <CopyText text={outreach[r.id] ?? ''} />
                      {r.business_id && (
                        <button type="button" onClick={() => openPhotos(r.id)} className="btn-ghost px-2 py-1 text-caption">Фото</button>
                      )}
                      <button
                        type="button"
                        disabled={busy === r.id || inProcessCount >= 5}
                        onClick={() => run(r.id, () => takeReadyServiceAction(r.id))}
                        className="btn-primary press text-caption disabled:opacity-50"
                      >Взять</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {photoFor && (
        <PhotoDialog
          id={photoFor.id}
          name={photoFor.name}
          options={photoFor.options}
          onClose={() => setPhotoFor(null)}
          onSaved={() => { setPhotoFor(null); router.refresh(); }}
        />
      )}

    </div>
  );
}

/** Кнопка «Скопировать текст»: готовое первое сообщение предпринимателю. */
function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" onClick={copy} className="btn-ghost px-2 py-1 text-caption" title={text}>
      {copied ? 'Скопировано' : 'Текст'}
    </button>
  );
}

/**
 * Выбор фото готового сервиса: слева — что стоит на сайте сейчас, справа — из чего выбрать
 * (фото сервиса из выгрузки парсера + шаблонная обложка). Порядок выбора = порядок в галерее.
 */
function PhotoDialog({
  id, name, options, onClose, onSaved,
}: {
  id: string;
  name: string;
  options: ReadyPhotoOptions | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = options?.current.map((p) => p.url) ?? [];
  const chosen = selected ?? current;

  function toggle(url: string) {
    setSelected((prev) => {
      const list = prev ?? current;
      return list.includes(url) ? list.filter((u) => u !== url) : [...list, url];
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await setReadyPhotosAction(id, chosen);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Фото сервиса ${name}`}>
      <div className="max-h-[85vh] w-full max-w-[720px] overflow-y-auto rounded-3xl border border-white/[0.10] bg-brand-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-heading-sm">Фото: {name}</h2>
            <p className="mt-1 text-caption text-brand-text-muted">
              Отметьте фото — они появятся на сайте в порядке выбора. Первое станет обложкой.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-2 py-1 text-caption">Закрыть</button>
        </div>

        {error && <div className="mt-3 rounded-2xl border border-brand-error/40 bg-brand-error/10 px-3 py-2 text-caption text-brand-error">{error}</div>}

        {!options ? (
          <p className="mt-4 text-body-sm text-brand-text-muted">Загружаем фото…</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.candidates.map((c) => {
                const active = chosen.includes(c.url);
                const order = chosen.indexOf(c.url) + 1;
                return (
                  <button
                    key={c.url}
                    type="button"
                    onClick={() => toggle(c.url)}
                    aria-pressed={active}
                    className={`relative overflow-hidden rounded-2xl border text-left transition-colors ${active ? 'border-brand-accent' : 'border-white/[0.08] hover:border-white/25'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt="" className="h-28 w-full object-cover" loading="lazy" />
                    <span className="block px-2 py-1 text-caption text-brand-text-muted">{c.label}</span>
                    {active && (
                      <span className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-brand-accent text-caption font-semibold text-brand-accent-on">{order}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={save} disabled={saving || chosen.length === 0} className="btn-primary press text-caption disabled:opacity-50">
                {saving ? 'Сохраняем…' : 'Сохранить фото'}
              </button>
              <span className="text-caption text-brand-text-subtle">выбрано: {chosen.length}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
