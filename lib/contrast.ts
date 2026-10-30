// lib/contrast.ts — выбор текста поверх акцентного цвета бизнеса (WCAG 2.x).
// Возвращает чёрный или белый: тот, у которого контраст с фоном выше. Невалидный цвет → белый (прежнее поведение).

export type OnAccent = '#000' | '#fff';

function parseHex(hex: unknown): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const s = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) {
    return [0, 2, 4].map((i) => parseInt(s[i / 2] + s[i / 2], 16)) as [number, number, number];
  }
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function onAccentColor(hex: string | null | undefined): OnAccent {
  const rgb = parseHex(hex);
  if (!rgb) return '#fff';
  const L = luminance(rgb);
  const withWhite = 1.05 / (L + 0.05);
  const withBlack = (L + 0.05) / 0.05;
  return withBlack > withWhite ? '#000' : '#fff';
}
