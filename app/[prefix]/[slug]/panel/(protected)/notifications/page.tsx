// app/[prefix]/[slug]/panel/(protected)/notifications/page.tsx — подключение Telegram (ТЗ §36).
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { createTelegramCode, disconnectTelegram } from './actions';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = (await currentOwner(params.slug))!;
  const b = access.business;
  const { data: pending } = await adminClient()
    .from('business_telegram_codes').select('code, created_at')
    .eq('business_id', b.id).is('used_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const botName = process.env.TELEGRAM_BUSINESS_BOT_USERNAME ?? 'бот';
  const { prefix, slug } = params;

  return (
    <div className="grid max-w-[560px] gap-6">
      <h1 className="text-[24px] font-semibold">Уведомления</h1>
      {b.telegram_chat_id ? (
        <div className="grid gap-3">
          <p className="text-[14px]">Telegram подключён. Новые записи, отмены и переносы приходят в чат.</p>
          <form action={disconnectTelegram.bind(null, prefix, slug)}>
            <button type="submit" className="h-11 rounded-md border border-[#e5e5e5] px-4">Отключить</button>
          </form>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[14px]">Чтобы получать уведомления в Telegram, создайте код и отправьте боту команду <code>/start КОД</code>.</p>
          {pending && <p className="text-[14px]">Ваш код: <b>{pending.code}</b> — отправьте боту @{botName}: <code>/start {pending.code}</code></p>}
          <form action={createTelegramCode.bind(null, prefix, slug)}>
            <button type="submit" className="btn-primary">Создать код</button>
          </form>
        </div>
      )}
      <p className="text-[14px] text-[#666666]">Email-уведомления приходят на адреса из настроек.</p>
    </div>
  );
}
