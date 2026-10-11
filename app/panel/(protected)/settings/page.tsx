// app/panel/(protected)/settings/page.tsx — настройки платформы (ТЗ §5.4 /panel/settings, §29).
// Vercel-токен и Supabase-ключи хранятся в переменных окружения сервера, не в базе. Здесь показывается только их наличие.
import { adminClient } from '@/lib/supabase';
import { saveRequisites, saveTariffs, saveDefaultPrice, saveRateLimits, saveFlags } from './actions';

export const dynamic = 'force-dynamic';

type Obj = Record<string, any>;

export default async function PlatformSettings() {
  const { data } = await adminClient().from('settings').select('key, value');
  const s: Record<string, Obj> = Object.fromEntries((data ?? []).map((r) => [r.key, r.value as Obj]));
  const req = s.platform_requisites ?? {};
  const tariffs = s.tariffs ?? { basic: { name: 'Базовый', price: 1000 }, pro: { name: 'Про', price: 2500 } };
  const price = s.default_price ?? { initial: 5000, monthly: 1000 };
  const limits = s.rate_limits ?? { booking_per_10min: 5, cancel_per_15min: 10 };
  const flags = s.feature_flags ?? { ai_assistant: false, telegram_clients: false };
  const env = (k: string) => (process.env[k] ? 'задан' : 'не задан');

  return (
    <div className="grid max-w-[640px] gap-10 text-[14px]">
      <h1 className="text-[24px] font-semibold">Настройки платформы</h1>

      <section>
        <h2 className="text-[18px] font-semibold">Реквизиты (§29)</h2>
        <form action={saveRequisites} className="mt-3 grid gap-2">
          {[['fio', 'ФИО'], ['inn', 'ИНН'], ['email', 'Email'], ['phone', 'Телефон'], ['city', 'Город'], ['card', 'Карта для переводов'], ['bank', 'Банк'], ['nalog_url', 'Ссылка «Мой налог»']].map(([k, l]) => (
            <label key={k} className="grid gap-1">{l}<input name={k} defaultValue={req[k] ?? ''} className="input" /></label>
          ))}
          <label className="grid gap-1">Текст оферты<textarea name="oferta" defaultValue={req.oferta ?? ''} className="input h-[140px] py-2" /></label>
          <label className="grid gap-1">Текст политики<textarea name="policy" defaultValue={req.policy ?? ''} className="input h-[140px] py-2" /></label>
          <button className="btn-primary w-fit" type="submit">Сохранить реквизиты</button>
        </form>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Тарифы</h2>
        <form action={saveTariffs} className="mt-3 grid grid-cols-2 gap-2">
          <input name="basic_name" defaultValue={tariffs.basic?.name} className="input" />
          <input name="basic_price" type="number" defaultValue={tariffs.basic?.price} className="input" />
          <input name="pro_name" defaultValue={tariffs.pro?.name} className="input" />
          <input name="pro_price" type="number" defaultValue={tariffs.pro?.price} className="input" />
          <button className="btn-primary col-span-2 w-fit" type="submit">Сохранить тарифы</button>
        </form>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Цены по умолчанию</h2>
        <form action={saveDefaultPrice} className="mt-3 grid grid-cols-2 gap-2">
          <input name="initial" type="number" defaultValue={price.initial} className="input" placeholder="Разово" />
          <input name="monthly" type="number" defaultValue={price.monthly} className="input" placeholder="В месяц" />
          <button className="btn-primary col-span-2 w-fit" type="submit">Сохранить</button>
        </form>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Rate limit</h2>
        <form action={saveRateLimits} className="mt-3 grid grid-cols-2 gap-2">
          <input name="booking" type="number" defaultValue={limits.booking_per_10min} className="input" placeholder="Броней за 10 мин" />
          <input name="cancel" type="number" defaultValue={limits.cancel_per_15min} className="input" placeholder="Отмен за 15 мин" />
          <button className="btn-primary col-span-2 w-fit" type="submit">Сохранить</button>
        </form>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Feature flags</h2>
        <form action={saveFlags} className="mt-3 grid gap-2">
          <label className="flex items-center gap-2"><input type="checkbox" name="ai_assistant" value="1" defaultChecked={flags.ai_assistant} /> ИИ-помощник</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="telegram_clients" value="1" defaultChecked={flags.telegram_clients} /> Telegram для клиентов</label>
          <button className="btn-primary w-fit" type="submit">Сохранить</button>
        </form>
      </section>

      <section>
        <h2 className="text-[18px] font-semibold">Интеграции (из окружения)</h2>
        <ul className="mt-2 grid gap-1 text-[#666666]">
          <li>Vercel API token: {env('VERCEL_API_TOKEN')}</li>
          <li>Vercel project id: {env('VERCEL_PROJECT_ID')}</li>
          <li>Telegram бот: {env('TELEGRAM_BOT_TOKEN')}, чат: {env('TELEGRAM_CHAT_ID')}</li>
          <li>Supabase service role: {env('SUPABASE_SERVICE_ROLE_KEY')}</li>
        </ul>
      </section>
    </div>
  );
}
