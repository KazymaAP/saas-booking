// lib/partners.ts — бизнес-логика партнёрской программы.
// Все обращения к БД идут через service_role (adminClient), RLS обходитcя; изоляция
// партнёров гарантируется фильтрацией по partner_id в каждом методе.
import { randomBytes, randomUUID } from 'crypto';
import { adminClient } from './supabase';
import { hashPassword, verifyPassword, generateReferralCode } from './partners-auth';
import { createYookassaPayment, isYookassaConfigured } from './yookassa';
import { SITE_URL } from './site';

export type Partner = {
  id: string;
  email: string;
  name: string | null;
  referral_code: string;
  payout_method: string | null;
  payout_details: string | null;
  status: string;
  created_at: string;
};

export type PartnerLead = {
  id: string;
  partner_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  source: string | null;
  status: string;
  referral_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CheckoutVariant = 'subscription_5000' | 'code_5000' | 'custom';

export type PartnerReadySite = {
  id: string;
  niche: string;
  title: string;
  slug: string;
  business_id: string | null;
  preview_url: string | null;
  description: string | null;
  is_active: boolean;
  sold_at: string | null;
  created_at: string;
};

export type PartnerCheckout = {
  id: string;
  partner_id: string;
  ready_site_id: string | null;
  business_id: string | null;
  variant: CheckoutVariant;
  amount: number;
  partner_commission: number;
  commission_type: 'recurring_monthly' | 'one_time';
  entrepreneur_name: string | null;
  entrepreneur_email: string | null;
  entrepreneur_phone: string | null;
  status: 'draft' | 'awaiting_payment' | 'paid' | 'cancelled' | 'expired';
  yookassa_payment_id: string | null;
  yookassa_confirmation_url: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerEarning = {
  id: string;
  partner_id: string;
  checkout_id: string | null;
  business_id: string | null;
  amount: number;
  type: 'recurring_monthly' | 'one_time';
  status: 'accrued' | 'paid_out' | 'cancelled';
  period_start: string | null;
  period_end: string | null;
  next_accrual_at: string | null;
  paid_out_at: string | null;
  created_at: string;
};

export type PartnerSummary = {
  totalAccrued: number;
  totalPaidOut: number;
  pending: number;
  recurringMonthly: number;
  oneTime: number;
};

// ---------- регистрация / вход ----------
export async function createPartner(input: {
  email: string;
  name?: string;
  password: string;
  /** Код пригласившего партнёра (PR-XXXX). Необязателен: обычная регистрация без приглашения. */
  referrerCode?: string | null;
}): Promise<Partner> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) throw new Error('Нужны email и пароль');
  const db = (adminClient() as any);
  const { data: existing } = await db.from('partners').select('id').eq('email', email).maybeSingle();
  if (existing) throw new Error('Партнёр с таким email уже есть');

  let referral_code = generateReferralCode();
  for (let i = 0; i < 5; i += 1) {
    const { data: clash } = await db.from('partners').select('id').eq('referral_code', referral_code).maybeSingle();
    if (!clash) break;
    referral_code = generateReferralCode();
  }

  const { data, error } = await db
    .from('partners')
    .insert({
      email,
      name: input.name?.trim() || null,
      password_hash: hashPassword(input.password),
      referral_code,
    })
    .select()
    .single();
  if (error) throw new Error(`Не удалось создать партнёра: ${error.message}`);
  const partner = data as unknown as Partner;

  // Наставник (второй уровень). Связь хранится в settings.partner_referrals —
  // миграция для этого не нужна; ошибка привязки не отменяет регистрацию.
  if (input.referrerCode) {
    try {
      const { linkReferrer } = await import('./referrals');
      await linkReferrer(partner.id, input.referrerCode);
    } catch {
      // регистрация важнее бонуса
    }
  }
  return partner;
}

export async function authenticatePartner(email: string, password: string): Promise<Partner | null> {
  const db = (adminClient() as any);
  const { data } = await db.from('partners').select('*').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (!data) return null;
  const partner = data as unknown as Partner & { password_hash: string };
  if (partner.status === 'blocked') return null;
  if (!verifyPassword(password, partner.password_hash)) return null;
  return partner;
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  const { data } = await (adminClient() as any).from('partners').select('*').eq('id', id).maybeSingle();
  return (data as unknown as Partner) ?? null;
}

// ---------- лиды ----------
export async function listLeads(partnerId: string): Promise<PartnerLead[]> {
  const { data, error } = await (adminClient() as any)
    .from('partner_leads')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as PartnerLead[]) ?? [];
}

export async function createLead(partnerId: string, input: {
  name?: string; phone?: string; email?: string; message?: string; source?: string;
}): Promise<PartnerLead> {
  const { data, error } = await (adminClient() as any)
    .from('partner_leads')
    .insert({
      partner_id: partnerId,
      name: input.name?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      message: input.message?.trim() || null,
      source: input.source?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as PartnerLead;
}

export async function updateLead(id: string, partnerId: string, patch: {
  name?: string; phone?: string; email?: string; message?: string; source?: string; status?: string;
}): Promise<void> {
  const { error } = await (adminClient() as any)
    .from('partner_leads')
    .update({
      name: patch.name?.trim() || null,
      phone: patch.phone?.trim() || null,
      email: patch.email?.trim() || null,
      message: patch.message?.trim() || null,
      source: patch.source?.trim() || null,
      status: patch.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('partner_id', partnerId);
  if (error) throw new Error(error.message);
}

export async function markLeadReferralSent(id: string, partnerId: string): Promise<void> {
  const { error } = await (adminClient() as any)
    .from('partner_leads')
    .update({ referral_sent_at: new Date().toISOString(), status: 'contacted', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('partner_id', partnerId);
  if (error) throw new Error(error.message);
}

export async function deleteLead(id: string, partnerId: string): Promise<void> {
  const { error } = await (adminClient() as any).from('partner_leads').delete().eq('id', id).eq('partner_id', partnerId);
  if (error) throw new Error(error.message);
}

// ---------- расчёт варианта сделки ----------
export type ComputedDeal = {
  amount: number;
  commission: number;
  commissionType: 'recurring_monthly' | 'one_time';
  label: string;
};

export function computeDeal(variant: CheckoutVariant, customAmount?: number): ComputedDeal {
  if (variant === 'subscription_5000') {
    return { amount: 5000, commission: 1000, commissionType: 'recurring_monthly', label: 'Подписка 5000₽/мес (партнёр +1000₽/мес)' };
  }
  if (variant === 'code_5000') {
    return { amount: 5000, commission: 1000, commissionType: 'one_time', label: 'Код сайт-визитки 5000₽ (партнёр +1000₽ разово)' };
  }
  const amt = Number(customAmount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Укажите сумму для кастомного варианта');
  const commission = Math.round(amt * 0.25 * 100) / 100;
  return { amount: amt, commission, commissionType: 'one_time', label: `Своя сумма ${amt.toFixed(0)}₽ (платформа 75%, партнёр 25% = ${commission.toFixed(0)}₽)` };
}

// ---------- чекауты (счета на оплату) ----------
export async function createCheckout(input: {
  partnerId: string;
  variant: CheckoutVariant;
  customAmount?: number;
  entrepreneurName?: string;
  entrepreneurEmail?: string;
  entrepreneurPhone?: string;
  readySiteId?: string;
}): Promise<{ checkout: PartnerCheckout; paymentUrl: string }> {
  const deal = computeDeal(input.variant, input.customAmount);
  const db = (adminClient() as any);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 дней на оплату

  // Если партнёр привязывает готовый сайт-визитку из каталога — берём его business_id,
  // чтобы при оплате активировать УЖЕ готовый сайт, а не создавать новый с нуля.
  let readySiteId: string | null = null;
  let businessId: string | null = null;
  if (input.readySiteId) {
    const { data: rs } = await db
      .from('partner_ready_sites')
      .select('id, business_id')
      .eq('id', input.readySiteId)
      .maybeSingle();
    if (rs) {
      readySiteId = rs.id;
      businessId = rs.business_id ?? null;
    }
  }

  const { data: inserted, error } = await db
    .from('partner_checkouts')
    .insert({
      id,
      partner_id: input.partnerId,
      ready_site_id: readySiteId,
      business_id: businessId,
      variant: input.variant,
      amount: deal.amount,
      partner_commission: deal.commission,
      commission_type: deal.commissionType,
      entrepreneur_name: input.entrepreneurName?.trim() || null,
      entrepreneur_email: input.entrepreneurEmail?.trim() || null,
      entrepreneur_phone: input.entrepreneurPhone?.trim() || null,
      status: 'awaiting_payment',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const checkout = inserted as unknown as PartnerCheckout;

  const returnUrl = `${SITE_URL}/pay/${checkout.id}`;
  const payment = await createYookassaPayment({
    amount: deal.amount,
    description: deal.label.slice(0, 128),
    returnUrl,
    idempotenceKey: checkout.id,
    metadata: { checkoutId: checkout.id, partnerId: input.partnerId },
  });

  const { error: updErr } = await db
    .from('partner_checkouts')
    .update({
      yookassa_payment_id: payment.id,
      yookassa_confirmation_url: payment.confirmationUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', checkout.id);
  if (updErr) throw new Error(updErr.message);

  checkout.yookassa_payment_id = payment.id;
  checkout.yookassa_confirmation_url = payment.confirmationUrl;
  // Партнёру отдаём нашу брендированную страницу счёта; она сама перенаправит на ЮKassa.
  return { checkout, paymentUrl: returnUrl };
}

export async function getCheckoutForPay(id: string): Promise<PartnerCheckout | null> {
  const { data } = await (adminClient() as any).from('partner_checkouts').select('*').eq('id', id).maybeSingle();
  return (data as unknown as PartnerCheckout) ?? null;
}

export async function updateCheckoutEntrepreneur(id: string, input: {
  name?: string; email?: string; phone?: string;
}): Promise<void> {
  const { error } = await (adminClient() as any)
    .from('partner_checkouts')
    .update({
      entrepreneur_name: input.name?.trim() || null,
      entrepreneur_email: input.email?.trim() || null,
      entrepreneur_phone: input.phone?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getBusinessSlug(businessId: string): Promise<string | null> {
  const { data } = await (adminClient() as any).from('businesses').select('slug').eq('id', businessId).maybeSingle();
  return (data as { slug: string } | null)?.slug ?? null;
}

// ---------- готовые сайт-визитки (каталог для партнёров) ----------
export async function listReadySites(): Promise<PartnerReadySite[]> {
  try {
    const { data, error } = await (adminClient() as any)
      .from('partner_ready_sites')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data as unknown as PartnerReadySite[]) ?? [];
  } catch {
    return [];
  }
}

export async function getReadySiteById(id: string): Promise<PartnerReadySite | null> {
  try {
    const { data } = await (adminClient() as any).from('partner_ready_sites').select('*').eq('id', id).maybeSingle();
    return (data as unknown as PartnerReadySite) ?? null;
  } catch {
    return null;
  }
}

export async function listCheckouts(partnerId: string): Promise<PartnerCheckout[]> {
  const { data, error } = await (adminClient() as any)
    .from('partner_checkouts')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as PartnerCheckout[]) ?? [];
}

// ---------- начисления ----------
export async function listEarnings(partnerId: string): Promise<PartnerEarning[]> {
  const { data, error } = await (adminClient() as any)
    .from('partner_earnings')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as PartnerEarning[]) ?? [];
}

export async function partnerSummary(partnerId: string): Promise<PartnerSummary> {
  const earnings = await listEarnings(partnerId);
  const summary: PartnerSummary = {
    totalAccrued: 0, totalPaidOut: 0, pending: 0, recurringMonthly: 0, oneTime: 0,
  };
  for (const e of earnings) {
    summary.totalAccrued += e.amount;
    if (e.status === 'paid_out') summary.totalPaidOut += e.amount;
    else summary.pending += e.amount;
    if (e.type === 'recurring_monthly') summary.recurringMonthly += e.amount;
    else summary.oneTime += e.amount;
  }
  return summary;
}

// ---------- оплата: активация бизнеса + начисление партнёру ----------
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return base || 'biz';
}

async function createBusinessForEntrepreneur(name: string, email: string | null, phone: string | null): Promise<string> {
  const db = (adminClient() as any);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = `${slugify(name) || 'biz'}-${randomBytes(3).toString('hex')}`;
    const { data, error } = await db
      .from('businesses')
      .insert({
        name: name.trim(),
        slug,
        status: 'sent',
        emails: email ? [email] : [],
        phones: phone ? [phone] : [],
        plan: 'pro',
        subscription_active: false,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!error && data) return (data as { id: string }).id;
    if (error && !String(error.message).includes('duplicate') && !String(error.code).includes('23505')) {
      throw new Error(error.message);
    }
  }
  throw new Error('Не удалось создать сайт-визитку (конфликт slug)');
}

// Идемпотентная обработка оплаты (вызывается из вебхука и при возврате со страницы).
export async function markCheckoutPaid(checkoutId: string): Promise<PartnerCheckout> {
  const db = (adminClient() as any);
  const { data: found, error: findErr } = await db.from('partner_checkouts').select('*').eq('id', checkoutId).maybeSingle();
  if (findErr) throw new Error(findErr.message);
  const checkout = found as unknown as PartnerCheckout | null;
  if (!checkout) throw new Error('Чекаут не найден');
  if (checkout.status === 'paid') return checkout;

  // Если чекаут уже привязан к готовому сайту (из каталога) — активируем ЕГО,
  // иначе создаём новый бизнес из данных предпринимателя.
  let businessId = checkout.business_id;
  if (!businessId) {
    const name = checkout.entrepreneur_name || 'Предприниматель';
    const email = checkout.entrepreneur_email;
    const phone = checkout.entrepreneur_phone;
    businessId = await createBusinessForEntrepreneur(name, email, phone);
  }

  const now = new Date();
  const inOneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Обновляем бизнес в зависимости от варианта.
  const bizPatch: Record<string, unknown> = { status: 'client', updated_at: now.toISOString() };
  if (checkout.variant === 'subscription_5000') {
    bizPatch.subscription_active = true;
    bizPatch.subscription_price = 5000;
    bizPatch.subscription_started_at = now.toISOString();
    bizPatch.subscription_until = inOneMonth.toISOString().slice(0, 10);
    bizPatch.plan = 'pro';
  } else if (checkout.variant === 'code_5000') {
    bizPatch.code_transferred_at = now.toISOString();
    bizPatch.subscription_active = false;
  } else {
    // custom — единоразовая продажа сайта по назначенной партнёром цене
    bizPatch.code_transferred_at = now.toISOString();
    bizPatch.subscription_active = false;
    bizPatch.subscription_price = checkout.amount;
  }
  const { error: bizErr } = await db.from('businesses').update(bizPatch).eq('id', businessId);
  if (bizErr) throw new Error(bizErr.message);

  // Платёж в таблице payments (типы уже существуют: subscription / code_buyout / other).
  const paymentType = checkout.variant === 'subscription_5000' ? 'subscription' : checkout.variant === 'code_5000' ? 'code_buyout' : 'other';
  await db.from('payments').insert({
    business_id: businessId,
    amount: checkout.amount,
    type: paymentType,
    period_start: now.toISOString().slice(0, 10),
    period_end: checkout.variant === 'subscription_5000' ? inOneMonth.toISOString().slice(0, 10) : null,
    paid_at: now.toISOString(),
    note: `Партнёрский чекаут ${checkout.id}`,
  });

  // Начисление партнёру.
  const earningPatch: Record<string, unknown> = {
    partner_id: checkout.partner_id,
    checkout_id: checkout.id,
    business_id: businessId,
    amount: checkout.partner_commission,
    type: checkout.commission_type,
    status: 'accrued',
  };
  if (checkout.commission_type === 'recurring_monthly') {
    earningPatch.period_start = now.toISOString().slice(0, 10);
    earningPatch.period_end = inOneMonth.toISOString().slice(0, 10);
    earningPatch.next_accrual_at = inOneMonth.toISOString();
  }
  await db.from('partner_earnings').insert(earningPatch);

  // Второй уровень: 10% от этого начисления получает наставник. Платит платформа,
  // у партнёра ничего не вычитается. Ошибки внутри не пробрасываются — оплата важнее.
  {
    const { accrueReferralBonus } = await import('./referrals');
    await accrueReferralBonus({
      partnerId: checkout.partner_id,
      baseAmount: Number(checkout.partner_commission),
      checkoutId: checkout.id,
      businessId,
    });
  }

  // Если счёт был привязан к готовому сайту из каталога — помечаем его проданным
  // (один готовый сайт — один предприниматель).
  if (checkout.ready_site_id) {
    await db
      .from('partner_ready_sites')
      .update({ is_active: false, sold_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', checkout.ready_site_id);
  }

  // Помечаем чекаут оплаченным.
  const { data: updated, error: updErr } = await db
    .from('partner_checkouts')
    .update({ status: 'paid', paid_at: now.toISOString(), business_id: businessId, updated_at: now.toISOString() })
    .eq('id', checkout.id)
    .select()
    .single();
  if (updErr) throw new Error(updErr.message);
  return updated as unknown as PartnerCheckout;
}

// ---------- супер-админ: обзор по всем партнёрам ----------
export type PartnerOverviewRow = Partner & {
  leadsCount: number;
  checkoutsCount: number;
  paidCount: number;
  earningsAccrued: number;
};

export async function listAllPartnersOverview(): Promise<PartnerOverviewRow[]> {
  const db = (adminClient() as any);
  const { data: partners } = await db.from('partners').select('*').order('created_at', { ascending: false });
  const list = (partners as unknown as Partner[]) ?? [];

  const { data: leads } = await db.from('partner_leads').select('partner_id');
  const { data: checkouts } = await db.from('partner_checkouts').select('partner_id,status');
  const { data: earnings } = await db.from('partner_earnings').select('partner_id,amount,status');

  const leadsBy = new Map<string, number>();
  for (const r of (leads as { partner_id: string }[]) ?? []) leadsBy.set(r.partner_id, (leadsBy.get(r.partner_id) ?? 0) + 1);
  const chkBy = new Map<string, { total: number; paid: number }>();
  for (const r of (checkouts as { partner_id: string; status: string }[]) ?? []) {
    const cur = chkBy.get(r.partner_id) ?? { total: 0, paid: 0 };
    cur.total += 1;
    if (r.status === 'paid') cur.paid += 1;
    chkBy.set(r.partner_id, cur);
  }
  const earnBy = new Map<string, number>();
  for (const r of (earnings as { partner_id: string; amount: number; status: string }[]) ?? []) {
    if (r.status === 'accrued') earnBy.set(r.partner_id, (earnBy.get(r.partner_id) ?? 0) + Number(r.amount));
  }

  return list.map((p) => {
    const c = chkBy.get(p.id) ?? { total: 0, paid: 0 };
    return {
      ...p,
      leadsCount: leadsBy.get(p.id) ?? 0,
      checkoutsCount: c.total,
      paidCount: c.paid,
      earningsAccrued: earnBy.get(p.id) ?? 0,
    };
  });
}

// ---------- создание черновика сайт-визитки партнёром ----------
export async function createDraftSiteVizitka(input: {
  name: string; email?: string; phone?: string;
}): Promise<{ businessId: string; slug: string }> {
  const db = (adminClient() as any);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = `${slugify(input.name) || 'biz'}-${randomBytes(3).toString('hex')}`;
    const { data, error } = await db
      .from('businesses')
      .insert({
        name: input.name.trim(),
        slug,
        status: 'new',
        emails: input.email ? [input.email.trim()] : [],
        phones: input.phone ? [input.phone.trim()] : [],
        plan: 'basic',
        subscription_active: false,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!error && data) return { businessId: (data as { id: string }).id, slug };
    if (error && !String(error.message).includes('duplicate') && !String(error.code).includes('23505')) {
      throw new Error(error.message);
    }
  }
  throw new Error('Не удалось создать сайт-визитку (конфликт slug)');
}

export const yookassaConfigured = isYookassaConfigured;
