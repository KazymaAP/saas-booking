// шаблоны/_shared/niche-tenant.ts — единый адаптер данных SaaS → форма NicheTenant.
// Один движок на все ниши: детейленг и ещё 9 ниш отличаются только пресетом (NicheTheme).
// Логика перенесена 1:1 из проекта «Детейленг» (форматтеры, getStudioStatus), но
// инфо-карточки, ресурсы, иконки и копирайт берутся из темы, а не захардкожены.
import type { Business, Service } from '@/lib/database.types';

export type IconKey =
  | 'car' | 'scissors' | 'tooth' | 'dumbbell' | 'book' | 'camera'
  | 'scales' | 'paw' | 'broom' | 'wrench' | 'sparkle' | 'flower'
  | 'heart' | 'stethoscope' | 'paint-brush' | 'drop' | 'hammer' | 'pen-nib'
  | 'clock' | 'shield' | 'calendar' | 'star' | 'users' | 'medal'
  | 'plant' | 'cpu' | 'baby' | 'dog' | 'cat';

export interface NicheInfoCard { id: string; title: string; description: string; icon: IconKey }
export interface NicheService {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  bufferMinutes: number;
  resourceIds: string[];
  isActive: boolean;
  sortOrder: number;
}
export type NicheResourceType = 'bay' | 'lift' | 'detailer' | 'mechanic' | 'master' | 'cabinet' | 'room' | 'other';
export interface NicheResource { id: string; name: string; type: NicheResourceType; isActive: boolean }
export interface NicheGalleryImage { id: string; url: string; caption: string; sortOrder: number }

export interface NicheDetailField {
  title: string;        // заголовок шага, напр. 'Ваш автомобиль'
  label: string;        // подпись поля, напр. 'Автомобиль'
  placeholder: string;
  optional?: boolean;
  pattern?: string;     // источник регэкспа для валидации (если не optional)
  patternMessage?: string;
  hint?: string;
  saveAs?: 'comment';
}

export interface NicheTheme {
  key: string;          // совпадает с template.json slug
  prefix: string;       // url-префикс (template.json urlPrefix)
  glyph: IconKey;       // логотип + дефолтная иконка услуги
  accent: string;       // основной акцент ниши (fallback, если у бизнеса нет brand_color)
  accent2?: string;     // второй тон для градиентов/свечения (двухцветная палитра)
  mode: 'dark' | 'light'; // тёмная или светлая база
  bg: string;            // фон страницы
  surface: string;       // поверхность карточек
  border: string;        // границы
  borderHover?: string;  // границы при наведении
  text: string;          // основной текст
  textMuted: string;     // приглушённый текст
  textSubtle: string;    // самый тихий текст
  businessNoun: string; // 'студия' / 'салон' / 'клиника' / 'заведение'
  tagline: string;
  intro: string;
  asideTitle: string;
  asideText: string;
  ctaPrimary: string;   // 'Записаться'
  ctaBook: string;      // 'Выбрать время'
  installTitle: string;
  installText: string;
  installCta: string;
  resourceLabel: string;// 'бокс' / 'мастер' / 'кабинет'
  resourceType: NicheResourceType;
  resourceCount?: number;
  infoCards: NicheInfoCard[];
  defaultServices?: { name: string; price: number; duration: number }[];
  detailField: NicheDetailField;
  serviceGlyph?: Record<string, IconKey>; // keyword -> иконка (доп. к дефолтным)
}

export interface NicheWorkHours {
  monday: { open: string; close: string; breaks?: { start: string; end: string }[] } | null;
  tuesday: { open: string; close: string; breaks?: { start: string; end: string }[] } | null;
  wednesday: { open: string; close: string; breaks?: { start: string; end: string }[] } | null;
  thursday: { open: string; close: string; breaks?: { start: string; end: string }[] } | null;
  friday: { open: string; close: string; breaks?: { start: string; end: string }[] } | null;
  saturday: { open: string; close: string; breaks?: { start: string; end: string }[] } | null;
  sunday: { open: string; close: string; breaks?: { start: string; end: string }[] } | null;
}

export interface NicheTenant {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  accentColor: string;
  accent2: string;
  mode: 'dark' | 'light';
  bg: string;
  surface: string;
  border: string;
  borderHover: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  logo: string;
  heroImage: string;
  workHours: NicheWorkHours;
  services: NicheService[];
  resources: NicheResource[];
  slotStepMinutes: number;
  infoCards: NicheInfoCard[];
  gallery: NicheGalleryImage[];
  booking: {
    advanceBookingDays: number;
    minAdvanceMinutes: number;
    cancellationPolicy: { freeUntilHoursBefore: number; penaltyPercent: number };
    requireConfirmation: boolean;
    allowGuestBooking: boolean;
  };
  notifications: { reminderHoursBefore: number[]; enablePush: boolean; enableEmail: boolean; enableSMS: boolean };
  seo: { title: string; description: string; ogImage: string };
  rating?: { score: number; reviews: number };
  // поля из темы (дисплей):
  businessNoun: string;
  glyph: IconKey;
  asideTitle: string;
  asideText: string;
  ctaPrimary: string;
  ctaBook: string;
  installTitle: string;
  installText: string;
  installCta: string;
  resourceLabel: string;
  detailField: NicheDetailField;
  serviceGlyph?: Record<string, IconKey>;
}

const DAY_MAP: Record<string, keyof NicheWorkHours> = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
};

function toWorkHours(hours: Business['working_hours']): NicheWorkHours {
  const out = {
    monday: null, tuesday: null, wednesday: null, thursday: null,
    friday: null, saturday: null, sunday: null,
  } as NicheWorkHours;
  if (!hours) return out;
  for (const [short, full] of Object.entries(DAY_MAP)) {
    const intervals = (hours as Record<string, { open: string; close: string }[] | null>)[short];
    const first = intervals?.[0];
    out[full] = first ? { open: first.open, close: first.close } : null;
  }
  return out;
}

function buildResources(theme: NicheTheme): NicheResource[] {
  const n = theme.resourceCount ?? 2;
  return Array.from({ length: n }, (_, i) => ({
    id: `${theme.resourceType}-${i + 1}`,
    name: `${i + 1}-й ${theme.resourceLabel}`,
    type: theme.resourceType,
    isActive: true,
  }));
}

// Общие ключевые слова → иконка (для подбора иконки услуги по названию).
const DEFAULT_SERVICE_GLYPH: Record<string, IconKey> = {
  wash: 'drop', мои: 'drop', чистк: 'drop', clean: 'drop', уборк: 'broom', клининг: 'broom', мыть: 'broom',
  hair: 'scissors', волос: 'scissors', стрижк: 'scissors', причёск: 'scissors', маник: 'pen-nib', педик: 'pen-nib', бров: 'pen-nib', ресниц: 'pen-nib', косметолог: 'sparkle', спа: 'flower', массаж: 'heart',
  полир: 'shield', блеск: 'shield', керам: 'shield', плёнк: 'shield', защит: 'shield', воск: 'shield', покрыти: 'shield',
  тренировк: 'dumbbell', фитнес: 'dumbbell', зал: 'dumbbell', йог: 'dumbbell', кроссфит: 'dumbbell', групп: 'users',
  урок: 'book', репетит: 'book', курс: 'book', лекц: 'book', подготовк: 'book', язык: 'book', математ: 'book',
  фотосесс: 'camera', фотосъёмк: 'camera', съёмк: 'camera', портрет: 'camera', видео: 'camera',
  консульт: 'scales', юрид: 'scales', правов: 'scales', иск: 'scales', договор: 'scales', сделк: 'scales',
  вет: 'paw', питом: 'paw', кот: 'paw', собак: 'paw', животн: 'paw', прививк: 'paw', чипиров: 'paw',
  зуб: 'tooth', терапевт: 'tooth', имплант: 'tooth', отбелив: 'tooth',
  ремонт: 'wrench', починк: 'wrench', настройк: 'wrench', установк: 'wrench', сборк: 'wrench', замен: 'wrench',
  лечени: 'stethoscope', терапи: 'stethoscope', приём: 'stethoscope', врач: 'stethoscope', диагност: 'stethoscope',
  дизайн: 'paint-brush', тату: 'paint-brush', интерьер: 'plant', ландшафт: 'plant',
};

export function pickServiceGlyph(name: string, opts: { glyph: IconKey; serviceGlyph?: Record<string, IconKey> }): IconKey {
  const hay = name.toLowerCase();
  if (opts.serviceGlyph) {
    for (const [kw, icon] of Object.entries(opts.serviceGlyph)) {
      if (hay.includes(kw.toLowerCase())) return icon;
    }
  }
  for (const [kw, icon] of Object.entries(DEFAULT_SERVICE_GLYPH)) {
    if (hay.includes(kw.toLowerCase())) return icon;
  }
  return opts.glyph;
}

export function buildNicheTenant(
  business: Business & { timezone?: string | null },
  services: Service[],
  photos: { url: string | null; alt: string | null }[],
  texts: Record<string, string> = {},
  theme: NicheTheme,
): NicheTenant {
  const heroImage = photos.find((p) => p.url)?.url ?? '';
  const gallery: NicheGalleryImage[] = photos
    .filter((p) => p.url && p.url !== heroImage)
    .map((p, i) => ({ id: `p${i}`, url: p.url!, caption: p.alt ?? '', sortOrder: i }));

  return {
    slug: business.slug,
    name: business.name,
    tagline: texts.hero_title || theme.tagline,
    description: business.description ?? theme.intro,
    phone: business.phones?.[0] ?? '',
    email: business.emails?.[0] ?? '',
    address: [business.city, business.address].filter(Boolean).join(', '),
    timezone: business.timezone || 'Europe/Moscow',
    accentColor: business.brand_color || theme.accent,
    accent2: theme.accent2 ?? theme.accent,
    mode: theme.mode,
    bg: theme.bg,
    surface: theme.surface,
    border: theme.border,
    borderHover: theme.borderHover ?? theme.border,
    text: theme.text,
    textMuted: theme.textMuted,
    textSubtle: theme.textSubtle,
    logo: business.logo_url ?? '',
    heroImage,
    workHours: toWorkHours(business.working_hours),
    services: services
      .filter((s) => s.is_active)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? '',
        price: Number(s.price),
        durationMinutes: s.duration_minutes,
        bufferMinutes: 0,
        resourceIds: [],
        isActive: s.is_active,
        sortOrder: s.sort_order,
      })),
    resources: buildResources(theme),
    slotStepMinutes: business.slot_step_minutes ?? 30,
    infoCards: theme.infoCards,
    gallery,
    booking: {
      advanceBookingDays: business.max_days_ahead ?? 30,
      minAdvanceMinutes: (business.min_hours_before ?? 2) * 60,
      cancellationPolicy: { freeUntilHoursBefore: business.cancel_hours_before ?? 3, penaltyPercent: 0 },
      requireConfirmation: !business.auto_confirm,
      allowGuestBooking: true,
    },
    notifications: { reminderHoursBefore: [24], enablePush: true, enableEmail: false, enableSMS: false },
    seo: { title: business.name, description: business.description ?? '', ogImage: heroImage },
    rating: business.rating ? { score: Number(business.rating), reviews: business.reviews_count ?? 0 } : undefined,
    businessNoun: theme.businessNoun,
    glyph: theme.glyph,
    asideTitle: theme.asideTitle,
    asideText: theme.asideText,
    ctaPrimary: theme.ctaPrimary,
    ctaBook: theme.ctaBook,
    installTitle: theme.installTitle,
    installText: theme.installText,
    installCta: theme.installCta,
    resourceLabel: theme.resourceLabel,
    detailField: theme.detailField,
    serviceGlyph: theme.serviceGlyph,
  };
}

// Поля из темы, которые нужны демо-сайту без БД (app/dev/*).
export function themeTenantFields(theme: NicheTheme): Pick<
  NicheTenant,
  'businessNoun' | 'glyph' | 'asideTitle' | 'asideText' | 'ctaPrimary' | 'ctaBook'
  | 'installTitle' | 'installText' | 'installCta' | 'resourceLabel' | 'detailField' | 'infoCards' | 'resources' | 'serviceGlyph' | 'accent2'
  | 'mode' | 'bg' | 'surface' | 'border' | 'borderHover' | 'text' | 'textMuted' | 'textSubtle'
> {
  return {
    accent2: theme.accent2 ?? theme.accent,
    mode: theme.mode,
    bg: theme.bg,
    surface: theme.surface,
    border: theme.border,
    borderHover: theme.borderHover ?? theme.border,
    text: theme.text,
    textMuted: theme.textMuted,
    textSubtle: theme.textSubtle,
    businessNoun: theme.businessNoun,
    glyph: theme.glyph,
    asideTitle: theme.asideTitle,
    asideText: theme.asideText,
    ctaPrimary: theme.ctaPrimary,
    ctaBook: theme.ctaBook,
    installTitle: theme.installTitle,
    installText: theme.installText,
    installCta: theme.installCta,
    resourceLabel: theme.resourceLabel,
    detailField: theme.detailField,
    infoCards: theme.infoCards,
    resources: buildResources(theme),
    serviceGlyph: theme.serviceGlyph,
  };
}

// ---------- форматтеры (точно как в «Детейленг» src/lib/utils.ts) ----------
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 480) return `${Math.round(minutes / 60)} ч`;
  return `${Math.round(minutes / 480)} д`;
}
export function formatCurrency(amount: number, currency = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
export function formatServicePrice(amount: number): string {
  const formatted = formatCurrency(amount);
  return amount >= 10_000 ? `от ${formatted}` : formatted;
}

// Русская плюрализация: plural(2, 'бокс','бокса','боксов') -> 'бокса'.
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
export function resourceNoun(count: number, base: string): string {
  return plural(count, base, `${base}а`, `${base}ов`);
}

// ---------- статус заведения (точно как в «Детейленг» src/lib/studio.ts) ----------
export type StudioState = 'open' | 'closed' | 'break' | 'unknown';
export interface StudioStatus { state: StudioState; label: string; isOpen: boolean }

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type DayKey = (typeof DAY_KEYS)[number];
const WEEKDAY_TO_DAY: Record<string, DayKey> = {
  Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday',
};
const UNKNOWN_STATUS: StudioStatus = { state: 'unknown', label: 'Часы работы', isOpen: false };

function minutesOfDay(hhmm: string): number {
  const [hours = '0', minutes = '0'] = hhmm.split(':');
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}
function formatTime(hhmm: string): string {
  const total = minutesOfDay(hhmm);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function isOvernight(s: { open: string; close: string }): boolean { return minutesOfDay(s.close) < minutesOfDay(s.open); }
function isWithinShift(s: { open: string; close: string }, m: number): boolean {
  const open = minutesOfDay(s.open);
  const close = minutesOfDay(s.close);
  if (close === open) return false;
  if (close > open) return m >= open && m < close;
  return m >= open || m < close;
}
function breakEndingAt(s: { open: string; close: string; breaks?: { start: string; end: string }[] }, m: number): string | null {
  for (const brk of s.breaks ?? []) {
    const start = minutesOfDay(brk.start);
    const end = minutesOfDay(brk.end);
    if (start === end) continue;
    const inside = start < end ? m >= start && m < end : m >= start || m < end;
    if (inside) return brk.end;
  }
  return null;
}
function dayAt(index: number): DayKey {
  return DAY_KEYS[((index % DAY_KEYS.length) + DAY_KEYS.length) % DAY_KEYS.length] ?? 'sunday';
}
function nextOpening(wh: NicheWorkHours, fromIndex: number): string | null {
  for (let offset = 1; offset <= DAY_KEYS.length; offset += 1) {
    const schedule = wh[dayAt(fromIndex + offset)];
    if (schedule) return schedule.open;
  }
  return null;
}

export function getStudioStatus(workHours: NicheWorkHours, timezone: string, now: Date = new Date()): StudioStatus {
  let weekday = '';
  let currentMinutes = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    currentMinutes = hour * 60 + minute;
  } catch {
    return UNKNOWN_STATUS;
  }
  const dayKey = WEEKDAY_TO_DAY[weekday];
  if (!dayKey) return UNKNOWN_STATUS;
  const dayIndex = DAY_KEYS.indexOf(dayKey);
  const today = workHours[dayKey];
  const previous = workHours[dayAt(dayIndex - 1)];
  if (today && isWithinShift(today, currentMinutes)) {
    const breakEnd = breakEndingAt(today, currentMinutes);
    if (breakEnd) return { state: 'break', label: `Перерыв до ${formatTime(breakEnd)}`, isOpen: false };
    return { state: 'open', label: `Открыто до ${formatTime(today.close)}`, isOpen: true };
  }
  if (previous && isOvernight(previous) && currentMinutes < minutesOfDay(previous.close)) {
    const breakEnd = breakEndingAt(previous, currentMinutes);
    if (breakEnd) return { state: 'break', label: `Перерыв до ${formatTime(breakEnd)}`, isOpen: false };
    return { state: 'open', label: `Открыто до ${formatTime(previous.close)}`, isOpen: true };
  }
  if (!today) return { state: 'closed', label: 'Сегодня выходной', isOpen: false };
  if (currentMinutes < minutesOfDay(today.open)) return { state: 'closed', label: `Откроется в ${formatTime(today.open)}`, isOpen: false };
  const upcomingOpen = nextOpening(workHours, dayIndex);
  if (!upcomingOpen) return { state: 'closed', label: 'Сегодня выходной', isOpen: false };
  return { state: 'closed', label: `Закрыто · откроется в ${formatTime(upcomingOpen)}`, isOpen: false };
}
