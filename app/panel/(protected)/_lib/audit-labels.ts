// app/panel/(protected)/_lib/audit-labels.ts — человекочитаемые подписи событий audit_log.
// Общие для истории в карточке бизнеса и журнала /panel/logs (раньше подписи были только в карточке).
import { LOG_SOURCES, type LogSource } from '@/lib/log';
import { statusLabel } from './statuses';

export const ACTION_LABEL: Record<string, string> = {
  business_add: 'Бизнес добавлен вручную',
  mass_status: 'Массовая смена статуса',
  status_change: 'Смена статуса',
  funnel_in_progress: 'Воронка: взят в работу',
  funnel_generate: 'Воронка: сгенерирован прототип',
  funnel_approve: 'Воронка: одобрен',
  funnel_rework: 'Воронка: на доработку',
  funnel_queue: 'Воронка: письма в очереди',
  card_approve: 'Одобрен',
  card_queue: 'Письмо поставлено в очередь',
  card_archive: 'Архивирован',
  card_delete: 'Запланировано удаление',
  slug_change: 'Смена адреса',
  domain_set: 'Кастомный домен',
  ssl_check: 'Проверка SSL',
  notes_save: 'Заметка',
  mark_paid: 'Оплата настройки',
  extend_subscription: 'Продление подписки',
  subscription_disable: 'Подписка отключена',
  create_access: 'Создан доступ владельцу',
  payment_reminder: 'Напоминание об оплате',
  mark_refused: 'Отказ',
  transfer_mark: 'Код передан',
  code_transfer: 'Выгрузка кода',
  vertical_create: 'Ниша создана',
  vertical_save: 'Ниша изменена',
  vertical_toggle: 'Ниша вкл/выкл',
  vertical_import: 'Импорт ниш',
  settings_save: 'Настройки изменены',
  stats_refresh: 'Пересчёт статистики',
  import_2gis: 'Импорт 2GIS',
  export_businesses: 'Выгрузка бизнесов (CSV/XLSX)',
  template_create: 'Шаблон создан',
  template_save: 'Шаблон изменён',
  template_delete: 'Шаблон удалён',
  template_restore: 'Шаблон восстановлен',
  email_account_add: 'Ящик добавлен',
  email_account_delete: 'Ящик удалён',
  license_create: 'Лицензия выдана',
  license_revoke: 'Лицензия заблокирована',
  license_restore: 'Лицензия разблокирована',
  license_allow_domain: 'Лицензия: домен разрешён',
  license_ignore: 'Лицензия: игнорировать',
  backup_restore: 'Восстановление из бэкапа',
  manager_invite: 'Приглашён менеджер',
  manager_remove: 'Менеджер удалён',
};

export const ENTITY_LABEL: Record<string, string> = {
  business: 'Бизнес',
  vertical: 'Ниша',
  settings: 'Настройки',
  template: 'Шаблон',
  license: 'Лицензия',
  email_account: 'Ящик',
  outreach: 'Рассылка',
  import: 'Импорт',
  backup: 'Бэкап',
};

export const SOURCE_LABEL: Record<LogSource, string> = {
  email: 'Почта',
  generate: 'Генерация',
  vercel: 'Vercel / домены',
  booking: 'Брони',
  import: 'Импорт',
  cron: 'Cron',
  admin: 'Админка',
  export: 'Экспорт',
};

export function isLogSource(s: unknown): s is LogSource {
  return typeof s === 'string' && (LOG_SOURCES as readonly string[]).includes(s);
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

// Краткие детали события: «Новый → В работе», «a → b», домен, сумма. Остальное — до 4 пар ключ=значение.
export function auditDetails(action: string, p: Record<string, unknown> | null): string {
  if (!p) return '';
  const s = (k: string) => (typeof p[k] === 'string' || typeof p[k] === 'number' ? String(p[k]) : '');
  if (p.to && (action.includes('status') || action.startsWith('funnel_') || action.startsWith('card_'))) {
    return p.from ? `${statusLabel(s('from'))} → ${statusLabel(s('to'))}` : `→ ${statusLabel(s('to'))}`;
  }
  if (action === 'slug_change') return `${s('from')} → ${s('to')}`;
  if (action === 'domain_set') return s('domain') || 'отвязан';
  if (action === 'ssl_check') return s('status');
  if (action === 'notes_save') return `${s('length')} симв.`;
  if (action === 'extend_subscription') return `до ${s('until')}`;
  if (action === 'mark_paid') return `${s('amount')} ₽`;
  if (action === 'export_businesses') return `${s('format').toUpperCase()}, строк: ${s('rows')}`;
  if (action === 'settings_save' && Array.isArray(p.changed)) return `${s('ref')}: ${p.changed.join(', ')}`;
  return Object.entries(p)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(', ');
}
