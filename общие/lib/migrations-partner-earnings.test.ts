// lib/migrations-partner-earnings.test.ts — идемпотентность начислений партнёрам (0030).
// Регрессия: вебхук ЮKassa приходит повторно, markCheckoutPaid ставит status='paid' последним шагом,
// проверки «уже начислено» в коде не было — партнёр получал комиссию дважды.
// Тест фиксирует три свойства, без которых защита не работает: сам индекс, ключ с partner_id
// (иначе бонус наставнику по тому же счёту не пройдёт) и обработку 23505 в коде.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const stripComments = (text: string) =>
  text.split('\n').map((line) => (line.trimStart().startsWith('--') ? '' : line)).join('\n');

const migration = stripComments(readFileSync(root('supabase/migrations/0030_partner_earnings_unique.sql'), 'utf8'));
const partners = readFileSync(root('общие/lib/partners.ts'), 'utf8');
const referrals = readFileSync(root('общие/lib/referrals.ts'), 'utf8');

describe('0030: уникальность начислений партнёру', () => {
  it('разовое начисление — одно на пару (партнёр, счёт)', () => {
    expect(migration).toMatch(/create\s+unique\s+index[\s\S]{0,120}partner_earnings_once_per_checkout/i);
    expect(migration).toMatch(/on\s+public\.partner_earnings\s*\(\s*partner_id\s*,\s*checkout_id\s*\)/i);
    expect(migration).toMatch(/where\s+type\s*=\s*'one_time'/i);
  });

  it('ежемесячное — одно на (партнёр, счёт, начало периода)', () => {
    expect(migration).toMatch(/create\s+unique\s+index[\s\S]{0,120}partner_earnings_once_per_period/i);
    expect(migration).toMatch(/\(\s*partner_id\s*,\s*checkout_id\s*,\s*period_start\s*\)/i);
    expect(migration).toMatch(/where\s+type\s*=\s*'recurring_monthly'/i);
  });

  it('ключ включает partner_id: иначе бонус наставнику по тому же счёту отклонялся бы', () => {
    const keys = [...migration.matchAll(/\(\s*partner_id\s*,\s*checkout_id[^)]*\)/gi)].map((m) => m[0]);
    expect(keys.length).toBe(2);
  });

  it('платёж по счёту тоже один: иначе выручка в отчётах задваивается', () => {
    expect(migration).toMatch(/create\s+unique\s+index[\s\S]{0,120}payments_partner_checkout_once/i);
    expect(migration).toMatch(/on\s+public\.payments\s*\(\s*note\s*\)/i);
    expect(migration).toMatch(/where\s+note\s+like\s+'Партнёрский чекаут %'/i);
  });

  it('код считает 23505 нормой, а не сбоем', () => {
    expect(partners).toMatch(/earnErr\.code\s*!==\s*'23505'/);
    expect(partners).toMatch(/payErr\.code\s*!==\s*'23505'/);
    expect(referrals).toMatch(/error\.code\s*!==\s*'23505'/);
  });
});
