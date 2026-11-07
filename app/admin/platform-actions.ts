'use server';

// app/admin/platform-actions.ts — действия супер-админки, которые реально что-то делают
// (а не показывают тост): API-ключ платформы, письмо в очередь доставки, рассылка через бота.
// Все действия защищены проверкой супер-админа: server actions — отдельные POST-эндпоинты.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { requireSuperAdminAction } from '@/lib/admin-session';
import { audit } from '@/lib/audit';
import { isValidEmail, sendTelegram } from '@/lib/notify';
import { readSession } from '@/lib/auth-session';
import { passwordSignIn, setUserPassword } from '@/lib/auth-provider';

const API_KEY_SETTING = 'platform:api_key';
const MAX_BROADCAST_RECIPIENTS = 200;
const BROADCAST_CONCURRENCY = 5;

type Fail = { ok: false; error: string };
const denied: Fail = { ok: false, error: 'Доступ запрещён' };

// ---------- API-ключ платформы ----------

// Ключ хранится в settings и читается только service-role (RLS + серверное действие).
export async function getPlatformApiKeyAction(): Promise<{ ok: boolean; key: string | null }> {
  if (!(await requireSuperAdminAction())) return { ok: false, key: null };
  try {
    const { data } = await adminClient()
      .from('settings')
      .select('value')
      .eq('key', API_KEY_SETTING)
      .maybeSingle<{ value: { key?: string } | null }>();
    const key = data?.value?.key;
    return { ok: true, key: typeof key === 'string' && key.length > 0 ? key : null };
  } catch {
    return { ok: false, key: null };
  }
}

// Новый ключ генерируется на сервере криптостойким ГПСЧ и сразу сохраняется.
export async function rotatePlatformApiKeyAction(): Promise<{ ok: boolean; key?: string; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const key = `sk_live_${randomBytes(24).toString('hex')}`;
  const { error } = await adminClient()
    .from('settings')
    .upsert({ key: API_KEY_SETTING, value: { key, rotated_at: new Date().toISOString() }, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: 'Не удалось сохранить ключ' };
  await audit('platform.api_key_rotated', 'settings', null, {});
  return { ok: true, key };
}

// ---------- письмо клиенту/владельцу через очередь доставки ----------

// Ставит письмо в email_queue: дальше его отправляет cron send-emails.
// Возвращает честный результат — «поставлено в очередь», а не «отправлено».
export async function queuePlatformEmailAction(input: {
  to: string;
  subject: string;
  body: string;
  businessId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const to = String(input.to ?? '').trim();
  const subject = String(input.subject ?? '').trim();
  const body = String(input.body ?? '').trim();
  if (!isValidEmail(to)) return { ok: false, error: 'Некорректный email получателя' };
  if (!subject) return { ok: false, error: 'Укажите тему письма' };
  if (!body) return { ok: false, error: 'Пустой текст письма' };

  const businessId = typeof input.businessId === 'string' && input.businessId.length > 0 ? input.businessId : null;
  const { error } = await adminClient().from('email_queue').insert({
    to_email: to,
    subject: subject.slice(0, 200),
    body_text: body,
    status: 'pending',
    business_id: businessId,
  });
  if (error) return { ok: false, error: 'Не удалось поставить письмо в очередь' };
  await audit('platform.email_queued', 'email_queue', null, { to, subject });
  return { ok: true };
}

// ---------- рассылка арендаторам через Телеграм-бот ----------

// Реально отправляет сообщение владельцам бизнесов, у которых подключён бот.
// Никаких «18420 получателей»: возвращает фактические числа.
export async function sendPlatformBroadcastAction(text: string): Promise<{
  ok: boolean; sent: number; failed: number; total: number; skipped: number; error?: string;
}> {
  const empty = { ok: false, sent: 0, failed: 0, total: 0, skipped: 0 };
  if (!(await requireSuperAdminAction())) return { ...empty, error: 'Доступ запрещён' };
  const body = String(text ?? '').trim();
  if (!body) return { ...empty, error: 'Пустой текст рассылки' };

  const { data, error } = await adminClient()
    .from('businesses')
    .select('id, telegram_chat_id')
    .not('telegram_chat_id', 'is', null)
    .limit(MAX_BROADCAST_RECIPIENTS);

  if (error) return { ...empty, error: 'Не удалось получить получателей' };

  const rows = (data ?? []) as { id: string; telegram_chat_id: string | null }[];
  const targets = rows.filter((r) => typeof r.telegram_chat_id === 'string' && r.telegram_chat_id.length > 0);
  const skipped = rows.length - targets.length;

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += BROADCAST_CONCURRENCY) {
    const batch = targets.slice(i, i + BROADCAST_CONCURRENCY);
    const results = await Promise.all(batch.map((r) => sendTelegram(r.telegram_chat_id as string, body).catch(() => false)));
    for (const ok of results) ok ? (sent += 1) : (failed += 1);
  }

  await audit('platform.broadcast_sent', 'businesses', null, { sent, failed, total: targets.length });
  return { ok: true, sent, failed, total: targets.length, skipped };
}

// ---------- настройки платформы и уведомлений (реальное сохранение в settings) ----------

const SETTINGS_KEY = 'platform:settings';
const NOTIF_KEY = 'platform:notifications';

export type PlatformSettings = { name: string; email: string; tz: string };
export type NotifSettings = { newBooking: boolean; payment: boolean; review: boolean };

// Значения по умолчанию: пока в settings ничего не сохранено, поля не должны быть пустыми.
function defaultPlatformSettings(): PlatformSettings {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zapishisya.ru').trim();
  let host = 'zapishisya.ru';
  try { host = new URL(site).hostname.replace(/^www\./, ''); } catch { /* оставляем дефолт */ }
  return {
    name: 'Запишись',
    email: (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '').trim() || `support@${host}`,
    tz: 'Europe/Moscow',
  };
}

export async function getPlatformSettingsAction(): Promise<{ ok: boolean; value: PlatformSettings }> {
  if (!(await requireSuperAdminAction())) return { ok: false, value: defaultPlatformSettings() };
  try {
    const { data } = await adminClient().from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle<{ value: PlatformSettings | null }>();
    const saved = data?.value;
    const fallback = defaultPlatformSettings();
    return {
      ok: true,
      value: {
        name: saved?.name?.trim() || fallback.name,
        email: saved?.email?.trim() || fallback.email,
        tz: saved?.tz?.trim() || fallback.tz,
      },
    };
  } catch {
    return { ok: false, value: defaultPlatformSettings() };
  }
}

export async function savePlatformSettingsAction(input: PlatformSettings): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '').trim();
  const tz = String(input.tz ?? '').trim();
  if (!name) return { ok: false, error: 'Укажите название платформы' };
  if (email && !isValidEmail(email)) return { ok: false, error: 'Некорректный email поддержки' };
  const { error } = await adminClient()
    .from('settings')
    .upsert({ key: SETTINGS_KEY, value: { name, email, tz }, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: 'Не удалось сохранить настройки' };
  await audit('platform.settings_saved', 'settings', null, { name });
  return { ok: true };
}

const DEFAULT_NOTIF: NotifSettings = { newBooking: true, payment: true, review: false };

export async function getNotificationSettingsAction(): Promise<{ ok: boolean; value: NotifSettings }> {
  if (!(await requireSuperAdminAction())) return { ok: false, value: DEFAULT_NOTIF };
  try {
    const { data } = await adminClient().from('settings').select('value').eq('key', NOTIF_KEY).maybeSingle<{ value: NotifSettings | null }>();
    return { ok: true, value: { ...DEFAULT_NOTIF, ...(data?.value ?? {}) } };
  } catch {
    return { ok: false, value: DEFAULT_NOTIF };
  }
}

export async function saveNotificationSettingsAction(input: NotifSettings): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const value: NotifSettings = { newBooking: Boolean(input.newBooking), payment: Boolean(input.payment), review: Boolean(input.review) };
  const { error } = await adminClient()
    .from('settings')
    .upsert({ key: NOTIF_KEY, value, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: 'Не удалось сохранить настройки уведомлений' };
  await audit('platform.notifications_saved', 'settings', null, { ...value });
  return { ok: true };
}

// ---------- смена пароля супер-админа ----------

// Проверяем текущий пароль реальным входом и меняем его в Supabase Auth.
export async function changeAdminPasswordAction(currentPassword: string, nextPassword: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const next = String(nextPassword ?? '');
  const current = String(currentPassword ?? '');
  if (next.length < 8) return { ok: false, error: 'Новый пароль короче 8 символов' };

  const state = await readSession('admin');
  const email = state.kind === 'active' ? state.claims.email : null;
  if (!email) return { ok: false, error: 'Сессия истекла — войдите заново' };

  const verified = await passwordSignIn(email, current);
  if (!verified) return { ok: false, error: 'Текущий пароль неверен' };

  const changed = await setUserPassword(verified.user.id, next);
  if (!changed) return { ok: false, error: 'Не удалось обновить пароль' };
  await audit('platform.admin_password_changed', 'users', verified.user.id, {});
  return { ok: true };
}

// ---------- команды Телеграм-бота ----------

// Реально обновляет меню команд бота через Telegram API setMyCommands.
export async function setBotCommandsAction(commands: string[]): Promise<{ ok: boolean; error?: string; applied: number }> {
  if (!(await requireSuperAdminAction())) return { ok: false, error: 'Доступ запрещён', applied: 0 };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'Не задан TELEGRAM_BOT_TOKEN — команды менять негде', applied: 0 };

  const list = commands
    .map((c) => String(c).trim().replace(/^\//, ''))
    .filter((c) => c.length > 0 && c.length <= 32 && /^[a-z0-9_]+$/i.test(c))
    .slice(0, 100)
    .map((c) => ({ command: c, description: c }));

  if (list.length === 0) return { ok: false, error: 'Нет корректных команд (латиница, цифры, подчёркивание)', applied: 0 };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: list }),
    });
    const json = (await res.json()) as { ok?: boolean; description?: string };
    if (!json.ok) return { ok: false, error: json.description ?? 'Telegram отклонил запрос', applied: 0 };
    await audit('platform.bot_commands_set', 'settings', null, { count: list.length });
    return { ok: true, applied: list.length };
  } catch {
    return { ok: false, error: 'Не удалось связаться с Telegram', applied: 0 };
  }
}

// ---------- тарифы (settings.tariffs — та же структура, что читает панель при оплате) ----------

export type Tariff = { name: string; price: number; perks: string[] };

// Дефолты совпадают с ценами на лендинге: 1 000 ₽/мес на нашем домене, 2 500 ₽/мес со своим доменом.
const DEFAULT_TARIFFS: Record<string, Tariff> = {
  basic: { name: 'Старт', price: 1000, perks: ['Сайт-визитка с онлайн-записью', 'Домен платформы', 'Телеграм-уведомления'] },
  domain: { name: 'Свой домен', price: 2500, perks: ['Всё из «Старта»', 'Собственный домен', 'Приоритетная поддержка'] },
};
const TARIFFS_KEY = 'tariffs';

export async function getTariffsAction(): Promise<{ ok: boolean; tariffs: Record<string, Tariff> }> {
  if (!(await requireSuperAdminAction())) return { ok: false, tariffs: DEFAULT_TARIFFS };
  try {
    const { data } = await adminClient().from('settings').select('value').eq('key', TARIFFS_KEY).maybeSingle<{ value: Record<string, Partial<Tariff>> | null }>();
    const saved = data?.value ?? {};
    const merged: Record<string, Tariff> = { ...DEFAULT_TARIFFS };
    for (const [key, raw] of Object.entries(saved)) {
      const base = DEFAULT_TARIFFS[key] ?? { name: key, price: 0, perks: [] };
      merged[key] = {
        name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : base.name,
        price: typeof raw?.price === 'number' && raw.price >= 0 ? raw.price : base.price,
        perks: Array.isArray(raw?.perks) ? raw.perks.filter((p): p is string => typeof p === 'string') : base.perks,
      };
    }
    return { ok: true, tariffs: merged };
  } catch {
    return { ok: false, tariffs: DEFAULT_TARIFFS };
  }
}

export async function saveTariffsAction(tariffs: Record<string, Tariff>): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const clean: Record<string, Tariff> = {};
  for (const [key, value] of Object.entries(tariffs)) {
    const k = String(key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!k) continue;
    const price = Number(value?.price);
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: `Некорректная цена тарифа «${k}»` };
    clean[k] = {
      name: String(value?.name ?? '').trim() || k,
      price: Math.round(price),
      perks: Array.isArray(value?.perks) ? value.perks.map((p) => String(p).trim()).filter(Boolean) : [],
    };
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: 'Нет ни одного тарифа' };
  const { error } = await adminClient()
    .from('settings')
    .upsert({ key: TARIFFS_KEY, value: clean, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: 'Не удалось сохранить тарифы' };
  await audit('platform.tariffs_saved', 'settings', null, { count: Object.keys(clean).length });
  return { ok: true };
}

// ---------- статус интеграций: только то, что реально можно проверить ----------

export type IntegrationStatus = { key: string; name: string; configured: boolean; detail: string };

export async function getIntegrationsStatusAction(): Promise<IntegrationStatus[]> {
  if (!(await requireSuperAdminAction())) return [];
  const env = process.env;

  let mailboxes = 0;
  try {
    const { count } = await adminClient().from('email_accounts').select('id', { head: true, count: 'exact' });
    mailboxes = count ?? 0;
  } catch { /* нет таблицы или прав — покажем 0 */ }

  const telegram = Boolean(env.TELEGRAM_BOT_TOKEN);
  const yookassa = Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
  const yookassaTest = (env.YOOKASSA_TEST_MODE ?? '').trim() === 'true';

  return [
    { key: 'telegram', name: 'Телеграм-бот', configured: telegram, detail: telegram ? 'токен задан' : 'нет TELEGRAM_BOT_TOKEN' },
    {
      key: 'yookassa',
      name: 'ЮKassa (платежи)',
      configured: yookassa && !yookassaTest,
      detail: yookassaTest ? 'тестовый режим' : yookassa ? 'ключи заданы' : 'ключи не заданы',
    },
    { key: 'email', name: 'Почта (SMTP)', configured: mailboxes > 0, detail: mailboxes > 0 ? `ящиков: ${mailboxes}` : 'ящики не подключены' },
    { key: 'vercel', name: 'Vercel (кастомные домены)', configured: Boolean(env.VERCEL_API_TOKEN), detail: env.VERCEL_API_TOKEN ? 'токен задан' : 'нет VERCEL_API_TOKEN' },
    { key: 'cron', name: 'Cron-задачи', configured: Boolean(env.CRON_SECRET), detail: env.CRON_SECRET ? 'секрет задан' : 'нет CRON_SECRET' },
  ];
}

// ---------- шаблоны уведомлений (таблица templates) ----------

export type NotifTemplate = { id: string; channel: string; name: string; subject: string; active: boolean };

export async function getNotifTemplatesAction(): Promise<NotifTemplate[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient()
      .from('templates')
      .select('id, channel, name, subject, active')
      .order('created_at', { ascending: true })
      .limit(200);
    return (data ?? []).map((t) => ({
      id: String(t.id),
      channel: String(t.channel ?? 'email'),
      name: String(t.name ?? ''),
      subject: String(t.subject ?? ''),
      active: Boolean(t.active),
    }));
  } catch {
    return [];
  }
}

export async function saveNotifTemplateAction(input: { id: string; name: string; subject: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const name = String(input.name ?? '').trim();
  const subject = String(input.subject ?? '').trim();
  if (!name) return { ok: false, error: 'Укажите название шаблона' };
  const { error } = await adminClient().from('templates').update({ name, subject }).eq('id', input.id);
  if (error) return { ok: false, error: 'Не удалось сохранить шаблон' };
  await audit('platform.notif_template_saved', 'templates', input.id, { name });
  return { ok: true };
}

export async function toggleNotifTemplateAction(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const { error } = await adminClient().from('templates').update({ active }).eq('id', id);
  if (error) return { ok: false, error: 'Не удалось переключить шаблон' };
  await audit('platform.notif_template_toggled', 'templates', id, { active });
  return { ok: true };
}

// ---------- бэкапы (реальные файлы из storage) ----------

export type BackupFile = { name: string; size: number; updated: string };

export async function listBackupsAction(): Promise<BackupFile[]> {
  if (!(await requireSuperAdminAction())) return [];
  try {
    const { data } = await adminClient().storage.from('backups').list('', { limit: 50, sortBy: { column: 'updated_at', order: 'desc' } });
    return (data ?? [])
      .filter((f) => Boolean(f.name))
      .map((f) => ({ name: f.name, size: Number((f.metadata as { size?: number } | null)?.size ?? 0), updated: String(f.updated_at ?? '') }));
  } catch {
    return [];
  }
}

// ---------- фича-флаги (settings.platform:flags) ----------

export type FeatureFlag = { key: string; name: string; on: boolean; roll: number };

const FLAGS_KEY = 'platform:flags';
const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: 'new_booking_widget', name: 'Новый виджет записи', on: true, roll: 20 },
  { key: 'locale_en', name: 'Локализация (EN)', on: false, roll: 0 },
  { key: 'paid_addons', name: 'Платные допы', on: true, roll: 100 },
];

export async function getFeatureFlagsAction(): Promise<FeatureFlag[]> {
  if (!(await requireSuperAdminAction())) return DEFAULT_FLAGS;
  try {
    const { data } = await adminClient().from('settings').select('value').eq('key', FLAGS_KEY).maybeSingle<{ value: FeatureFlag[] | null }>();
    const saved = Array.isArray(data?.value) ? data.value : [];
    return DEFAULT_FLAGS.map((d) => {
      const hit = saved.find((s) => s?.key === d.key);
      return hit ? { key: d.key, name: d.name, on: Boolean(hit.on), roll: Number(hit.roll) || 0 } : d;
    });
  } catch {
    return DEFAULT_FLAGS;
  }
}

export async function saveFeatureFlagsAction(flags: FeatureFlag[]): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const clean = flags.map((f) => ({
    key: String(f.key),
    name: String(f.name),
    on: Boolean(f.on),
    roll: Math.max(0, Math.min(100, Math.round(Number(f.roll) || 0))),
  }));
  const { error } = await adminClient()
    .from('settings')
    .upsert({ key: FLAGS_KEY, value: clean, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: 'Не удалось сохранить флаги' };
  await audit('platform.flags_saved', 'settings', null, { count: clean.length });
  return { ok: true };
}

// ---------- настройки партнёрской программы ----------
// Процент бонуса наставнику и шаблоны первого сообщения по нишам.
// Ключи: referral_percent (процент в jsonb) и outreach_template:<ниша> (jsonb с полем text).

export type PartnerProgramSettings = { percent: number; templates: Record<string, string> };

const OUTREACH_NICHES = [
  'detailing', 'auto-service', 'tire-service', 'barbershop', 'sauna',
  'manicure', 'dentistry', 'vet', 'cleaning', 'photographer', 'tutor',
] as const;

// Экшен доступен по отдельному POST-эндпоинту: валидируем всё, что пришло с клиента.
// Иначе «abc» в проценте молча превращался в 0 и обнулял всю партнёрскую программу.
const PartnerProgramInput = z.object({
  percent: z.number().finite().min(0).max(100),
  templates: z.record(z.string().max(2000)).default({}),
});

export async function getPartnerProgramAction(): Promise<{ ok: boolean; value: PartnerProgramSettings }> {
  const fallback: PartnerProgramSettings = { percent: 10, templates: {} };
  if (!(await requireSuperAdminAction())) return { ok: false, value: fallback };
  const keys = ['referral_percent', ...OUTREACH_NICHES.map((n) => `outreach_template:${n}`)];
  const { data } = await adminClient().from('settings').select('key, value').in('key', keys);
  const value: PartnerProgramSettings = { percent: 10, templates: {} };
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    const v = row.value as { percent?: number; text?: string } | null;
    // Строку могли поправить напрямую в БД — не показываем и не применяем невалидный процент.
    if (row.key === 'referral_percent' && v && Number.isFinite(Number(v.percent))) {
      value.percent = Math.max(0, Math.min(100, Number(v.percent)));
    }
    if (row.key.startsWith('outreach_template:') && v?.text) {
      value.templates[row.key.slice('outreach_template:'.length)] = String(v.text);
    }
  }
  return { ok: true, value };
}

export async function savePartnerProgramAction(input: PartnerProgramSettings): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return denied;
  const parsed = PartnerProgramInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Проверьте процент и тексты шаблонов' };
  const percent = Math.round(parsed.data.percent);
  const rows: { key: string; value: Record<string, unknown>; updated_at: string }[] = [
    { key: 'referral_percent', value: { percent }, updated_at: new Date().toISOString() },
  ];
  for (const niche of OUTREACH_NICHES) {
    const text = String(parsed.data.templates[niche] ?? '').trim();
    // Пустой шаблон удаляем: тогда партнёры увидят встроенный текст по умолчанию.
    rows.push({ key: `outreach_template:${niche}`, value: text ? { text } : {}, updated_at: new Date().toISOString() });
  }
  const { error } = await adminClient().from('settings').upsert(rows, { onConflict: 'key' });
  if (error) return { ok: false, error: 'Не удалось сохранить настройки' };
  await audit('platform.partner_program_saved', 'settings', null, { percent, niches: Object.keys(input.templates ?? {}).length });
  return { ok: true };
}
