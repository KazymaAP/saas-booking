'use server';
// app/panel/(protected)/settings/actions.ts — настройки платформы: реквизиты, тарифы, цены, rate limit, флаги (ТЗ §5.4 /panel/settings, §29).
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';

async function saveKey(key: string, value: unknown) {
  await adminClient().from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
  await audit('settings_save', 'settings', null, { key });
  revalidatePath('/panel/settings');
}

const str = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max);
const num = (v: FormDataEntryValue | null, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export async function saveRequisites(formData: FormData) {
  await saveKey('platform_requisites', {
    fio: str(formData.get('fio'), 300),
    inn: str(formData.get('inn'), 20),
    email: str(formData.get('email'), 200),
    phone: str(formData.get('phone'), 40),
    city: str(formData.get('city'), 100),
    card: str(formData.get('card'), 40),
    bank: str(formData.get('bank'), 100),
    nalog_url: str(formData.get('nalog_url'), 300),
    oferta: String(formData.get('oferta') ?? '').slice(0, 20000),
    policy: String(formData.get('policy') ?? '').slice(0, 20000),
  });
}

export async function saveTariffs(formData: FormData) {
  await saveKey('tariffs', {
    basic: { name: str(formData.get('basic_name'), 60) || 'Базовый', price: num(formData.get('basic_price'), 1000) },
    pro: { name: str(formData.get('pro_name'), 60) || 'Про', price: num(formData.get('pro_price'), 2500) },
  });
}

export async function saveDefaultPrice(formData: FormData) {
  await saveKey('default_price', { initial: num(formData.get('initial'), 5000), monthly: num(formData.get('monthly'), 1000) });
}

export async function saveRateLimits(formData: FormData) {
  await saveKey('rate_limits', { booking_per_10min: num(formData.get('booking'), 5), cancel_per_15min: num(formData.get('cancel'), 10) });
}

// Флаги функций: чекбоксы. Значения читаются кодом через settings.feature_flags.
export async function saveFlags(formData: FormData) {
  await saveKey('feature_flags', {
    ai_assistant: formData.get('ai_assistant') === '1',
    telegram_clients: formData.get('telegram_clients') === '1',
  });
}
