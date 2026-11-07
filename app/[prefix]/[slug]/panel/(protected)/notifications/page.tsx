// app/[prefix]/[slug]/panel/(protected)/notifications/page.tsx — подключение Telegram (ТЗ §18.3, §36).
// Сервер отдаёт начальное состояние (подключён / действующий код), дальше — клиентский TelegramConnect.
import { currentOwner } from '@/lib/owner-session';
import { botUsername } from '@/телеграмм-бот/telegram';
import { loadTelegramState } from './telegram-state';
import { DISCONNECTED_STATE } from './telegram-view';
import TelegramConnect from './TelegramConnect';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({ params }: { params: { prefix: string; slug: string } }) {
  // Layout уже редиректит без доступа; повторная проверка — защита, если страницу отрендерят отдельно.
  const access = await currentOwner(params.slug);
  if (!access) return <p role="alert">Сессия истекла. Войдите в кабинет заново.</p>;
  const [state, botName] = await Promise.all([loadTelegramState(access.business.id), botUsername('business')]);

  return (
    <div className="grid max-w-[560px] gap-6">
      <h1 className="text-[24px] font-semibold">Уведомления</h1>
      <section aria-labelledby="tg-title" className="grid gap-3">
        <h2 id="tg-title" className="text-[18px] font-semibold">Telegram</h2>
        <p className="text-[14px] text-[#6b6b6b]">Мгновенные уведомления о новых записях, отменах и переносах.</p>
        <p className="text-[14px] text-[#6b6b6b]">В этот же чат можно написать команде платформы — сообщение попадёт в поддержку, ответ придёт сюда.</p>
        {state === null && (
          <p role="alert" className="text-[14px] text-[#dc2626]">Не удалось загрузить статус. Обновите страницу.</p>
        )}
        <TelegramConnect prefix={params.prefix} slug={params.slug} botName={botName} initial={state ?? DISCONNECTED_STATE} />
      </section>
      <p className="text-[14px] text-[#6b6b6b]">Email-уведомления приходят на адреса из настроек.</p>
    </div>
  );
}
