// app/admin/audit-labels.ts — человекочитаемые подписи событий audit_log для супер-админки.
// Чистый модуль без серверных зависимостей: используется и в server action (обогащение данных),
// и в клиентском компоненте (отрисовка). Старые подписи из главная/lib/audit-labels.ts не годятся:
// они тянут @/lib/supabase и покрывают только воронку /panel.
export const AUDIT_LABELS: Record<string, string> = {
  // платформа
  'platform.email_queued': 'Письмо поставлено в очередь',
  'platform.broadcast_sent': 'Рассылка отправлена',
  'platform.chat_message_sent': 'Сообщение в чат арендатору',
  'platform.api_key_rotated': 'API-ключ перевыпущен',
  'platform.settings_saved': 'Настройки платформы изменены',
  'platform.notifications_saved': 'Настройки уведомлений изменены',
  'platform.tariffs_saved': 'Тарифы изменены',
  'platform.flags_saved': 'Флаги функций изменены',
  'platform.notif_template_saved': 'Шаблон уведомления изменён',
  'platform.notif_template_toggled': 'Шаблон уведомления вкл/выкл',
  'platform.bot_commands_set': 'Команды бота обновлены',
  'platform.admin_password_changed': 'Пароль администратора изменён',
  'platform.partner_message': 'Сообщение партнёру',
  'platform.partner_money': 'Корректировка баланса партнёра',
  'platform.partner_ban': 'Партнёр заблокирован',
  'platform.partner_unban': 'Партнёр разблокирован',
  'platform.ready_upload': 'Загрузка готовых сервисов',
  'platform.ready_generate': 'Генерация сайтов',
  'platform.ready_status': 'Статус готового сервиса',
  'platform.ready_delete': 'Удаление готовых сервисов',
  // бизнесы и записи
  business_add: 'Бизнес добавлен',
  status_change: 'Смена статуса бизнеса',
  mass_status: 'Массовая смена статуса',
  slug_change: 'Смена адреса',
  domain_set: 'Кастомный домен',
  mark_paid: 'Оплата настройки',
  extend_subscription: 'Продление подписки',
  // телеграм
  telegram_connected: 'Телеграм подключён',
  telegram_disconnected: 'Телеграм отключён',
  telegram_code_issued: 'Выдан код подключения',
  // прочее
  settings_save: 'Настройки изменены',
  stats_refresh: 'Пересчёт статистики',
  export_businesses: 'Выгрузка бизнесов',
  import_2gis: 'Импорт 2GIS',
  'cron:create-partitions': 'Планировщик: созданы партиции',
  'auth:login_success': 'Вход в систему',
  'auth:logout': 'Выход из системы',
  'auth:login_failed': 'Неудачная попытка входа',
  'auth:login_rate_limited': 'Вход заблокирован лимитом',
  'auth:csrf_rejected': 'Запрос отклонён (Origin)',
};

/** Пространства имён событий: 'cron:retention:audit_log' → «Планировщик · Очистка audit_log». */
const NAMESPACES: Record<string, string> = {
  cron: 'Планировщик',
  auth: 'Авторизация',
  platform: 'Платформа',
  telegram: 'Телеграм',
};

/** Таблицы, которые встречаются в событиях очистки, — по-русски понятнее. */
const TABLE_NAMES: Record<string, string> = {
  audit_log: 'журнал действий',
  app_logs: 'логи приложения',
  license_pings: 'пинги лицензий',
  analytics_events: 'события аналитики',
  webhook_events: 'события вебхуков',
  email_queue: 'очередь писем',
  rate_limits: 'счётчики лимитов',
  jobs: 'задачи',
};

/** Источники ошибок из lib/log.ts: 'error:cron' → «Ошибка: планировщик». */
const ERROR_SOURCES: Record<string, string> = {
  email: 'почта',
  generate: 'генерация сайтов',
  vercel: 'Vercel',
  booking: 'записи',
  import: 'импорт',
  cron: 'планировщик',
  admin: 'админка',
  export: 'экспорт',
};

export function isErrorAction(action: string): boolean {
  return action.startsWith('error:');
}

/** Подпись события: известные — по-русски, ошибки — «Ошибка: источник», остальные — разбор по namespace. */
export function auditActionLabel(action: string): string {
  const label = AUDIT_LABELS[action];
  if (label) return label;
  if (isErrorAction(action)) {
    const source = action.slice('error:'.length);
    return `Ошибка: ${ERROR_SOURCES[source] ?? source}`;
  }
  const parts = action.split(':');
  const namespace = parts.length > 1 ? NAMESPACES[parts[0]] : undefined;
  if (!namespace) return action;
  const rest = parts.slice(1);
  // cron:retention:audit_log → «Очистка старых записей: журнал действий»
  if (rest[0] === 'retention' && rest[1]) {
    return `Очистка старых записей: ${TABLE_NAMES[rest[1]] ?? rest[1]}`;
  }
  return `${namespace} · ${rest.join(' ').replace(/_/g, ' ')}`;
}
