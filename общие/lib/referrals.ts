// общие/lib/referrals.ts — второй уровень партнёрской программы: партнёр приводит партнёра.
//
// Правила (согласованы с владельцем платформы):
// - бонус = 10% от НАЧИСЛЕНИЙ приведённого партнёра (не от суммы сделки);
// - платит платформа: у приведённого партнёра ничего не вычитается;
// - платится, пока приведённый партнёр получает начисления (включая ежемесячные);
// - только два уровня: наставник не получает бонус за партнёров своего партнёра;
// - процент настраивается в settings.referral_percent.
//
// Работает без миграции: связь «наставник → партнёр» хранится в settings.partner_referrals,
// а бонус — обычной строкой partner_earnings (type='one_time', привязан к тому же checkout_id).
// Миграция 0020 добавляет partners.referrer_id; если она применена, код читает и колонку тоже.
import { adminClient } from './supabase';
import { logError } from './log';

export const DEFAULT_REFERRAL_PERCENT = 10;
const MAP_KEY = 'partner_referrals';
// Каждая связь хранится отдельной строкой settings, а не одной общей jsonb-картой:
// при одновременной регистрации двух партнёров read-modify-write карты терял одну из связей.
// MAP_KEY остаётся только для чтения связей, записанных старыми версиями кода.
const REFERRER_KEY_PREFIX = 'partner_referrer:';

export type ReferralRow = {
  id: string;
  name: string | null;
  email: string;
  created_at: string;
  status: string;
  earned: number;
  bonus: number;
};

export type ReferralTotals = {
  partners: number;
  bonusAccrued: number;
  bonusPaid: number;
  bonusPending: number;
};

type RefMap = Record<string, string>;

async function readMap(): Promise<RefMap> {
  const { data } = await adminClient().from('settings').select('value').eq('key', MAP_KEY).maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as RefMap;
}

/** Процент бонуса из настроек; при отсутствии строки — 10%. */
export async function referralPercent(): Promise<number> {
  const { data } = await adminClient().from('settings').select('value').eq('key', 'referral_percent').maybeSingle();
  const raw = (data as { value?: { percent?: number } } | null)?.value?.percent;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_REFERRAL_PERCENT;
  return n;
}

/** Сумма бонуса: процент от начисления, округление до копеек. */
export function bonusAmount(base: number, percent: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((base * percent) / 100 * 100) / 100;
}

/** Партнёр по его коду приглашения (PR-XXXX). */
export async function resolveReferrerByCode(code: string | null | undefined): Promise<string | null> {
  const clean = (code ?? '').trim().toUpperCase();
  if (!clean) return null;
  const { data } = await adminClient().from('partners').select('id').eq('referral_code', clean).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Привязать нового партнёра к наставнику. Пишем в settings всегда (источник истины без миграции)
 * и, если колонка referrer_id уже есть, дублируем в неё.
 */
export async function linkReferrer(partnerId: string, code: string | null | undefined): Promise<void> {
  const referrerId = await resolveReferrerByCode(code);
  if (!referrerId || referrerId === partnerId) return;
  try {
    // Атомарный upsert одной строки: параллельные регистрации не перетирают друг друга.
    const { error } = await adminClient().from('settings').upsert(
      {
        key: `${REFERRER_KEY_PREFIX}${partnerId}`,
        value: { referrer: referrerId, partner: partnerId },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw new Error(error.message);
    // Миграция 0020 необязательна: без колонки referrer_id программа работает на settings.
    // Раньше отсутствие колонки уходило в catch и засоряло журнал на КАЖДОЙ регистрации.
    const { error: columnError } = await adminClient()
      .from('partners')
      .update({ referrer_id: referrerId })
      .eq('id', partnerId);
    if (columnError && !['42703', 'PGRST204'].includes(String(columnError.code))) {
      await logError('admin', 'referral_column_failed', { error: columnError.message });
    }
  } catch (error) {
    await logError('admin', 'referral_link_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Кто привёл партнёра. Сначала колонка (если есть), иначе карта в settings. */
async function referrerOf(partnerId: string): Promise<string | null> {
  const db = adminClient();
  const { data, error } = await db.from('partners').select('referrer_id').eq('id', partnerId).maybeSingle();
  if (!error) {
    const fromColumn = (data as { referrer_id?: string | null } | null)?.referrer_id;
    if (fromColumn) return fromColumn;
  }
  const { data: own } = await db.from('settings').select('value').eq('key', `${REFERRER_KEY_PREFIX}${partnerId}`).maybeSingle();
  const fromOwn = (own as { value?: { referrer?: string } } | null)?.value?.referrer;
  if (fromOwn) return fromOwn;
  return (await readMap())[partnerId] ?? null;
}

/**
 * Начисляет бонус наставнику за начисление партнёра. Ошибки не пробрасываются:
 * бонус не должен ломать оплату предпринимателя.
 */
export async function accrueReferralBonus(input: {
  partnerId: string;
  baseAmount: number;
  checkoutId: string | null;
  businessId: string | null;
}): Promise<void> {
  try {
    const referrerId = await referrerOf(input.partnerId);
    if (!referrerId || referrerId === input.partnerId) return;

    const percent = await referralPercent();
    const amount = bonusAmount(input.baseAmount, percent);
    if (amount <= 0) return;

    const db = adminClient();
    // Вебхук оплаты может прийти дважды. Уникального индекса на (partner_id, checkout_id)
    // в схеме нет — без этой проверки наставнику начислили бы бонус повторно.
    if (input.checkoutId) {
      const { data: existing } = await db
        .from('partner_earnings')
        .select('id')
        .eq('partner_id', referrerId)
        .eq('checkout_id', input.checkoutId)
        .eq('type', 'one_time')
        .maybeSingle();
      if (existing) return;
    }

    // type='one_time' проходит существующий CHECK и после миграции 0020.
    // Привязка к checkout_id позволяет отнести бонус к конкретному приведённому партнёру.
    const { error } = await db.from('partner_earnings').insert({
      partner_id: referrerId,
      checkout_id: input.checkoutId,
      business_id: input.businessId,
      amount,
      type: 'one_time',
      status: 'accrued',
    });
    if (error) await logError('admin', 'referral_bonus_failed', { error: error.message, referrer: referrerId });
  } catch (error) {
    await logError('admin', 'referral_bonus_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Список приведённых партнёров с их вкладом: заработали сами и сколько принесли наставнику. */
export async function listReferrals(partnerId: string): Promise<{ rows: ReferralRow[]; totals: ReferralTotals }> {
  const db = adminClient() as any;
  const empty = { rows: [], totals: { partners: 0, bonusAccrued: 0, bonusPaid: 0, bonusPending: 0 } };

  const map = await readMap();
  const fromMap = Object.entries(map).filter(([, ref]) => ref === partnerId).map(([id]) => id);
  // Если миграция применена — добавляем связи из колонки.
  const { data: fromColumn } = await db.from('partners').select('id').eq('referrer_id', partnerId);
  // И связи из атомарных строк settings (актуальный формат записи).
  const { data: fromOwn } = await db.from('settings').select('key, value').like('key', `${REFERRER_KEY_PREFIX}%`);
  const fromOwnIds = ((fromOwn ?? []) as { key: string; value?: { referrer?: string } }[])
    .filter((row) => row.value?.referrer === partnerId)
    .map((row) => row.key.slice(REFERRER_KEY_PREFIX.length));
  const ids = [...new Set([
    ...fromMap,
    ...fromOwnIds,
    ...((fromColumn ?? []) as { id: string }[]).map((p: { id: string }) => p.id),
  ])];
  if (ids.length === 0) return empty;

  const { data: referred } = await db
    .from('partners')
    .select('id, name, email, created_at, status')
    .in('id', ids)
    .order('created_at', { ascending: false });
  const list = (referred ?? []) as { id: string; name: string | null; email: string; created_at: string; status: string }[];
  if (list.length === 0) return empty;

  // Чекáуты приведённых партнёров → их начисления и мои бонусы по тем же чекáутам.
  const { data: checkouts } = await db.from('partner_checkouts').select('id, partner_id').in('partner_id', ids);
  const rowsCheckout = (checkouts ?? []) as { id: string; partner_id: string }[];
  const checkoutIds = rowsCheckout.map((c) => c.id);
  const checkoutToPartner = new Map(rowsCheckout.map((c) => [c.id, c.partner_id]));

  const [{ data: theirs }, { data: mine }] = await Promise.all([
    db.from('partner_earnings').select('partner_id, amount, status').in('partner_id', ids),
    checkoutIds.length > 0
      ? db.from('partner_earnings').select('checkout_id, amount, status').eq('partner_id', partnerId).in('checkout_id', checkoutIds)
      : Promise.resolve({ data: [] }),
  ]);

  const earnedBy = new Map<string, number>();
  for (const row of (theirs ?? []) as { partner_id: string; amount: number; status: string }[]) {
    if (row.status === 'cancelled') continue;
    earnedBy.set(row.partner_id, (earnedBy.get(row.partner_id) ?? 0) + Number(row.amount));
  }

  const bonusBy = new Map<string, number>();
  let bonusTotal = 0;
  let bonusPaid = 0;
  for (const row of (mine ?? []) as { checkout_id: string | null; amount: number; status: string }[]) {
    if (row.status === 'cancelled' || !row.checkout_id) continue;
    const owner = checkoutToPartner.get(row.checkout_id);
    if (!owner) continue;
    const value = Number(row.amount);
    bonusBy.set(owner, (bonusBy.get(owner) ?? 0) + value);
    bonusTotal += value;
    if (row.status === 'paid_out') bonusPaid += value;
  }

  const rows: ReferralRow[] = list.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    created_at: p.created_at,
    status: p.status,
    earned: Math.round((earnedBy.get(p.id) ?? 0) * 100) / 100,
    bonus: Math.round((bonusBy.get(p.id) ?? 0) * 100) / 100,
  }));

  return {
    rows,
    totals: {
      partners: list.length,
      bonusAccrued: Math.round(bonusTotal * 100) / 100,
      bonusPaid: Math.round(bonusPaid * 100) / 100,
      bonusPending: Math.round((bonusTotal - bonusPaid) * 100) / 100,
    },
  };
}
