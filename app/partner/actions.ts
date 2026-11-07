'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createPartner, authenticatePartner, createLead, updateLead, deleteLead,
  markLeadReferralSent, createCheckout, createDraftSiteVizitka, type PartnerLead, type CheckoutVariant,
} from '@/lib/partners';
import {
  readPartnerSession, writePartnerSessionCookie, clearPartnerSessionCookie, createPartnerSession,
} from '@/lib/partners-auth';
import { allowAll } from '@/lib/auth-rate';
import { requestContext } from '@/lib/auth-request';

function requirePartnerId(): string {
  const s = readPartnerSession();
  if (!s) redirect('/partner/login');
  return s.partnerId;
}

export async function partnerAuthAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const mode = String(formData.get('mode') ?? 'login');
  const name = String(formData.get('name') ?? '');

  if (!email || !password) {
    redirect(`/partner/login?error=${encodeURIComponent('Введите email и пароль')}`);
  }

  const ctx = requestContext();
  if (!ctx.sameOrigin) {
    redirect(`/partner/login?error=${encodeURIComponent('Запрос отклонён')}`);
  }
  const allowed = await allowAll([['login_ip', ctx.ip], ['login_email', email]]);
  if (!allowed) {
    redirect(`/partner/login?error=${encodeURIComponent('Слишком много попыток. Попробуйте позже.')}`);
  }

  if (mode === 'register') {
    try {
      await createPartner({ email, name, password });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось зарегистрироваться';
      redirect(`/partner/login?error=${encodeURIComponent(msg)}`);
    }
  }

  const partner = await authenticatePartner(email, password);
  if (!partner) {
    redirect(`/partner/login?error=${encodeURIComponent('Неверный email или пароль')}`);
  }

  writePartnerSessionCookie(createPartnerSession(partner.id));
  redirect('/partner');
}

export async function partnerLogoutAction(): Promise<void> {
  clearPartnerSessionCookie();
  redirect('/partner/login');
}

export async function addLeadAction(formData: FormData): Promise<PartnerLead> {
  const partnerId = requirePartnerId();
  const lead = await createLead(partnerId, {
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    message: String(formData.get('message') ?? ''),
    source: String(formData.get('source') ?? ''),
  });
  revalidatePath('/partner');
  return lead;
}

export async function updateLeadAction(formData: FormData): Promise<void> {
  const partnerId = requirePartnerId();
  const id = String(formData.get('id') ?? '');
  await updateLead(id, partnerId, {
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    message: String(formData.get('message') ?? ''),
    source: String(formData.get('source') ?? ''),
    status: String(formData.get('status') ?? 'new'),
  });
  revalidatePath('/partner');
}

export async function markReferralSentAction(formData: FormData): Promise<void> {
  const partnerId = requirePartnerId();
  await markLeadReferralSent(String(formData.get('id') ?? ''), partnerId);
  revalidatePath('/partner');
}

export async function deleteLeadAction(formData: FormData): Promise<void> {
  const partnerId = requirePartnerId();
  await deleteLead(String(formData.get('id') ?? ''), partnerId);
  revalidatePath('/partner');
}

export type CheckoutResult = { ok: true; paymentUrl: string; label: string } | { ok: false; error: string };

export async function createCheckoutAction(formData: FormData): Promise<CheckoutResult> {
  try {
    const partnerId = requirePartnerId();
    const variant = String(formData.get('variant') ?? '') as CheckoutVariant;
    const customAmountRaw = String(formData.get('customAmount') ?? '');
    const customAmount = variant === 'custom' ? Number(customAmountRaw) : undefined;
    const { checkout, paymentUrl } = await createCheckout({
      partnerId,
      variant,
      customAmount,
      readySiteId: String(formData.get('readySiteId') ?? '') || undefined,
      entrepreneurName: String(formData.get('entrepreneurName') ?? ''),
      entrepreneurEmail: String(formData.get('entrepreneurEmail') ?? ''),
      entrepreneurPhone: String(formData.get('entrepreneurPhone') ?? ''),
    });
    revalidatePath('/partner');
    return { ok: true, paymentUrl, label: checkout.variant };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Не удалось создать счёт' };
  }
}

export type DraftSiteResult = { ok: true; slug: string; url: string } | { ok: false; error: string };

export async function createDraftSiteAction(formData: FormData): Promise<DraftSiteResult> {
  try {
    requirePartnerId();
    const name = String(formData.get('name') ?? '');
    const email = String(formData.get('email') ?? '');
    const phone = String(formData.get('phone') ?? '');
    if (!name.trim()) return { ok: false, error: 'Укажите название бизнеса' };
    const { slug } = await createDraftSiteVizitka({ name, email, phone });
    revalidatePath('/partner');
    const { SITE_URL } = await import('@/lib/site');
    return { ok: true, slug, url: `${SITE_URL}/d/${slug}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Не удалось создать сайт' };
  }
}
