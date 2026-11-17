// главная/components/GlassBackground.tsx — фон стеклянного стиля супер-админки.
// Слои: мягкий градиентный меш поверх фото + затемнение, чтобы стеклянные карточки читались.
// Фото: public/backgrounds/admin-bg.avif. Если файла нет, браузер просто покажет градиенты (без ошибки).
const BACKGROUND = [
  'radial-gradient(42% 52% at 12% 8%, rgba(56, 189, 248, 0.16), transparent 70%)',
  'radial-gradient(38% 48% at 88% 28%, rgba(139, 92, 246, 0.14), transparent 70%)',
  'linear-gradient(180deg, rgba(2, 6, 23, 0.55) 0%, rgba(2, 6, 23, 0.85) 100%)',
  "url('/backgrounds/admin-bg.avif')",
  'linear-gradient(180deg, #050914 0%, #020617 100%)',
].join(', ');

export function GlassBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: BACKGROUND, backgroundSize: 'auto, auto, auto, cover, auto', backgroundPosition: 'center' }}
    />
  );
}
