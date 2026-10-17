'use server';
// app/panel/(protected)/clients/actions.ts — клиенты: оплата, продление, отключение, напоминание, отказ,
// передача кода, создание доступа (ТЗ §13.5, §14.2–14.4).
// Каждое действие: guarded (права) → zod → один условный UPDATE … RETURNING → audit без ПД → результат для тоста.
// Условие на статус в самом UPDATE делает операции идемпотентными: двойной клик не продлит подписку дважды
// от одной и той же даты и не отметит оплату повторно.
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { notifyAdmin } from '@/lib/admin-notify';
import { sendMail } from '@/lib/notify';
import { errorMessage, logError } from '@/lib/log';
import { SITE_URL } from '@/lib/site';
import { fail, formObject, guarded, ok, zodFail, type ActionResult } from '../_lib/action';
import {
  DEFAULT_INITIAL, DEFAULT_MONTHLY, NOT_PAYABLE, clientOpSchema, extendFrom, predictPatch,
  accessSchema, type ClientOp, type ClientPatch,
} from './schema';

const CLIENTS_PATH = '/panel/clients';
const PASSWORD_BYTES = 12;

type Result = ActionResult<ClientPatch>;
type Prices = { initial: number; monthly: number };
type Patch = Record<string, unknown>;

function revalidate(id: string): void {
  revalidatePath(CLIENTS_PATH);
  revalidatePath(`/panel/businesses/${id}`);
}

// Цены из /panel/settings (default_price). Нет записи — значения из ТЗ §14.2 (5000 ₽ + 1000 ₽/мес).
async function prices(): Promise<Prices> {
  const { data, error } = await adminClient().from('settings').select('value').eq('key', 'default_price').maybeSingle<{ value: Partial<Prices> | null }>();
  // Сбой чтения ≠ «настроек нет»: иначе оплата молча запишется по ценам по умолчанию вместо настроенных.
  if (error) throw new Error(error.message);
  const v = data?.value ?? {};
  const pick = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : d);
  return { initial: pick(v.initial, DEFAULT_INITIAL), monthly: pick(v.monthly, DEFAULT_MONTHLY) };
}

type Cond = { eq?: string; notIn?: readonly string[]; active?: boolean; untilIs?: string | null; noTransfer?: boolean };

// Один UPDATE с условием. Пустой RETURNING = условие не выполнено (статус уже другой) → понятная ошибка.
async function conditionalUpdate(id: string, patch: Patch, c: Cond): Promise<boolean> {
  let q = adminClient().from('businesses').update(patch).eq('id', id);
  if (c.eq) q = q.eq('status', c.eq);
  if (c.notIn?.length) q = q.not('status', 'in', `(${c.notIn.join(',')})`);
  if (c.active !== undefined) q = q.eq('subscription_active', c.active);
  if (c.untilIs !== undefined) q = c.untilIs === null ? q.is('subscription_until', null) : q.eq('subscription_until', c.untilIs);
  if (c.noTransfer) q = q.is('code_transferred_at', null);
  const { data, error } = await q.select('id').returns<{ id: string }[]>();
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

async function markPaid(id: string): Promise<Result> {
  const p = await prices();
  const patch = predictPatch('paid', { subscription_until: null }, new Date(), p.monthly);
  const now = new Date().toISOString();
  const okUpd = await conditionalUpdate(id, { ...patch, subscription_started_at: now }, { notIn: NOT_PAYABLE });
  if (!okUpd) return fail('Оплата уже отмечена или бизнес недоступен');
  await audit('mark_paid', 'business', id, { amount: p.initial, monthly: p.monthly, until: patch.subscription_until });
  // Уведомление в Telegram — без названия и контактов бизнеса (только id): канал внешний.
  await notifyAdmin(`Оплата ${p.initial} ₽: бизнес ${id}`);
  return ok(`Оплата ${p.initial.toLocaleString('ru-RU')} ₽ отмечена. Подписка до ${patch.subscription_until}`, patch);
}

// Продление: optimistic-lock по текущей дате окончания — два параллельных клика не дадут +60 дней.
async function extend(id: string): Promise<Result> {
  const { data: b, error } = await adminClient().from('businesses').select('subscription_until, status').eq('id', id).maybeSingle<{ subscription_until: string | null; status: string }>();
  if (error) throw new Error(error.message);
  if (!b || b.status !== 'client') return fail('Продлить можно только клиенту');
  const until = extendFrom(b.subscription_until);
  const okUpd = await conditionalUpdate(id, { subscription_until: until, subscription_active: true }, { eq: 'client', untilIs: b.subscription_until });
  if (!okUpd) return fail('Подписку только что изменили. Обновите страницу.');
  await audit('extend_subscription', 'business', id, { from: b.subscription_until, until });
  return ok(`Подписка продлена до ${until}`, { subscription_until: until, subscription_active: true });
}

async function disable(id: string): Promise<Result> {
  if (!(await conditionalUpdate(id, { subscription_active: false }, { eq: 'client', active: true }))) return fail('Подписка уже отключена');
  await audit('subscription_disable', 'business', id, {});
  return ok('Подписка отключена. Сайт покажет заглушку.', { subscription_active: false });
}

async function refuse(id: string): Promise<Result> {
  const patch = { status: 'refused', refused_at: new Date().toISOString() };
  if (!(await conditionalUpdate(id, patch, { notIn: [...NOT_PAYABLE, 'refused'] }))) return fail('Отказ нельзя отметить для клиента');
  await audit('mark_refused', 'business', id, { to: 'refused' });
  return ok('Отмечен отказ. Через 30 дней — архив.', { status: 'refused', removed: true });
}

// «Передать код» (ТЗ §14.4): фиксируем дату передачи и срок поддержки. Сам архив — «Скачать код» (/api/transfer, агент 11).
async function transfer(id: string): Promise<Result> {
  const patch = predictPatch('transfer', { subscription_until: null });
  if (!(await conditionalUpdate(id, patch, { eq: 'client', noTransfer: true }))) return fail('Код уже передан или бизнес не клиент');
  await audit('transfer_mark', 'business', id, { support_until: patch.support_until });
  return ok(`Код передан. Поддержка до ${patch.support_until}`, patch);
}

// Напоминание об оплате на email бизнеса. Адрес в журнал не пишем — только факт отправки.
async function remind(id: string): Promise<Result> {
  const { data: b, error } = await adminClient().from('businesses').select('name, emails, subscription_until, status').eq('id', id).maybeSingle<{ name: string; emails: string[] | null; subscription_until: string | null; status: string }>();
  if (error) throw new Error(error.message);
  if (!b || b.status !== 'client') return fail('Напоминание — только клиентам');
  const to = b.emails?.[0];
  if (!to) return fail('У бизнеса нет email');
  const p = await prices();
  const until = b.subscription_until ?? 'не указан';
  const text = `${b.name}, подписка на сайт онлайн-записи действует до ${until}. Сумма продления: ${p.monthly} ₽. Реквизиты — в кабинете, раздел «Подписка».`;
  const sent = await sendMail({ to, subject: 'Продление подписки', text }).catch(async (e: unknown) => {
    await logError('email', errorMessage(e), { action: 'payment_reminder', business: id });
    return false;
  });
  if (!sent) return fail('Письмо не отправлено: нет активного ящика или ошибка SMTP (см. «Логи»)');
  await audit('payment_reminder', 'business', id, { until });
  return ok('Напоминание отправлено', {});
}

const HANDLERS: Record<ClientOp, (id: string) => Promise<Result>> = { paid: markPaid, extend, disable, remind, refuse, transfer };
const idSchema = z.string().uuid();

// Единая точка для кнопок таблицы (optimistic на клиенте, откат при ok=false).
export async function clientAction(id: string, op: string): Promise<Result> {
  return await guarded(`clients.${op}`, async () => {
    const pid = idSchema.safeParse(id);
    const pop = clientOpSchema.safeParse(op);
    if (!pid.success || !pop.success) return fail('Неизвестное действие');
    const res = await HANDLERS[pop.data](pid.data);
    if (res.ok) revalidate(pid.data);
    return res;
  });
}

export type AccessCreated = { email: string; password: string; mailed: boolean };

type AccessTarget = { status: string; slug: string; custom_domain: string | null; vertical_templates: { url_prefix: string } | null };

// Адрес входа владельца (ТЗ §13.9): свой домен → клиент.ру/panel, иначе /{prefix}/{slug}/panel.
function ownerLoginUrl(b: AccessTarget): string {
  if (b.custom_domain) return `https://${b.custom_domain}/panel/login`;
  return b.vertical_templates ? `${SITE_URL}/${b.vertical_templates.url_prefix}/${b.slug}/panel/login` : `${SITE_URL}/panel/login`;
}

// Письмо access_created (ТЗ §19.2): email, пароль, ссылка, инструкция.
function accessMail(email: string, password: string, url: string): { subject: string; text: string } {
  return {
    subject: 'Доступ к админке сайта онлайн-записи',
    text: [
      'Здравствуйте! Для вас создан доступ к админке сайта.',
      `Вход: ${url}`,
      `Логин: ${email}`,
      `Пароль: ${password}`,
      'Что дальше: заполните услуги и цены, загрузите фото работ, проверьте контакты и рабочее время.',
      'Пароль никому не передавайте. Это письмо после входа лучше удалить.',
    ].join('\n'),
  };
}

// «Создать доступ» (ТЗ §14.2 п.2–3, §19.2): пароль генерируется, уходит владельцу письмом и показывается
// супер-админу один раз — в ответе действия (без cookie: после перезагрузки страницы пароль не виден).
export async function createOwnerAccess(_prev: ActionResult<AccessCreated> | null, formData: FormData): Promise<ActionResult<AccessCreated>> {
  return await guarded('clients.create_access', async () => {
    const parsed = accessSchema.safeParse(formObject(formData));
    if (!parsed.success) return zodFail(parsed.error);
    const { id, email } = parsed.data;
    const db = adminClient();
    const { data: b, error: readError } = await db.from('businesses').select('status, slug, custom_domain, vertical_templates(url_prefix)').eq('id', id).maybeSingle<AccessTarget>();
    if (readError) throw new Error(readError.message);
    if (!b || b.status !== 'client') return fail('Доступ создаётся только клиенту после оплаты');
    const password = randomBytes(PASSWORD_BYTES).toString('base64url');
    const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !created.user) return fail('Пользователь с таким email уже есть или email отклонён', { email: 'Этот email уже зарегистрирован' });
    const link = await db.from('admin_users').insert({ business_id: id, email, role: 'owner', auth_user_id: created.user.id });
    if (link.error) {
      // Без строки admin_users учётка бесполезна — удаляем, чтобы можно было повторить с тем же email.
      await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw new Error(link.error.message);
    }
    const mail = accessMail(email, password, ownerLoginUrl(b));
    const mailed = await sendMail({ to: email, ...mail }).catch(() => false);
    if (!mailed) await logError('email', 'access_created: письмо не отправлено', { business: id });
    await audit('create_access', 'business', id, { role: 'owner', mailed });
    revalidate(id);
    return ok(mailed ? 'Доступ создан, пароль отправлен владельцу' : 'Доступ создан. Письмо не ушло — передайте пароль вручную', { email, password, mailed });
  });
}
