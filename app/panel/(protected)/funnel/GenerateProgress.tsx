'use client';
// Шаг 2 воронки: генерация прототипов пачками с прогресс-баром (ТЗ §13.2, design-spec §7.5).
// ▸ Пачки по GENERATE_CHUNK идут последовательно (generateBatch), внутри пачки — параллельно на сервере.
// ▸ Пока идёт генерация, прогресс опрашивается раз в 2 секунды из БД (generationProgress) —
//   видно и то, что сгенерировано в другой вкладке.
// ▸ В конце — router.refresh(): серверные данные шагов 2–3 обновляются без перезагрузки страницы.
// ▸ Прогресс: role="progressbar" + aria-valuenow, итог и ошибки — в aria-live (ТЗ §19.6).
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateBatch, generationProgress } from './actions';
import { GENERATE_CHUNK, GENERATE_MAX, POLL_MS } from './constants';
import { useToast } from '@/главная/components/Toast';

type Item = { id: string; name: string };
type Phase = 'idle' | 'running' | 'done';

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Run = {
  phase: Phase;
  ready: Set<string>;
  failed: Set<string>;
  total: number;
  start: (ids: string[]) => void;
};

// Логика запуска: пачки последовательно, polling прогресса, итоговый тост и router.refresh().
function useGenerationRun(): Run {
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  // Состояние, а не ref: число в прогресс-баре должно перерисовываться вместе с запуском.
  const [runIds, setRunIds] = useState<string[]>([]);

  // Polling раз в 2 секунды, только пока идёт генерация.
  useEffect(() => {
    if (phase !== 'running') return undefined;
    let alive = true;
    const tick = () => {
      generationProgress(runIds).then((res) => {
        if (alive && res.ok) setReady((prev) => new Set([...prev, ...res.data.ready]));
      }, () => undefined);
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [phase, runIds]);

  const run = useCallback(async (ids: string[]) => {
    setRunIds(ids);
    setReady(new Set());
    setFailed(new Set());
    setPhase('running');
    const bad = new Set<string>();
    for (const part of chunks(ids, GENERATE_CHUNK)) {
      const res = await generateBatch(part).catch(() => ({ ok: false, message: 'Сервер не ответил', done: [], skipped: part }));
      setReady((prev) => new Set([...prev, ...res.done]));
      res.skipped.forEach((id) => bad.add(id));
      setFailed(new Set(bad));
    }
    setPhase('done');
    const okCount = ids.length - bad.size;
    toast.show(bad.size ? `Сгенерировано: ${okCount}. Не получилось: ${bad.size}` : `Сгенерировано: ${okCount}`, bad.size ? 'info' : 'success');
    router.refresh();
  }, [toast, router]);

  const start = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    run(ids).catch(() => setPhase('done'));
  }, [run]);

  return { phase, ready, failed, total: runIds.length, start };
}

// Выбор чекбоксами: по умолчанию выбраны все.
function useSelection(list: Item[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(list.map((i) => i.id)));
  const toggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const id = e.target.value;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === list.length ? new Set() : new Set(list.map((i) => i.id))));
  }, [list]);
  return { selected, toggle, toggleAll };
}

export function GenerateProgress({ items }: { items: Item[] }) {
  const uid = useId();
  const list = useMemo(() => items.slice(0, GENERATE_MAX), [items]);
  const { selected, toggle, toggleAll } = useSelection(list);
  const runState = useGenerationRun();
  const { phase, ready, failed, start } = runState;
  const nameOf = useMemo(() => new Map(list.map((i) => [i.id, i.name])), [list]);
  const onStart = useCallback(() => start(list.filter((i) => selected.has(i.id)).map((i) => i.id)), [start, list, selected]);

  if (list.length === 0) return <p className="text-[14px] text-[#666666]" role="status">Нет бизнесов «В работе». Возьмите их в работу на шаге 1.</p>;

  const running = phase === 'running';
  const total = runState.total || selected.size;
  const blocked = running || selected.size === 0;
  return (
    <div className="grid max-w-[640px] gap-3 text-[14px]">
      <fieldset disabled={running} className="m-0 grid gap-1 border-0 p-0">
        <legend className="mb-1 text-[#666666]">Кого генерировать ({selected.size} из {list.length})</legend>
        <label htmlFor={`${uid}-all`} className="inline-flex min-h-[44px] items-center gap-2 md:min-h-0">
          <input id={`${uid}-all`} type="checkbox" checked={selected.size === list.length} onChange={toggleAll} className="h-5 w-5" />
          Все
        </label>
        <ItemList uid={uid} list={list} selected={selected} ready={ready} failed={failed} onToggle={toggle} />
      </fieldset>

      <button type="button" className="btn-primary w-fit" onClick={onStart} disabled={blocked} aria-disabled={blocked}>
        {running ? `Генерация ${ready.size} из ${total}…` : `Сгенерировать для ${selected.size} выбранных`}
      </button>

      {phase !== 'idle' && <ProgressBar done={ready.size} total={total} running={running} />}
      {failed.size > 0 && (
        <p role="alert" className="m-0 text-[#dc2626]">
          Не получилось: {[...failed].map((id) => nameOf.get(id) ?? id).join(', ')}. Подробности — в «Логи → Ошибки».
        </p>
      )}
    </div>
  );
}

type ListProps = { uid: string; list: Item[]; selected: Set<string>; ready: Set<string>; failed: Set<string>; onToggle: (e: React.ChangeEvent<HTMLInputElement>) => void };

function ItemList({ uid, list, selected, ready, failed, onToggle }: ListProps) {
  return (
    <ul className="m-0 grid max-h-[220px] list-none gap-1 overflow-auto p-0">
      {list.map((i) => (
        <li key={i.id}>
          <label htmlFor={`${uid}-${i.id}`} className="inline-flex min-h-[44px] items-center gap-2 md:min-h-0">
            <input id={`${uid}-${i.id}`} type="checkbox" value={i.id} checked={selected.has(i.id)} onChange={onToggle} className="h-5 w-5" />
            {i.name}
            {ready.has(i.id) && <span className="text-[#16a34a]">— готово</span>}
            {failed.has(i.id) && <span className="text-[#dc2626]">— ошибка</span>}
          </label>
        </li>
      ))}
    </ul>
  );
}

function ProgressBar({ done, total, running }: { done: number; total: number; running: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <>
      <div
        role="progressbar"
        aria-label="Прогресс генерации"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} из ${total}`}
        className="h-2 w-full rounded bg-[#e5e5e5]"
      >
        <div className="h-2 rounded bg-[#111111] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p aria-live="polite" className="m-0 text-[#666666]">
        {running ? `Готово ${done} из ${total} (${pct}%)` : `Завершено: ${done} из ${total}`}
      </p>
    </>
  );
}
