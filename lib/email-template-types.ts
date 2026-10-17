// lib/email-template-types.ts — константы каналов и типов шаблонов писем.
// Без серверных импортов: безопасно для клиентских компонентов (TemplateEditor). Вынесено из lib/email-panel.ts.
export const TEMPLATE_CHANNELS = ['outreach', 'client'] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const OUTREACH_TYPES = [
  'outreach_universal', 'outreach_tire', 'outreach_detailing', 'outreach_manicure', 'outreach_sauna', 'outreach_barbershop',
  'outreach_auto', 'outreach_photo', 'outreach_tutor', 'outreach_cleaning', 'outreach_dentistry', 'outreach_vet',
] as const;

export const CLIENT_TYPES = [
  'booking_new', 'booking_confirmed', 'booking_cancelled', 'booking_reminder_24h', 'booking_reminder_2h', 'booking_rescheduled',
  'subscription_reminder_3d', 'subscription_reminder_0d', 'subscription_expired_7d', 'code_transferred', 'access_created',
  'invite_manager', 'unconfirmed_reminder',
] as const;
