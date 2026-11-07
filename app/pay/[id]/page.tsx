import { getCheckoutForPay, yookassaConfigured, getBusinessSlug } from '@/lib/partners';
import { SITE_URL } from '@/lib/site';
import { simulatePaymentAction, updateCheckoutEntrepreneurAction } from '../actions';

export const dynamic = 'force-dynamic';

const VARIANT_LABEL: Record<string, string> = {
  subscription_5000: 'Подписка на сайт-визитку — 5000 ₽/мес',
  code_5000: 'Покупка кода сайт-визитки — 5000 ₽',
  custom: 'Сайт-визитка (своя сумма)',
};

export default async function PayPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { paid?: string };
}) {
  const checkout = await getCheckoutForPay(params.id);

  if (!checkout) {
    return <ErrorState title="Счёт не найден" text="Возможно, ссылка устарела. Запросите новую у партнёра." />;
  }
  if (checkout.status === 'cancelled') {
    return <ErrorState title="Счёт отменён" text="Этот счёт был отменён партнёром." />;
  }
  if (checkout.status === 'expired') {
    return <ErrorState title="Счёт просрочен" text="Срок оплаты истёк. Запросите новый счёт у партнёра." />;
  }

  const isPaid = checkout.status === 'paid' || searchParams.paid === '1';
  if (isPaid) {
    let siteUrl: string | null = null;
    if (checkout.business_id) {
      const slug = await getBusinessSlug(checkout.business_id);
      if (slug) siteUrl = `${SITE_URL}/d/${slug}`;
    }
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-3xl border border-emerald-500/40 bg-zinc-900 p-8 text-center">
          <div className="text-4xl">✅</div>
          <h1 className="mt-3 text-2xl font-semibold text-white">Оплата прошла</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Спасибо! Ваша сайт-визитка готовится. С вами свяжется партнёр или команда поддержки.
          </p>
          {siteUrl && (
            <a href={siteUrl} className="mt-5 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-500">
              Открыть мою сайт-визитку
            </a>
          )}
        </div>
      </main>
    );
  }

  const expired = checkout.expires_at && new Date(checkout.expires_at).getTime() < Date.now();
  if (expired) {
    return <ErrorState title="Счёт просрочен" text="Срок оплаты истёк. Запросите новый счёт у партнёра." />;
  }

  const configured = yookassaConfigured();
  const payUrl = checkout.yookassa_confirmation_url;

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Счёт на оплату</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">{VARIANT_LABEL[checkout.variant] ?? 'Сайт-визитка'}</h1>
        <p className="mt-1 text-sm text-zinc-400">Для: {checkout.entrepreneur_name ?? 'предпринимателя'}</p>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center">
          <p className="text-xs text-zinc-500">Сумма к оплате</p>
          <p className="mt-1 text-4xl font-semibold text-white">{checkout.amount.toLocaleString('ru-RU')} ₽</p>
        </div>

        <form action={updateCheckoutEntrepreneurAction} className="mt-5 space-y-2">
          <input type="hidden" name="id" value={checkout.id} />
          <p className="text-xs text-zinc-400">Ваши контактные данные:</p>
          <input name="entrepreneurName" defaultValue={checkout.entrepreneur_name ?? ''} placeholder="Имя" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
          <input name="entrepreneurEmail" defaultValue={checkout.entrepreneur_email ?? ''} placeholder="Email" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
          <input name="entrepreneurPhone" defaultValue={checkout.entrepreneur_phone ?? ''} placeholder="Телефон" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
          <button className="w-full rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">Сохранить контакты</button>
        </form>

        <div className="mt-5">
          {configured && payUrl ? (
            <a href={payUrl} className="block rounded-xl bg-indigo-600 px-4 py-3 text-center font-medium text-white hover:bg-indigo-500">
              Перейти к оплате (ЮKassa)
            </a>
          ) : (
            <form action={simulatePaymentAction}>
              <input type="hidden" name="id" value={checkout.id} />
              <button className="block w-full rounded-xl bg-indigo-600 px-4 py-3 text-center font-medium text-white hover:bg-indigo-500">
                Оплатить (тестовый режим)
              </button>
            </form>
          )}
          {!configured && (
            <p className="mt-2 text-center text-xs text-amber-300/80">
              Платёжный шлюз не настроен — кнопка имитирует оплату. Для боя задайте ключи ЮKassa.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function ErrorState({ title, text }: { title: string; text: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-zinc-400">{text}</p>
      </div>
    </main>
  );
}
