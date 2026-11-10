// _lib/color.ts — акцентный цвет кабинета из brand_color бизнеса с гарантией контраста (WCAG AA, ТЗ §19.6).
// На акценте всегда белый текст (кнопки, бейджи). Светлый фирменный цвет (жёлтый, мятный) не даёт 4.5:1 —
// тогда затемняем его, сохраняя оттенок: кабинет узнаваем, а текст читается.
const HEX_RE = /^#[0-9a-f]{6}$/i;
export const DEFAULT_ACCENT = '#111111';
export const MIN_CONTRAST = 4.5;
const DARKEN_STEP = 0.9;
const MAX_STEPS = 30;

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

// Относительная яркость по WCAG 2.1.
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(toRgb(hex)) + 0.05);
}

export function accentColor(brand: string | null | undefined): string {
  if (!brand || !HEX_RE.test(brand)) return DEFAULT_ACCENT;
  let rgb = toRgb(brand);
  for (let i = 0; i < MAX_STEPS && contrastWithWhite(toHex(rgb)) < MIN_CONTRAST; i += 1) {
    rgb = [rgb[0] * DARKEN_STEP, rgb[1] * DARKEN_STEP, rgb[2] * DARKEN_STEP];
  }
  return toHex(rgb).toLowerCase();
}
