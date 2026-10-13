'use client';
// components/OceanBackdrop.tsx — пиксельный фон карточки записи (перенесён из rabota).
// Оптимизация: рисуем через ImageData в низком разрешении (ячейка 8 px) и растягиваем на канвас.
// Частота кадров 8 fps: фон медленный, на телефоне нагрузки почти нет. Без движения, если пользователь выключил анимации.
import { useEffect, useRef } from 'react';

const CELL = 8;      // размер ячейки в пикселях канваса
const FPS_MS = 125;  // ~8 кадров в секунду

export function OceanBackdrop({ accent }: { accent: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d', { alpha: false });
    if (!ctx) return;
    const color = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
    const motion = matchMedia('(prefers-reduced-motion: reduce)');

    // Низкое разрешение: один пиксель = одна ячейка CELL×CELL
    let cols = 0, rows = 0;
    let image: ImageData | null = null;
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
      cols = Math.max(1, Math.ceil(w / CELL));
      rows = Math.max(1, Math.ceil(h / CELL));
      image = new ImageData(cols, rows);
    };

    const paint = (time: number) => {
      if (!image) return;
      const phase = motion.matches ? 0 : time / 8000;
      const data = image.data;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const wave = Math.sin(x / 9 + phase) * Math.cos(y / 11 - phase) + Math.sin((x + y) / 15 + phase);
          const gain = Math.max(0.04, (wave + 2) / 8);
          const i = (y * cols + x) * 4;
          data[i] = color[0] * gain;
          data[i + 1] = color[1] * gain;
          data[i + 2] = color[2] * gain;
          data[i + 3] = 255;
        }
      }
      // Растягиваем маленький буфер на весь канвас: один вызов вместо тысяч fillRect
      const tmp = scratch(cols, rows);
      tmp.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp.canvas, 0, 0, el.width, el.height);
    };

    // Временный канвас для растяжки (создаётся один раз на размер)
    let tmpCanvas: HTMLCanvasElement | null = null;
    let tmpCtx: CanvasRenderingContext2D | null = null;
    const scratch = (w: number, h: number) => {
      if (!tmpCanvas) tmpCanvas = document.createElement('canvas');
      if (tmpCanvas.width !== w) tmpCanvas.width = w;
      if (tmpCanvas.height !== h) tmpCanvas.height = h;
      tmpCtx = tmpCanvas.getContext('2d');
      return { canvas: tmpCanvas, putImageData: (img: ImageData, x: number, y: number) => tmpCtx?.putImageData(img, x, y) };
    };

    let frame = 0;
    let last = 0;
    let visible = true;
    const loop = (time: number) => {
      if (time - last >= FPS_MS) {
        last = time;
        paint(time);
      }
      if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(loop);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      if (visible && !document.hidden) frame = requestAnimationFrame(loop);
    };

    resize();
    paint(0);

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; restart(); });
    io.observe(el);
    const ro = new ResizeObserver(() => { resize(); paint(performance.now()); });
    ro.observe(el);
    document.addEventListener('visibilitychange', restart);
    motion.addEventListener('change', restart);
    restart();

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', restart);
      motion.removeEventListener('change', restart);
    };
  }, [accent]);
  return <canvas ref={canvas} className="ocean-backdrop" aria-hidden="true" />;
}
