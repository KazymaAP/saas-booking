'use server';
// app/panel/(protected)/email-accounts/actions.ts — ящики рассылки: создание/правка, вкл/выкл, сброс лимита,
// удаление, проверка SMTP/IMAP, тестовое письмо (ТЗ §4.16, §9.1, §13).
// Каждый action сам проверяет супер-админа: layout защищает страницу, но не прямой POST на action.
// CSRF: Next.js 14 сверяет Origin с Host для server actions и отклоняет чужие запросы.
import { revalidatePath } from 'next/cache';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/admin-session';
import { encryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';
import { maskEmail, maskPii, sendMailDetailed, isValidEmail } from '@/lib/notify';
import {
  ACCOUNT_COLUMNS, imapOptions, invalidateAccountCache, shortError, smtpOptions, todayMsk, type EmailAccountRecord,
} from '@/lib/email-accounts';
import { isUuidValue, parseAccountForm, type AccountInput } from '@/lib/email-panel';

export type ActionState = { ok: boolean; message: string };

const PAGE = '/panel/email-accounts';
const TEST_TIMEOUT_MS = 10_000;
const DENIED: ActionState = { ok: false, message: 'Нет доступа' };
const BAD_ID: ActionState = { ok: false, message: 'Неверный ящик' };

function errText(e: unknown): string {
  return shortError(maskPii(e instanceof Error ? e.message : String(e)));
}

async function loadAccount(db: SupabaseClient, id: string): Promise<EmailAccountRecord | null> {
  const { data, error } = await db.from('email_accounts').select(ACCOUNT_COLUMNS).eq('id', id).limit(1);
  if (error) throw new Error(`email_accounts: ${error.message}`);
  return ((data ?? []) as unknown as EmailAccountRecord[])[0] ?? null;
}

// Строка для БД: пароли шифруются, пустой пароль при правке не перезаписывает сохранённый.
function accountRow(v: AccountInput): Record<string, string | number | boolean | null> {
  const row: Record<string, string | number | boolean | null> = {
    email: v.email, from_name: v.from_name, reply_to: v.reply_to,
    smtp_host: v.smtp_host, smtp_port: v.smtp_port, smtp_secure: v.smtp_secure, smtp_user: v.smtp_user,
    imap_host: v.imap_host, imap_port: v.imap_port, imap_secure: v.imap_secure, imap_user: v.imap_user,
    daily_limit: v.daily_limit,
  };
  if (v.smtp_pass) row.smtp_pass_encrypted = encryptSecret(v.smtp_pass);
  if (v.imap_pass) row.imap_pass_encrypted = encryptSecret(v.imap_pass);
  return row;
}

async function done(action: string, id: string | null, payload: Record<string, unknown>, message: string): Promise<ActionState> {
  invalidateAccountCache();
  await audit(action, 'email_account', id, payload).catch((e: unknown) => logError('email', `audit ${action}: ${errText(e)}`));
  revalidatePath(PAGE);
  return { ok: true, message };
}

// Создание (нет id) или правка (есть id). Подходит для useFormState: (prev, formData).
export async function saveEmailAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  if (!isEncryptionConfigured()) return { ok: false, message: 'Не задан ENCRYPTION_KEY — пароль нельзя сохранить' };
  const id = String(formData.get('id') ?? '');
  const editing = id !== '';
  if (editing && !isUuidValue(id)) return BAD_ID;
  const parsed = parseAccountForm(formData, !editing);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const db = adminClient();
  const row = accountRow(parsed.value);
  const res = editing
    ? await db.from('email_accounts').update(row).eq('id', id)
    : await db.from('email_accounts').insert({ ...row, active: true, sent_today: 0, last_reset: todayMsk() });
  if (res.error) {
    const duplicate = res.error.code === '23505';
    if (!duplicate) await logError('email', `email_accounts save: ${res.error.message}`, { account: maskEmail(parsed.value.email) });
    return { ok: false, message: duplicate ? 'Такой ящик уже есть' : 'Не удалось сохранить ящик' };
  }
  const payload = { email: maskEmail(parsed.value.email), password_changed: Boolean(parsed.value.smtp_pass || parsed.value.imap_pass) };
  return done(editing ? 'email_account_update' : 'email_account_add', editing ? id : null, payload, editing ? 'Ящик обновлён' : 'Ящик добавлен');
}

async function patchAccount(id: string, patch: Record<string, number | boolean | string>, action: string, message: string): Promise<ActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  if (!isUuidValue(id)) return BAD_ID;
  const { error } = await adminClient().from('email_accounts').update(patch).eq('id', id);
  if (error) {
    await logError('email', `email_accounts ${action}: ${error.message}`);
    return { ok: false, message: 'Не удалось сохранить изменение' };
  }
  return done(action, id, patch, message);
}

export async function setEmailAccountActive(id: string, active: boolean): Promise<ActionState> {
  return patchAccount(id, { active }, 'email_account_toggle', active ? 'Ящик включён' : 'Ящик выключен');
}

export async function resetEmailLimit(id: string): Promise<ActionState> {
  return patchAccount(id, { sent_today: 0, last_reset: todayMsk() }, 'email_account_reset', 'Счётчик за сегодня сброшен');
}

export async function deleteEmailAccount(id: string): Promise<ActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  if (!isUuidValue(id)) return BAD_ID;
  const { error } = await adminClient().from('email_accounts').delete().eq('id', id);
  if (error) {
    // FK из emails_outgoing/email_queue: ящик с историей удалить нельзя — только выключить.
    await logError('email', `email_accounts delete: ${error.message}`);
    return { ok: false, message: 'Ящик используется в истории писем — выключите его вместо удаления' };
  }
  return done('email_account_delete', id, {}, 'Ящик удалён');
}

async function checkSmtp(acc: EmailAccountRecord): Promise<string> {
  try {
    await nodemailer.createTransport(smtpOptions(acc)).verify();
    return 'SMTP: OK';
  } catch (e) {
    await logError('email', `smtp verify: ${errText(e)}`, { account: maskEmail(acc.email) });
    return `SMTP: ошибка (${errText(e)})`;
  }
}

async function checkImap(acc: EmailAccountRecord): Promise<string> {
  const opts = imapOptions(acc);
  if (!opts) return 'IMAP: не настроен';
  const client = new ImapFlow({ ...opts, logger: false, disableAutoIdle: true, connectionTimeout: TEST_TIMEOUT_MS, greetingTimeout: TEST_TIMEOUT_MS, socketTimeout: TEST_TIMEOUT_MS });
  try {
    await client.connect();
    await client.logout();
    return 'IMAP: OK';
  } catch (e) {
    client.close();
    await logError('email', `imap verify: ${errText(e)}`, { account: maskEmail(acc.email) });
    return `IMAP: ошибка (${errText(e)})`;
  }
}

// Проверка подключения: SMTP (verify) и IMAP (вход/выход). Результат пишется в last_error/last_checked_at.
export async function testEmailAccount(id: string): Promise<ActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  if (!isUuidValue(id)) return BAD_ID;
  const db = adminClient();
  let acc: EmailAccountRecord | null;
  try {
    acc = await loadAccount(db, id);
  } catch (e) {
    await logError('email', `email-accounts test load: ${errText(e)}`);
    return { ok: false, message: 'Не удалось прочитать ящик из БД' };
  }
  if (!acc) return BAD_ID;
  if (!acc.smtp_pass_encrypted) return { ok: false, message: 'У ящика нет пароля' };
  const [smtp, imap] = await Promise.all([checkSmtp(acc), checkImap(acc)]);
  const ok = smtp.endsWith('OK') && !imap.includes('ошибка');
  const { error } = await db.from('email_accounts').update({ last_error: ok ? null : `${smtp}; ${imap}`, last_checked_at: new Date().toISOString() }).eq('id', id);
  if (error) await logError('email', `email_accounts status: ${error.message}`);
  revalidatePath(PAGE);
  return { ok, message: `${smtp}. ${imap}.` };
}

// Тестовое письмо строго с выбранного ящика (с повторами и учётом лимита — через sendMailDetailed).
export async function sendTestEmail(id: string, to: string): Promise<ActionState> {
  if (!(await isSuperAdmin())) return DENIED;
  const target = to.trim().toLowerCase();
  if (!isUuidValue(id)) return BAD_ID;
  if (!isValidEmail(target)) return { ok: false, message: 'Укажите корректный адрес для теста' };
  const r = await sendMailDetailed({
    to: target,
    accountId: id,
    subject: 'Тест ящика рассылки',
    text: 'Тестовое письмо из панели. Если вы его видите, ящик настроен правильно.',
  });
  revalidatePath(PAGE);
  if (r.ok) return { ok: true, message: `Тест отправлен с ${r.fromEmail} (попыток: ${r.attempts})` };
  const reason = r.reason === 'no_account' ? 'ящик выключен, без пароля или исчерпан лимит' : shortError(r.error);
  return { ok: false, message: `Тест не отправлен: ${reason}` };
}
