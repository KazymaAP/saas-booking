'use client';
// settings/AppearancePicker.tsx — выбор стиля кабинета и сайта.
// 10 стилей с нейтральными названиями («Графит», «Пудра»): арендатор не должен догадываться,
// что это палитры других ниш. «Как сайт» — стиль своей ниши, он же по умолчанию.
import { useState, useTransition } from 'react';
import { AUTO_KEY, APPEARANCES, type Appearance } from '@/lib/appearance';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { saveAppearance } from './appearance-actions';

function Swatch({ item, active, onPick }: { item: Appearance | null; active: boolean; onPick: () => void }) {
  const label = item ? item.label : 'Как сайт';
  const mode = item ? (item.mode === 'dark' ? 'тёмный' : 'светлый') : 'по нише';
  const bg = item?.bg ?? 'linear-gradient(135deg,#f3f3f3 50%,#dcdcdc 50%)';
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`group flex items-center gap-2 rounded-[10px] border p-2 text-left transition-colors ${
        active ? 'border-[var(--brand-color)] bg-[var(--soft)]' : 'border-[var(--line)] hover:bg-[var(--soft)]'
      }`}
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--line)]"
        style={{ background: bg }}
      >
        {item ? <span className="size-3 rounded-full" style={{ background: item.accent }} /> : <span className="text-[11px] text-[#666]">авто</span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="block text-[11px] text-[var(--muted)]">{mode}</span>
      </span>
    </button>
  );
}

export function AppearancePicker({
  slug,
  panelTheme,
  siteTheme,
}: {
  slug: string;
  panelTheme: string;
  siteTheme: string;
}) {
  const toast = useToast();
  const [panel, setPanel] = useState(panelTheme);
  const [site, setSite] = useState(siteTheme);
  const [pending, startTransition] = useTransition();
  const dirty = panel !== panelTheme || site !== siteTheme;

  function save() {
    startTransition(async () => {
      const res = await callAction(() => saveAppearance(slug, { panel, site }));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? 'Стиль сохранён');
    });
  }

  return (
    <section className="card grid gap-4">
      <div>
        <h2 className="!mb-1">Оформление</h2>
        <p className="!mb-0 text-[13px] text-[var(--muted)]">
          Стиль кабинета и сайта можно выбрать отдельно. По умолчанию — оформление вашей ниши.
        </p>
      </div>

      <div className="grid gap-2">
        <h3 className="!mb-1">Кабинет</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Swatch item={null} active={panel === AUTO_KEY} onPick={() => setPanel(AUTO_KEY)} />
          {APPEARANCES.map((a) => (
            <Swatch key={a.key} item={a} active={panel === a.key} onPick={() => setPanel(a.key)} />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="!mb-1">Сайт-визитка</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Swatch item={null} active={site === AUTO_KEY} onPick={() => setSite(AUTO_KEY)} />
          {APPEARANCES.map((a) => (
            <Swatch key={a.key} item={a} active={site === a.key} onPick={() => setSite(a.key)} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={!dirty || pending} className="btn-primary">
          {pending ? 'Сохраняем…' : 'Сохранить стиль'}
        </button>
        {!dirty && <span className="text-[12px] text-[var(--muted)]">Изменений нет</span>}
      </div>
    </section>
  );
}
