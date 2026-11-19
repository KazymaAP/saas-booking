// шаблоны/_shared/theme-for.ts — одна точка получения темы сайта для всех страниц витрины.
// Витрина и «Моя запись» должны крашиться одинаково: раньше логика наложения
// пользовательского стиля жила только в app/[prefix]/[slug]/page.tsx, а служебные
// страницы рисовали себя жёстко синими.
import { appearanceByKey, SITE_THEME_KEY } from '@/lib/appearance';
import type { NicheTheme } from './niche-tenant';
import { getNicheTheme, getNicheThemeBySlug } from './themes';

export function resolveSiteTheme(params: {
  prefix: string;
  templateSlug?: string | null;
  texts?: Record<string, string> | null;
  brandColor?: string | null;
}): NicheTheme | null {
  const base = getNicheTheme(params.prefix) ?? (params.templateSlug ? getNicheThemeBySlug(params.templateSlug) : null);
  if (!base) return null;
  const texts = params.texts ?? {};
  const override = appearanceByKey(texts[SITE_THEME_KEY]);
  if (!override) return base;
  return {
    ...base,
    mode: override.mode,
    bg: override.bg,
    surface: override.surface,
    border: override.line,
    borderHover: override.line,
    text: override.ink,
    textMuted: override.muted,
    textSubtle: override.muted,
    accent: params.brandColor || override.accent,
  };
}
