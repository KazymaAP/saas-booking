// Типы строк таблиц из supabase/migrations/0001_init.sql.
// Вручную, пока не подключена генерация (supabase gen types). Имена полей совпадают с БД.

export type BusinessStatus =
  | 'new' | 'in_progress' | 'preview_ready' | 'approved' | 'sent' | 'viewed' | 'replied'
  | 'client' | 'refused' | 'no_contact' | 'archived' | 'transferred_out' | 'pending_deletion' | 'deleted';

export type BookingStatus = 'new' | 'confirmed' | 'cancelled' | 'done' | 'no_show';

export type WorkingInterval = { open: string; close: string };
export type WorkingHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', WorkingInterval[] | null>>;

export interface VerticalTemplate {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  url_prefix: string;
  description: string | null;
  fields: unknown[];
  default_services: { name: string; price: number; duration: number }[];
  default_texts: Record<string, string>;
  default_colors: Record<string, string>;
  blocks: Record<string, boolean>;
  show_demo_mode: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Business {
  id: string;
  slug: string;
  slug_history: string[];
  name: string;
  description: string | null;
  vertical_template_id: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  working_hours: WorkingHours | null;
  slot_step_minutes: number;
  cancel_hours_before: number;
  min_hours_before: number;
  max_days_ahead: number;
  auto_confirm: boolean;
  phones: string[];
  emails: string[];
  websites: string[];
  socials: Record<string, string> | null;
  rating: number | null;
  reviews_count: number | null;
  source_2gis_url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  brand_color: string;
  status: BusinessStatus;
  preview_url: string | null;
  preview_token: string | null;
  custom_domain: string | null;
  plan: string;
  paid_initial_at: string | null;
  plan_type: string | null;
  subscription_price: number | null;
  subscription_active: boolean;
  subscription_until: string | null;
  subscription_started_at: string | null;
  support_until: string | null;
  code_transferred_at: string | null;
  license_id: string | null;
  telegram_chat_id: string | null;
  telegram_connected_at: string | null;
  reply_text: string | null;
  reply_received_at: string | null;
  custom_texts: Record<string, string> | null;
  custom_blocks: unknown[] | null;
  oferta_accepted_at: string | null;
  oferta_accepted_ip: string | null;
  onboarding_completed_at: string | null;
  deletion_scheduled_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  sort_order: number;
  is_active: boolean;
}

export interface Photo {
  id: string;
  business_id: string;
  url: string | null;
  alt: string | null;
  sort_order: number;
  path: string | null;
}

export interface Booking {
  id: string;
  business_id: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_telegram: string | null;
  service_id: string | null;
  scheduled_at: string;
  comment: string | null;
  status: BookingStatus;
  cancel_token: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  reminder_24h_sent_at: string | null;
  reminder_2h_sent_at: string | null;
  privacy_accepted_at: string | null;
  privacy_ip: string | null;
  privacy_version: string | null;
  created_at: string;
}

export interface AdminUser {
  id: string;
  business_id: string;
  email: string | null;
  role: 'owner' | 'manager';
  auth_user_id: string | null;
  created_at: string;
}

export interface EmailAccount {
  id: string;
  email: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  daily_limit: number;
  sent_today: number;
  last_reset: string | null;
  active: boolean;
}

export interface RateLimit {
  bucket: string;
  window_start: string;
  hits: number;
}
