// app/admin/(protected)/settings/page.tsx — настройки платформы (ТЗ §13.1, §15.5): реквизиты, тарифы, цены, rate limit, флаги.
// Server Component: один SELECT нужных ключей, разбор с дефолтами (битая запись не ломает страницу).
// Права проверяет layout (рендер) и guarded в каждом action (POST).
// Vercel-токен и ключи Supabase хранятся в переменных окружения сервера, не в базе: здесь — только признак наличия.
import { adminClient } from '@/lib/supabase';
import { readSettings, SETTINGS_KEYS } from './schema';
import { DefaultPriceForm, FlagsForm, RateLimitsForm, RequisitesForm, TariffsForm } from './SettingsForms';

export const dynamic = 'force-dynamic';

const ENV_KEYS = [
  ['VERCEL_API_TOKEN', 'Vercel API token'],
  ['VERCEL_PROJECT_ID', 'Vercel project id'],
  ['TELEGRAM_BOT_TOKEN', 'Telegram-бот'],
  ['TELEGRAM_CHAT_ID', 'Telegram-чат оператора'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role'],
] as const;

export default async function PlatformSettingsPage() {
  const { data, error } = await adminClient().from('settings').select('key, value').in('key', [...SETTINGS_KEYS]).returns<{ key: string; value: unknown }[]>();
  const s = readSettings(data ?? []);

  // Публичная оферта подставляет эти поля как есть. Пока они пустые, документ печатает
  // «Исполнитель (ФИО не указано)» — с такой офертой нельзя ни принимать оплату, ни
  // отправлять её клиенту. Показываем прямо в настройках, а не после жалобы клиента.
  const req = s.platform_requisites;
  const missing = [
    req.fio.trim() ? null : 'ФИО или название ИП',
    req.inn.trim() ? null : 'ИНН',
    req.email.trim() ? null : 'email',
    req.phone.trim() ? null : 'телефон',
  ].filter((v): v is string => v !== null);

  return (
    <div className="grid max-w-[760px] gap-10 text-[14px]">
      <h1 className="text-[24px] font-semibold">Настройки платформы</h1>
      {error && (
        <p role="alert" className="rounded-md border border-[#dc2626] p-3 text-[#dc2626]">
          Не удалось загрузить настройки — показаны значения по умолчанию. Сохранение перезапишет их.
        </p>
      )}
      {missing.length > 0 && (
        <p role="alert" className="rounded-md border border-[#d97706] bg-[#fffbeb] p-3 text-[#92400e]">
          Реквизиты не заполнены: {missing.join(', ')}. Публичная оферта сейчас печатает
          «Исполнитель (ФИО не указано)», а счёт и чек выставить не на кого.
        </p>
      )}

      <RequisitesForm value={s.platform_requisites} />
      <TariffsForm value={s.tariffs} />
      <DefaultPriceForm value={s.default_price} />
      <RateLimitsForm value={s.rate_limits} />
      <FlagsForm value={s.feature_flags} />

      <section aria-labelledby="s-env" className="grid gap-2">
        <h2 id="s-env" className="text-[18px] font-semibold">Интеграции (из окружения сервера)</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {ENV_KEYS.map(([key, label]) => {
            const set = Boolean(process.env[key]);
            return (
              <div key={key} className="contents">
                <dt className="text-[#666666]">{label}</dt>
                <dd className={set ? 'text-[#16a34a]' : 'text-[#dc2626]'}>{set ? 'задан' : 'не задан'}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
