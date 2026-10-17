// app/panel/(protected)/email-accounts/page.tsx — ящики рассылки Yandex 360 (ТЗ §4.16, §9.1).
// Серверная часть: загрузка без зашифрованных паролей (toPublicAccount); интерактив — в AccountsClient.
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { isEncryptionConfigured } from '@/lib/crypto';
import { ACCOUNT_COLUMNS, effectiveSentToday, todayMsk, toPublicAccount, type EmailAccountRecord } from '@/lib/email-accounts';
import { AccountsClient } from './AccountsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ящики рассылки' };

const MAX_ACCOUNTS = 100;

async function loadAccounts(): Promise<{ rows: EmailAccountRecord[]; failed: boolean }> {
  const { data, error } = await adminClient().from('email_accounts').select(ACCOUNT_COLUMNS).order('email').limit(MAX_ACCOUNTS);
  if (error) {
    await logError('email', `email-accounts page: ${error.message}`);
    return { rows: [], failed: true };
  }
  return { rows: (data ?? []) as unknown as EmailAccountRecord[], failed: false };
}

export default async function EmailAccountsPage() {
  const { rows, failed } = await loadAccounts();
  const today = todayMsk();
  // Счётчик показывается с учётом смены дня: вчерашние отправки не считаются, даже если cron сброса ещё не прошёл.
  const accounts = rows.map((a) => ({ ...toPublicAccount(a), sent_today: effectiveSentToday(a, today) }));
  const sent = accounts.reduce((s, a) => s + a.sent_today, 0);
  const capacity = accounts.filter((a) => a.active).reduce((s, a) => s + a.daily_limit, 0);

  return (
    <main id="email-accounts-page" className="grid gap-8" aria-labelledby="email-accounts-title">
      <header className="grid gap-2">
        <h1 id="email-accounts-title" className="text-[24px] font-semibold">Ящики рассылки</h1>
        <p className="text-[14px] text-[#666666]">
          Отправлено сегодня: <strong>{sent}</strong> из <strong>{capacity}</strong>. Пароли приложений хранятся только в зашифрованном виде (AES-256-GCM) и в браузер не передаются.
        </p>
        {!isEncryptionConfigured() && (
          <p role="alert" className="rounded-md bg-[#fef2f2] p-3 text-[14px] text-[#b91c1c]">Не задан ENCRYPTION_KEY: добавлять и менять пароли нельзя.</p>
        )}
        {failed && <p role="alert" className="rounded-md bg-[#fef2f2] p-3 text-[14px] text-[#b91c1c]">Не удалось загрузить ящики. Ошибка записана в журнал.</p>}
      </header>
      <AccountsClient accounts={accounts} />
    </main>
  );
}
