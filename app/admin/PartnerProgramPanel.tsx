'use client';

// app/admin/PartnerProgramPanel.tsx — настройки партнёрской программы в супер-админке.
// Процент бонуса наставнику (второй уровень) и шаблоны первого сообщения по нишам.
import { useEffect, useState } from 'react';
import { getPartnerProgramAction, savePartnerProgramAction, type PartnerProgramSettings } from '@/app/admin/platform-actions';

const NICHES: { key: string; label: string }[] = [
  { key: 'detailing', label: 'Детейлинг' },
  { key: 'auto-service', label: 'Автосервис' },
  { key: 'tire-service', label: 'Шиномонтаж' },
  { key: 'barbershop', label: 'Барбершоп' },
  { key: 'sauna', label: 'Сауна / баня' },
  { key: 'manicure', label: 'Маникюр' },
  { key: 'dentistry', label: 'Стоматология' },
  { key: 'vet', label: 'Ветклиника' },
  { key: 'cleaning', label: 'Клининг' },
  { key: 'photographer', label: 'Фотограф' },
  { key: 'tutor', label: 'Репетитор' },
];

const VARS = '{name} — сервис, {city} — город, {niche} — ниша, {link} — ссылка на сайт, {partner} — имя партнёра';

export function PartnerProgramPanel({ push }: { push: (m: string, k?: 'success' | 'error' | 'info') => void }) {
  const [value, setValue] = useState<PartnerProgramSettings>({ percent: 10, templates: {} });
  const [niche, setNiche] = useState('detailing');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    getPartnerProgramAction().then((r) => { if (alive) setValue(r.value); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await savePartnerProgramAction(value);
      if (!res.ok) push(res.error ?? 'Не удалось сохранить', 'error');
      else { push('Настройки партнёрской программы сохранены', 'success'); setDirty(false); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-brand-border bg-brand-surface p-4">
      <h3 className="text-body font-semibold text-brand-text">Настройки партнёрской программы</h3>
      <p className="mt-1 text-caption text-brand-text-muted">
        Бонус наставнику платит платформа — из комиссии приведённого партнёра ничего не вычитается.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-caption text-brand-text-muted">
          Процент бонуса за приведённого партнёра
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={value.percent}
            onChange={(e) => { setValue((v) => ({ ...v, percent: Number(e.target.value) })); setDirty(true); }}
            className="w-28 rounded-xl border border-brand-border bg-black/20 px-3 py-2 text-body-sm text-brand-text"
          />
        </label>
        <span className="pb-2 text-caption text-brand-text-subtle">% от начислений партнёра, пока он их получает</span>
      </div>

      <div className="mt-5 border-t border-brand-border pt-4">
        <h4 className="text-body-sm font-semibold text-brand-text">Текст первого сообщения</h4>
        <p className="mt-1 text-caption text-brand-text-muted">Партнёр копирует его кнопкой «Текст» в таблице готовых сервисов.</p>
        <p className="mt-1 text-caption text-brand-text-subtle">{VARS}</p>

        <div className="mt-3 flex flex-wrap gap-1">
          {NICHES.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setNiche(n.key)}
              aria-pressed={niche === n.key}
              className={`rounded-full px-3 py-1.5 text-caption transition-colors ${niche === n.key ? 'bg-brand-accent/20 text-brand-accent' : 'border border-brand-border text-brand-text-muted hover:text-brand-text'}`}
            >{n.label}</button>
          ))}
        </div>

        <textarea
          key={niche}
          value={value.templates[niche] ?? ''}
          onChange={(e) => { setValue((v) => ({ ...v, templates: { ...v.templates, [niche]: e.target.value } })); setDirty(true); }}
          placeholder="Оставьте пустым, чтобы использовать встроенный текст по умолчанию"
          rows={4}
          className="mt-3 w-full rounded-xl border border-brand-border bg-black/20 px-3 py-2 text-body-sm text-brand-text"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !dirty} className="btn-primary press text-body-sm disabled:opacity-50">
          {busy ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
        {!dirty && <span className="text-caption text-brand-text-subtle">Изменений нет</span>}
      </div>
    </section>
  );
}
