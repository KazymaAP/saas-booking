// _components/Skeleton.tsx — обёртка скелетонов загрузки (ТЗ §13.12). Серверный, без JS.
// Видимым становится через 300 мс: при быстрых ответах скелетон не мелькает (промт: «Skeleton только если > 300мс»).
// Keyframes лежат здесь, а не в app/globals.css: глобальные стили — чужая зона.
const DELAYED_APPEAR = '@keyframes panel-skeleton-in{0%,99%{opacity:0}100%{opacity:1}}.panel-skeleton{animation:panel-skeleton-in 300ms linear both}@media (prefers-reduced-motion:reduce){.panel-skeleton .animate-pulse{animation:none}}';

export function SkeletonFrame({ label = 'Загрузка…', children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="panel-skeleton grid gap-4" aria-busy="true">
      <style>{DELAYED_APPEAR}</style>
      <span className="sr-only" role="status">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-[#f0f0f0] ${className}`} />;
}
