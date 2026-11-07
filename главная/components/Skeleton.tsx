// Скелетон загрузки списка (design-spec §6). Серверный компонент: без JS.
// Появляется с задержкой 300 мс через animation-delay, чтобы быстрые ответы не мигали.
const ROW_KEYS = Array.from({ length: 20 }, (_, i) => `row-${i}`);

export function Skeleton({ rows = 6, label = 'Загрузка…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid gap-3 opacity-0 [animation:panel-skeleton-in_150ms_ease-out_300ms_forwards]">
      <span className="sr-only">{label}</span>
      <div className="h-7 w-[220px] animate-pulse rounded-md bg-[#f0f0f0]" />
      {ROW_KEYS.slice(0, rows).map((k) => (
        <div key={k} className="h-11 w-full animate-pulse rounded-md bg-[#f5f5f5]" />
      ))}
      <style>{'@keyframes panel-skeleton-in{to{opacity:1}}'}</style>
    </div>
  );
}
