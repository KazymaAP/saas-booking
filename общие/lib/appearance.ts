// общие/lib/appearance.ts — оформление кабинета и сайта: 10 готовых стилей.
//
// Зачем отдельный модуль: арендатор должен видеть свой кабинет «в своём стиле» — как сайт-визитку.
// По умолчанию берётся палитра его ниши, но в настройках он может выбрать любой из 10 стилей.
// Названия стилей НЕ раскрывают нишу («Графит», «Пудра») — это просто оформление.
//
// Значения хранятся в businesses.custom_texts под служебными ключами (`_panel_theme`, `_site_theme`),
// чтобы фича работала без отдельной миграции: форма текстов сливает ключи и служебные не теряет.

export type AppearanceMode = 'light' | 'dark';

export interface Appearance {
  key: string;
  label: string;
  mode: AppearanceMode;
  /** Фон страницы. */
  bg: string;
  /** Карточки и поля. */
  surface: string;
  /** Мягкая подложка (бейджи, подсказки). */
  soft: string;
  /** Границы. */
  line: string;
  /** Основной текст. */
  ink: string;
  /** Второстепенный текст (≥4.5:1 к surface). */
  muted: string;
  /** Акцент: кнопки, ссылки, активный пункт. */
  accent: string;
  /** Текст на акценте. */
  onAccent: string;
}

export const AUTO_KEY = 'auto';

// 10 стилей. Ключи совпадают с ключами тем ниш, чтобы «авто» находил стиль бизнеса по его нише.
export const APPEARANCES: readonly Appearance[] = [
  {
    key: 'detailing', label: 'Графит', mode: 'dark',
    bg: '#0a1020', surface: '#101a30', soft: '#16233d', line: '#1e2d4a',
    ink: '#f2f6ff', muted: '#9fb0cc', accent: '#3b82f6', onAccent: '#ffffff',
  },
  {
    key: 'beauty', label: 'Пудра', mode: 'light',
    bg: '#fff7fa', surface: '#ffffff', soft: '#fdf0f5', line: '#f3d7e3',
    ink: '#3a2230', muted: '#826573', accent: '#ec4899', onAccent: '#ffffff',
  },
  {
    key: 'dentist', label: 'Лёд', mode: 'light',
    bg: '#f5fbfd', surface: '#ffffff', soft: '#eef8fc', line: '#d8ebf2',
    ink: '#16323d', muted: '#567480', accent: '#06b6d4', onAccent: '#ffffff',
  },
  {
    key: 'fitness', label: 'Хаки', mode: 'dark',
    bg: '#07140d', surface: '#0d2116', soft: '#122b1d', line: '#1b3a28',
    ink: '#eafff2', muted: '#93b8a3', accent: '#22c55e', onAccent: '#04140a',
  },
  {
    key: 'tutor', label: 'Янтарь', mode: 'light',
    bg: '#fffaf0', surface: '#ffffff', soft: '#fdf5e6', line: '#f0e0c4',
    ink: '#3d2f16', muted: '#7a6c50', accent: '#f59e0b', onAccent: '#231a06',
  },
  {
    key: 'photographer', label: 'Ночь', mode: 'dark',
    bg: '#100a1a', surface: '#1a1026', soft: '#241636', line: '#2f1e45',
    ink: '#f6f0ff', muted: '#b0a0c8', accent: '#a855f7', onAccent: '#ffffff',
  },
  {
    key: 'lawyer', label: 'Строгий', mode: 'light',
    bg: '#f5f7fb', surface: '#ffffff', soft: '#eef2f9', line: '#dbe2ef',
    ink: '#1b2540', muted: '#5f6b85', accent: '#4f46e5', onAccent: '#ffffff',
  },
  {
    key: 'vet', label: 'Мята', mode: 'light',
    bg: '#f2fbf8', surface: '#ffffff', soft: '#e9f7f2', line: '#d3ece4',
    ink: '#17342c', muted: '#56766b', accent: '#14b8a6', onAccent: '#ffffff',
  },
  {
    key: 'cleaning', label: 'Свежесть', mode: 'light',
    bg: '#f3fbff', surface: '#ffffff', soft: '#eaf7fd', line: '#d3ebf7',
    ink: '#12303d', muted: '#567682', accent: '#38bdf8', onAccent: '#062331',
  },
  {
    key: 'repair', label: 'Терракота', mode: 'dark',
    bg: '#140a0a', surface: '#211010', soft: '#2b1616', line: '#3d1e1e',
    ink: '#fff2f2', muted: '#c2a0a0', accent: '#ef4444', onAccent: '#ffffff',
  },
] as const;

export const PANEL_THEME_KEY = '_panel_theme';
export const SITE_THEME_KEY = '_site_theme';

export function appearanceByKey(key: string | null | undefined): Appearance | null {
  if (!key || key === AUTO_KEY) return null;
  return APPEARANCES.find((a) => a.key === key) ?? null;
}

// Ниши в базе (vertical_templates.slug) не совпадают один-к-одному с ключами стилей:
// шаблонов 11, стилей 10. Здесь сопоставление «ниша → стиль по умолчанию».
const NICHE_TO_APPEARANCE: Record<string, string> = {
  detailing: 'detailing',
  'auto-service': 'repair',
  'tire-service': 'repair',
  barbershop: 'repair',
  sauna: 'fitness',
  manicure: 'beauty',
  dentistry: 'dentist',
  vet: 'vet',
  cleaning: 'cleaning',
  photographer: 'photographer',
  tutor: 'tutor',
};

/** Стиль по умолчанию для ниши (значение «авто»). */
export function appearanceByNiche(niche: string | null | undefined): Appearance | null {
  if (!niche) return null;
  const key = NICHE_TO_APPEARANCE[niche] ?? niche;
  return APPEARANCES.find((a) => a.key === key) ?? null;
}

const FALLBACK = APPEARANCES[1]; // «Пудра» — нейтральный светлый вариант, если ниша неизвестна.

/**
 * Итоговый стиль: явный выбор пользователя → иначе стиль ниши → иначе нейтральный светлый.
 * `chosen` — значение из custom_texts (`auto` или ключ стиля).
 */
export function resolveAppearance(chosen: string | null | undefined, niche: string | null | undefined): Appearance {
  return appearanceByKey(chosen) ?? appearanceByNiche(niche) ?? FALLBACK;
}

export type ThemeVars = Record<string, string>;

/** CSS-переменные для .panel-shell / оболочки сайта. */
export function appearanceVars(a: Appearance): ThemeVars {
  return {
    '--brand-color': a.accent,
    '--ink': a.ink,
    '--muted': a.muted,
    '--line': a.line,
    '--surface': a.surface,
    '--soft': a.soft,
    '--panel-bg': a.bg,
    '--on-accent': a.onAccent,
  };
}

/** Название стиля для интерфейса: «Авто (как сайт)» или нейтральное имя. */
export function appearanceLabel(chosen: string | null | undefined): string {
  if (!chosen || chosen === AUTO_KEY) return 'Как сайт';
  return appearanceByKey(chosen)?.label ?? 'Как сайт';
}
