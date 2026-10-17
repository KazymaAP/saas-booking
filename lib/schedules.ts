// lib/schedules.ts — центральный реестр расписаний (ТЗ §8.4). Единственный источник правды:
//   vercel.json, supabase/migrations/0006–0008 (pg_cron), scripts/cron-check.sh и crontab VPS (ТЗ §8.2, §22)
//   сверяются с этим списком в lib/schedules.test.ts.
// Все выражения — UTC (pg_cron в Supabase и Vercel Cron работают в UTC). МСК = UTC+3.

// Где запускается задача:
//   vercel       — Vercel Cron (Hobby: максимум 2 задачи, не чаще раза в сутки, maxDuration 60 с);
//   pg_cron_http — pg_cron → public.cron_http_call(name) → net.http_get на /api/cron/<name> (fire-and-forget);
//   pg_cron_sql  — pg_cron выполняет SQL-функцию внутри БД, HTTP не нужен.
export const RUNNERS = ['vercel', 'pg_cron_http', 'pg_cron_sql'] as const;
export type CronRunner = (typeof RUNNERS)[number];

// Политика повтора. next_run — недоделанная работа подхватывается следующим запуском по расписанию
// (это безопасно: каждая задача идемпотентна). none — повтора нет, сбой виден в журнале.
export const RETRY_POLICIES = ['next_run', 'none'] as const;
export type RetryPolicy = (typeof RETRY_POLICIES)[number];

// Зона ответственности (для задач, код которых ведут другие агенты).
export const OWNERS = ['agent-2-cron', 'agent-8-email'] as const;
export type CronOwner = (typeof OWNERS)[number];

export interface CronSchedule {
  name: string;
  schedule: string;
  runner: CronRunner;
  // HTTP-путь (/api/cron/...) для vercel и pg_cron_http, вызов SQL-функции для pg_cron_sql.
  handler: string;
  // Сколько ждать ответа: таймаут pg_net (timeout_milliseconds) или бюджет функции Vercel.
  timeoutMs: number;
  retry: RetryPolicy;
  owner: CronOwner;
  description: string;
}

const SECOND = 1000;
const HTTP_TIMEOUT_SHORT = 10 * SECOND;
const HTTP_TIMEOUT_LONG = 60 * SECOND;
const SQL_TIMEOUT = 30 * SECOND;
const API_PREFIX = '/api/cron/';

const http = (
  name: string,
  schedule: string,
  description: string,
  timeoutMs: number = HTTP_TIMEOUT_SHORT,
  owner: CronOwner = 'agent-2-cron',
): CronSchedule => ({
  name, schedule, runner: 'pg_cron_http', handler: `${API_PREFIX}${name}`, timeoutMs, retry: 'next_run', owner, description,
});

const sql = (name: string, schedule: string, handler: string, description: string): CronSchedule => ({
  name, schedule, runner: 'pg_cron_sql', handler, timeoutMs: SQL_TIMEOUT, retry: 'next_run', owner: 'agent-2-cron', description,
});

const vercel = (name: string, schedule: string, description: string): CronSchedule => ({
  name, schedule, runner: 'vercel', handler: `${API_PREFIX}${name}`, timeoutMs: HTTP_TIMEOUT_LONG, retry: 'none', owner: 'agent-2-cron', description,
});

export const SCHEDULES: readonly CronSchedule[] = [
  // --- Vercel Hobby: 2 задачи ---
  vercel('backup', '0 3 * * 0', 'Воскресенье: JSON-выгрузка ключевых таблиц в bucket backups, старше 30 дней — удаление (§8.4, §16.7)'),
  vercel('cleanup-audit-log', '0 6 * * *', 'Страховка retention: если pg_cron не сработал, чистит журналы по тем же правилам (§4.50)'),

  // --- pg_cron → HTTP: частые задачи ---
  http('send-emails', '* * * * *', 'Одно письмо из очереди рассылки (§9.1)', HTTP_TIMEOUT_LONG, 'agent-8-email'),
  http('check-replies', '*/5 * * * *', 'IMAP: входящие ответы (§9.4)', HTTP_TIMEOUT_LONG, 'agent-8-email'),
  http('booking-reminders', '0 * * * *', 'Напоминания клиентам за 24 ч и 2 ч (§10.6)', HTTP_TIMEOUT_LONG),
  http('unconfirmed-reminder', '0 * * * *', 'Письмо бизнесу о брони в статусе new дольше 24 ч (§10.8)', HTTP_TIMEOUT_LONG),

  // --- pg_cron → HTTP: ежедневные (UTC; в скобках МСК по ТЗ §8.4) ---
  http('follow-up', '0 8 * * *', 'Повтор молчунам через 30/60 дней, архив через 90 (11:00 МСК)', HTTP_TIMEOUT_LONG),
  http('subscription-reminders', '0 7 * * *', 'Подписка: за 3 дня, в день окончания, +7 дней заглушка, +30 архив (10:00 МСК, §14.3)', HTTP_TIMEOUT_LONG),
  http('reset-email-limits', '0 21 * * *', 'Сброс sent_today у ящиков (00:00 МСК)'),
  http('archive-refused', '0 0 * * *', 'Отказы старше 30 дней → archived (03:00 МСК, §3.6)'),
  http('process-deletions', '0 1 * * *', 'pending_deletion с наступившей датой → удаление (04:00 МСК)', HTTP_TIMEOUT_LONG),
  http('process-transfers', '30 1 * * *', 'Выкуп кода: заглушка после support_until, +7 дней transferred_out (§14.4)'),
  http('cleanup-prototypes', '0 2 * * *', 'preview_ready > 90 дней → archived, archived > 30 дней → удаление (05:00 МСК, §11.5)', HTTP_TIMEOUT_LONG),
  http('check-domains', '30 2 * * *', 'Кастомные домены через Vercel API → ssl_status (05:30 МСК)', HTTP_TIMEOUT_LONG),

  // --- pg_cron → SQL внутри БД ---
  sql('keep-alive', '0 * * * *', 'select public.cron_keep_alive()', 'Активность БД раз в час (Supabase Free)'),
  sql('cleanup-audit-log-90', '0 3 * * *', 'select public.cron_retention(\'audit_log\')', 'audit_log старше 90 дней'),
  sql('cleanup-app-logs-30', '0 4 * * *', 'select public.cron_retention(\'app_logs\')', 'app_logs старше 30 дней (если таблица есть)'),
  sql('cleanup-analytics-180', '0 5 * * *', 'select public.cron_retention(\'analytics_events\')', 'analytics_events старше 180 дней (если таблица есть)'),
  // Заодно чистит журнал идемпотентности cron_marks (180 дней) — команда совпадает с 0007_retention.sql.
  sql('cleanup-license-pings-180', '0 6 * * *', 'select public.cron_retention(\'license_pings\'), public.cron_retention(\'cron_marks\')',
    'license_pings и cron_marks старше 180 дней'),
  sql('create-partitions', '0 7 1 * *', 'select public.create_monthly_partitions()', 'Партиции на 3 месяца вперёд для партиционированных таблиц'),
];

// Сроки хранения (дни). Должны совпадать с public.cron_retention_policy в 0007_retention.sql.
export const RETENTION_DAYS = {
  audit_log: 90,
  app_logs: 30,
  analytics_events: 180,
  license_pings: 180,
} as const;

// Задачи, которые оставлены как URL, но не запускаются по расписанию.
// cleanup-slots: слоты не хранятся в БД (lib/availability.ts), чистить нечего.
export const UNSCHEDULED_JOBS = ['cleanup-slots'] as const;

export const VERCEL_HOBBY_MAX_CRONS = 2;

export function schedulesBy(runner: CronRunner): CronSchedule[] {
  return SCHEDULES.filter((s) => s.runner === runner);
}

export function findSchedule(name: string): CronSchedule | undefined {
  return SCHEDULES.find((s) => s.name === name);
}

// Содержимое секции crons для vercel.json.
export function toVercelCrons(): { path: string; schedule: string }[] {
  return schedulesBy('vercel').map((s) => ({ path: s.handler, schedule: s.schedule }));
}

// Строки /etc/cron.d/servis-jade для VPS (ТЗ §8.2, §22 этап 1 п.8). SQL-задачи на VPS вызываются через psql.
export function toCrontab(baseUrl: string, envFile = '/etc/servis-jade.env'): string[] {
  return SCHEDULES.map((s) => {
    if (s.runner === 'pg_cron_sql') {
      return `${s.schedule} . ${envFile}; psql "$DATABASE_URL" -qtAc "${s.handler}"`;
    }
    return `${s.schedule} . ${envFile}; curl -fsS -m ${Math.ceil(s.timeoutMs / SECOND)} -H "Authorization: Bearer $CRON_SECRET" ${baseUrl}${s.handler}`;
  });
}

// --- Проверка cron-выражений (5 полей, как в pg_cron и Vercel) ---
const CRON_FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'weekday', min: 0, max: 7 },
] as const;

const NUMBER_RE = /^\d+$/;

function inRange(value: string, min: number, max: number): boolean {
  if (NUMBER_RE.test(value) === false) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

// Один элемент списка: *, N, N-M, */S, N-M/S.
function isValidPart(part: string, min: number, max: number): boolean {
  const [base, step, ...rest] = part.split('/');
  if (rest.length > 0 || base === undefined) return false;
  if (step !== undefined && (NUMBER_RE.test(step) === false || Number(step) < 1)) return false;
  if (base === '*') return true;
  const [from, to, ...extra] = base.split('-');
  if (extra.length > 0 || from === undefined) return false;
  if (to === undefined) return step === undefined && inRange(from, min, max);
  return inRange(from, min, max) && inRange(to, min, max) && Number(from) <= Number(to);
}

export function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== CRON_FIELDS.length) return false;
  return fields.every((field, index) => {
    const spec = CRON_FIELDS[index];
    if (spec === undefined) return false;
    return field.split(',').every((part) => isValidPart(part, spec.min, spec.max));
  });
}

// Минимальный интервал между запусками в минутах (грубая оценка для проверки лимитов Hobby).
export function runsMoreThanDaily(expression: string): boolean {
  const [minute = '', hour = ''] = expression.trim().split(/\s+/);
  const single = (field: string) => NUMBER_RE.test(field);
  return single(minute) === false || single(hour) === false;
}
