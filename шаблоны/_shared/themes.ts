// шаблоны/_shared/themes.ts — реестр тем ниш. Импортирует все пресеты и отдаёт
// тему по url-префиксу. Страница app/[prefix]/[slug]/page.tsx использует getNicheTheme().
import type { NicheTheme } from './niche-tenant';
import detailing from '../detailing/theme';
import beauty from '../beauty/theme';
import dentist from '../dentist/theme';
import fitness from '../fitness/theme';
import tutor from '../tutor/theme';
import photographer from '../photographer/theme';
import lawyer from '../lawyer/theme';
import vet from '../vet/theme';
import cleaning from '../cleaning/theme';
import repair from '../repair/theme';

export const ALL_NICHE_THEMES: NicheTheme[] = [
  detailing, beauty, dentist, fitness, tutor, photographer, lawyer, vet, cleaning, repair,
];

/** Тема ниши по url-префиксу ('d') ИЛИ по slug ниши ('detailing') — для URL /{ниша}/{slug}. */
export function getNicheTheme(prefix: string): NicheTheme | null {
  return ALL_NICHE_THEMES.find((t) => t.prefix === prefix || t.key === prefix) ?? null;
}

/** Тема ниши по slug (совпадает с template.json slug). */
export function getNicheThemeBySlug(slug: string): NicheTheme | null {
  return ALL_NICHE_THEMES.find((t) => t.key === slug) ?? null;
}
