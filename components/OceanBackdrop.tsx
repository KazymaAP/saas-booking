'use client';
// components/OceanBackdrop.tsx — пиксельный фон карточки записи, перенесён из rabota (src/components/OceanBackdrop.tsx).
// Без сети, учитывает prefers-reduced-motion и видимость (не рисует, когда не на экране).
import { useEffect, useRef } from 'react';

export function OceanBackdrop({ accent }: { accent: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d', { alpha: false });
    if (!el || !ctx) return;
    const color = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, visible = true, last = 0;
    const draw = (time: number) => {
      if (time - last < 80 && !motion.matches) { frame = requestAnimationFrame(draw); return; }
      last = time;
      const w = el.clientWidth, h = el.clientHeight;
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      ctx.fillStyle = '#080d16'; ctx.fillRect(0, 0, w, h);
      const phase = motion.matches ? 0 : time / 8000;
      for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) {
        const wave = Math.sin(x / 75 + phase) * Math.cos(y / 90 - phase) + Math.sin((x + y) / 120 + phase);
        const gain = Math.max(0.04, (wave + 2) / 8);
        ctx.fillStyle = `rgb(${color.map((c) => Math.round(c * gain)).join(',')})`;
        ctx.fillRect(x, y, 4, 4);
      }
      if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
    };
    const restart = () => { cancelAnimationFrame(frame); if (visible && !document.hidden) frame = requestAnimationFrame(draw); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; restart(); });
    observer.observe(el);
    const size = new ResizeObserver(restart); size.observe(el);
    document.addEventListener('visibilitychange', restart);
    motion.addEventListener('change', restart);
    restart();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      size.disconnect();
      document.removeEventListener('visibilitychange', restart);
      motion.removeEventListener('change', restart);
    };
  }, [accent]);
  return <canvas ref={canvas} className="ocean-backdrop" aria-hidden="true" />;
}
