'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCheckoutForPay, markCheckoutPaid, updateCheckoutEntrepreneur, yookassaConfigured } from '@/lib/partners';

// Публичный тестовый «переход к оплате».
// Безопасность: действие доступно ТОЛЬКО когда ЮKassa не настроена (тестовый режим).
// Иначе любой, кто знает id счёта, мог бы пометить его оплаченным без денег.
export async function simulatePaymentAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  if (yookassaConfigured()) {
    // Боевой режим: тестовая оплата запрещена, отправляем на реальную страницу счёта.
    redirect(`/pay/${id}`);
  }

  const checkout = await getCheckoutForPay(id);
  // Повторная «оплата» уже оплаченного счёта и отменённых/просроченных не имеет смысла.
  if (!checkout || checkout.status === 'paid' || checkout.status === 'cancelled' || checkout.status === 'expired') {
    redirect(`/pay/${id}`);
  }

  await markCheckoutPaid(id);
  redirect(`/pay/${id}?paid=1`);
}

// Правка контактов предпринимателя со страницы счёта. Разрешена, пока счёт не оплачен:
// после оплаты данные зафиксированы, иначе ссылку можно использовать для подмены.
export async function updateCheckoutEntrepreneurAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const checkout = await getCheckoutForPay(id);
  if (!checkout || checkout.status === 'paid') return;

  await updateCheckoutEntrepreneur(id, {
    name: String(formData.get('entrepreneurName') ?? '').slice(0, 120),
    email: String(formData.get('entrepreneurEmail') ?? '').slice(0, 160),
    phone: String(formData.get('entrepreneurPhone') ?? '').slice(0, 40),
  });
  revalidatePath(`/pay/${id}`);
}
