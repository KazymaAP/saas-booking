// lib/database.types.ts — типы строк таблиц. Источник истины — схема БД (lib/database.generated.ts,
// генерируется scripts/gen-db-types.ps1). Здесь только: имена экспорта, которые использует код, и уточнения
// для колонок, которые генератор описывает общо (jsonb → Json, enum-like text → string).
import type { Database } from './database.generated';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

// ---------- Уточнённые типы для enum-подобных колонок и jsonb ----------
export type BusinessStatus =
  | 'new' | 'in_progress' | 'preview_ready' | 'approved' | 'sent' | 'viewed' | 'replied'
  | 'client' | 'refused' | 'no_contact' | 'archived' | 'transferred_out' | 'pending_deletion' | 'deleted';

export type BookingStatus = 'new' | 'confirmed' | 'cancelled' | 'done' | 'no_show';

export type WorkingInterval = { open: string; close: string };
export type WorkingHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', WorkingInterval[] | null>>;

// ---------- Строки таблиц ----------
export type VerticalTemplate = Omit<Row<'vertical_templates'>, 'default_services' | 'default_texts' | 'default_colors' | 'blocks'> & {
  default_services: { name: string; price: number; duration: number }[];
  default_texts: Record<string, string>;
  default_colors: Record<string, string>;
  blocks: Record<string, boolean>;
};

export type Business = Omit<Row<'businesses'>, 'status' | 'working_hours' | 'socials' | 'custom_texts'> & {
  status: BusinessStatus;
  working_hours: WorkingHours | null;
  socials: Record<string, string> | null;
  custom_texts: Record<string, string> | null;
};

export type Service = Row<'services'>;
export type Photo = Row<'photos'>;

export type Booking = Omit<Row<'bookings'>, 'status'> & { status: BookingStatus };

export type AdminUser = Row<'admin_users'>;
export type EmailAccount = Row<'email_accounts'>;
export type RateLimit = Row<'rate_limits'>;
