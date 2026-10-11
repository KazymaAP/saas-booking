'use server';
// app/panel/(protected)/email-accounts/actions.ts — ящики: добавление, вкл/выкл, сброс лимита, удаление, тест подключения и тестовое письмо (ТЗ §5.4, §5.5).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import nodemailer from 'nodemailer';
import { adminClient } from '@/lib/supabase';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/log';

const UUID = /^[0-9a-f-]{36}$/i;
const PAGE = '/panel/email-accounts';

export async function addEmailAccount(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const pass = String(formData.get('pass') ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pass.length < 4) return;
  await adminClient().from('email_accounts').upsert({
    email,
    smtp_host: String(formData.get('smtp_host') ?? 'smtp.yandex.ru'),
    smtp_port: Number(formData.get('smtp_port') ?? 465),
    smtp_user: email,
    smtp_pass_encrypted: encryptSecret(pass),
    imap_host: String(formData.get('imap_host') ?? 'imap.yandex.ru'),
    imap_port: Number(formData.get('imap_port') ?? 993),
    daily_limit: Number(formData.get('daily_limit') ?? 50),
    active: true,
  }, { onConflict: 'email' });
  await audit('email_account_add', 'email_account', null, { email });
  revalidatePath(PAGE);
}

export async function toggleEmailAccount(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('email_accounts').update({ active: formData.get('active') === '1' }).eq('id', id);
  revalidatePath(PAGE);
}

export async function resetEmailLimit(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('email_accounts').update({ sent_today: 0 }).eq('id', id);
  revalidatePath(PAGE);
}

export async function deleteEmailAccount(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return;
  await adminClient().from('email_accounts').delete().eq('id', id);
  await audit('email_account_delete', 'email_account', id, {});
  revalidatePath(PAGE);
}

async function transportFor(id: string) {
  const { data: a } = await adminClient().from('email_accounts').select('*').eq('id', id).maybeSingle();
  if (!a?.smtp_pass_encrypted) return { acc: null, transport: null };
  const transport = nodemailer.createTransport({
    host: a.smtp_host!,
    port: a.smtp_port!,
    secure: a.smtp_port === 465,
    auth: { user: a.smtp_user ?? a.email, pass: decryptSecret(a.smtp_pass_encrypted) },
  });
  return { acc: a, transport };
}

// Тест подключения: SMTP verify. Результат показывается через параметр msg.
export async function testConnection(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  let msg = 'Неверный ящик';
  if (UUID.test(id)) {
    const { acc, transport } = await transportFor(id);
    if (!acc || !transport) msg = 'У ящика нет пароля';
    else {
      try {
        await transport.verify();
        msg = `Подключение ${acc.email}: OK`;
      } catch (e) {
        await logError('email', (e as Error).message, { account: acc.email });
        msg = `Подключение ${acc.email}: ошибка SMTP`;
      }
    }
  }
  redirect(`${PAGE}?msg=${encodeURIComponent(msg)}`);
}

// Тестовое письмо на адрес из формы.
export async function testSend(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '').trim();
  let msg = 'Укажите адрес для теста';
  if (UUID.test(id) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    const { acc, transport } = await transportFor(id);
    if (!acc || !transport) msg = 'У ящика нет пароля';
    else {
      try {
        await transport.sendMail({ from: acc.email, to, subject: 'Тест: онлайн-запись', text: 'Тестовое письмо. Если вы его видите, ящик работает.' });
        msg = `Тест отправлен на ${to}`;
      } catch (e) {
        await logError('email', (e as Error).message, { account: acc.email });
        msg = 'Тест не отправлен: ошибка SMTP';
      }
    }
  }
  redirect(`${PAGE}?msg=${encodeURIComponent(msg)}`);
}
