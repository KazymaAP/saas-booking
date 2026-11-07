// app/[prefix]/[slug]/panel/(protected)/subscription/page.tsx — подписка владельца (ТЗ §5.3, §13.10, §14.1).
// Серверный: статус и даты считаются на сервере, клиентский только блок «Я оплатил».
// Только владелец: manager получает 404 (биллинг ему не показываем даже по прямой ссылке).
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { OWNER_ONLY, requirePageAccess } from '../_lib/access';
import { formatDate } from '../_lib/time';
import { subscriptionStatus, type SubscriptionTone } from '../_lib/subscription';
import { CopyButton } from '../_components/CopyButton';
import { PaidReport } from './PaidReport';

export const dynamic = 'force-dynamic';

// settings.value — jsonb, заполняется супер-админкой. Читаем только нужные строки и не доверяем форме.
const Requisites = z.object({
  card: z.string().optional(),
  bank: z.string().optional(),
  fio: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
}).catch({});
type RequisitesValue = z.infer<typeof Requisites>;

// Цвет — не единственный признак: рядом всегда текст статуса. Контраст текста ≥ 4.5:1.
const TONE: Record<SubscriptionTone, string> = {
  ok: 'border-[#86efac] bg-[#f0fdf4] text-[#14532d]',
  warn: 'border-[#fde047] bg-[#fefce8] text-[#713f12]',
  bad: 'border-[#fca5a5] bg-[#fef2f2] text-[#7f1d1d]',
};

function formatPrice(price: number | null): string {
  return price ? `${Number(price).toLocaleString('ru-RU')} ₽ в месяц` : 'не назначен';
}

export default async function SubscriptionPage({ params }: { params: { prefix: string; slug: string } }) {
  const { business: b } = await requirePageAccess(params, OWNER_ONLY);
  const { data, error } = await adminClient().from('settings').select('value').eq('key', 'platform_requisites').maybeSingle();
  const req = Requisites.parse(data?.value ?? {});
  // Сбой чтения реквизитов не роняет страницу (статус подписки важнее), но и не выдаётся за «реквизиты не указаны».
  const requisitesFailed = Boolean(error);
  const status = subscriptionStatus(b.subscription_active, b.subscription_until, Date.now());

  return (
    <div className="grid max-w-[640px] gap-5">
      <h1 className="!mb-0">Подписка</h1>

      <section aria-labelledby="sub-status-title" className={`grid gap-1 rounded-xl border p-4 ${TONE[status.tone]}`}>
        <h2 id="sub-status-title" className="!mb-0 text-[18px]">{status.label}</h2>
        <p className="!mb-0 text-[14px]">{status.text}</p>
      </section>

      <dl className="grid gap-2 rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 text-[14px] sm:grid-cols-[160px_1fr]">
        <dt className="text-[#595959]">Тариф</dt>
        <dd className="!m-0 font-medium">{b.plan_type ?? b.plan} · {formatPrice(b.subscription_price)}</dd>
        <dt className="text-[#595959]">Подключена</dt>
        <dd className="!m-0">{b.subscription_started_at ? formatDate(b.subscription_started_at) : '—'}</dd>
        <dt className="text-[#595959]">Оплачено до</dt>
        <dd className="!m-0">{b.subscription_until ? formatDate(b.subscription_until) : '—'}</dd>
      </dl>

      <section aria-labelledby="sub-pay-title" className="grid gap-3 rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4 text-[14px]">
        <h2 id="sub-pay-title" className="!mb-0">Продление</h2>
        <p className="!mb-0">Переведите сумму тарифа по реквизитам и нажмите «Я оплатил». Подписка продлевается на 30 дней после проверки.</p>
        {requisitesFailed
          ? <p role="alert" className="!mb-0 text-[#7f1d1d]">Не удалось загрузить реквизиты. Обновите страницу или нажмите «Я оплатил» — мы свяжемся с вами.</p>
          : <RequisitesList req={req} />}
      </section>

      <PaidReport slug={params.slug} defaultAmount={b.subscription_price ? String(b.subscription_price) : ''} />
    </div>
  );
}

function RequisitesList({ req }: { req: RequisitesValue }) {
  const rows: [string, string | undefined][] = [
    ['Карта / СБП', req.card], ['Банк', req.bank], ['Получатель', req.fio], ['Почта', req.email], ['Телефон', req.phone],
  ];
  const filled = rows.filter((r): r is [string, string] => Boolean(r[1]?.trim()));
  if (filled.length === 0) return <p className="!mb-0 text-[#595959]">Реквизиты ещё не указаны. Нажмите «Я оплатил» — мы свяжемся с вами.</p>;
  return (
    <dl className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
      {filled.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[#595959]">{label}</dt>
          {/* select-all — выделение одним касанием; кнопка — копирование без выделения (номер карты в банковское приложение). */}
          <dd className="!m-0 flex flex-wrap items-center gap-2">
            <span className="select-all break-all font-medium">{value}</span>
            <CopyButton text={value} describe={label} className="!px-2 text-[13px] md:!min-h-[36px]" />
          </dd>
        </div>
      ))}
    </dl>
  );
}
