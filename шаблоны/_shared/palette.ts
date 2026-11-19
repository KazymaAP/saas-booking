// шаблоны/_shared/palette.ts — превращение NicheTheme в CSS-переменные.
// Вынесено из NicheSite, чтобы служебные страницы («Моя запись») красились тем же
// акцентом и режимом, что и витрина: раньше они были жёстко синими в тёмной теме,
// и салон красоты с розовым акцентом получал синюю кнопку и иконку машины.
import type { CSSProperties } from 'react';

export function hexToRgbTuple(hex: string): [number, number, number] {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return [70, 144, 255];
  return [r, g, b];
}

export function scaleRgb(rgb: [number, number, number], k: number): string {
  return rgb.map((v) => Math.round(v * k)).join(' ');
}

function channelLuminance(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastWithWhite(rgb: [number, number, number]): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

/** Затемняет акцент до тех пор, пока белый текст на нём не даст контраст ≥ 4.5:1. */
export function ensureWhiteContrast(rgb: [number, number, number], min = 4.5): [number, number, number] {
  for (let i = 16; i >= 1; i--) {
    const k = i * 0.05;
    const candidate: [number, number, number] = [Math.round(rgb[0] * k), Math.round(rgb[1] * k), Math.round(rgb[2] * k)];
    if (contrastWithWhite(candidate) >= min) return candidate;
  }
  return [0, 0, 0];
}

/** Минимум полей темы, из которых собирается палитра. */
export type PaletteInput = {
  accent: string;
  /** Второй тон; если не задан — берём основной акцент. */
  accent2?: string;
  mode: 'dark' | 'light';
  bg: string;
  surface: string;
  border: string;
  borderHover?: string;
  text: string;
  textMuted: string;
  textSubtle: string;
};

/** Полный набор CSS-переменных темы для корня .detailing-root. */
export function buildPalette(theme: PaletteInput): CSSProperties {
  const accentChannels = hexToRgbTuple(theme.accent);
  const accent2Channels = hexToRgbTuple(theme.accent2 ?? theme.accent);
  const accentSolid = ensureWhiteContrast(accentChannels);
  const t = (hex: string) => hexToRgbTuple(hex).join(' ');
  return {
    '--color-bg': t(theme.bg),
    '--color-surface': t(theme.surface),
    '--color-border': t(theme.border),
    '--color-border-hover': t(theme.borderHover ?? theme.border),
    '--color-text': t(theme.text),
    '--color-text-muted': t(theme.textMuted),
    '--color-text-subtle': t(theme.textSubtle),
    '--color-accent': accentChannels.join(' '),
    '--color-accent-2': accent2Channels.join(' '),
    // В светлых темах стандартный зелёный #22c55e даёт 2.3:1 на белом — статус «Открыто до…»
    // не читался. Для светлого режима берём тёмный зелёный (4.9:1), для тёмного оставляем прежний.
    '--color-success': theme.mode === 'light' ? '21 128 61' : '34 197 94',
    // Подсказки формы записи: один и тот же серый не проходит AA и на белом, и на тёмном,
    // поэтому цвет зависит от режима темы (см. booking-ui.tsx).
    '--booking-muted': theme.mode === 'light' ? '#595959' : '#a1a1aa',
    '--color-accent-solid': accentSolid.join(' '),
    '--color-accent-solid-hover': scaleRgb(accentSolid, 0.9),
  } as CSSProperties;
}
