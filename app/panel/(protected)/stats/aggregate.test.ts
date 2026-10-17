// Тесты агрегации статистики: MRR из numeric-строк, конверсия sent → paid, шаблоны, дни без дыр.
import { describe, expect, it } from 'vitest';
import { aggregateBusinesses, aggregateOutreach, conversion, lastDays, mrr, type BizRow, type OutreachRow } from './aggregate';

const NOW = new Date('2026-10-15T12:00:00Z');
const names = { verticals: new Map([['v1', 'Шиномонтаж']]), templates: new Map([['t1', 'Весна']]), statusLabel: (s: string) => s.toUpperCase() };

function biz(id: string, o: Partial<BizRow> = {}): BizRow {
  return { id, status: 'sent', city: 'Казань', vertical_template_id: 'v1', paid_initial_at: null, reply_received_at: null, ...o };
}
function out(business_id: string, o: Partial<OutreachRow> = {}): OutreachRow {
  return { business_id, channel: 'email', template_id: 't1', sent_at: '2026-10-14T10:00:00Z', opened_at: null, clicked_at: null, ...o };
}

describe('mrr', () => {
  it('суммирует numeric-строки и пропускает пустые', () => {
    expect(mrr([{ subscription_price: '1000' }, { subscription_price: 2500 }, { subscription_price: null }, { subscription_price: 'x' }])).toBe(3500);
  });
});

describe('conversion', () => {
  it('считает долю оплативших среди получивших письмо', () => {
    expect(conversion(new Set(['a', 'b', 'c', 'd']), new Set(['b', 'z']))).toEqual({ rate: 25, perPayment: 4, paid: 1 });
  });
  it('нет писем — 0%, без деления на ноль', () => {
    expect(conversion(new Set(), new Set(['a']))).toEqual({ rate: 0, perPayment: null, paid: 0 });
  });
});

describe('aggregateBusinesses', () => {
  it('группирует по статусу, городу, нише с подписями', () => {
    const r = aggregateBusinesses([biz('a'), biz('b', { city: null, vertical_template_id: null, status: 'client', paid_initial_at: '2026-10-01' })], names);
    expect(r.funnel).toEqual([{ key: 'client', label: 'CLIENT', value: 1 }, { key: 'sent', label: 'SENT', value: 1 }]);
    expect(r.cities.map((c) => c.key).sort()).toEqual(['Казань', 'без города']);
    expect(r.verticals.find((v) => v.key === 'v1')?.label).toBe('Шиномонтаж');
    expect([...r.paid]).toEqual(['b']);
  });
});

describe('aggregateOutreach', () => {
  it('шаблоны: отправлено/открыто/ответили/оплатили; неотправленные не считаются', () => {
    const rows = [out('a', { opened_at: 'x' }), out('b'), out('c', { template_id: null }), out('d', { sent_at: null })];
    const r = aggregateOutreach(rows, { templates: names.templates, paid: new Set(['b']), replied: new Set(['a']), paidAt: new Map(), now: NOW });
    const t1 = r.templates.find((t) => t.key === 't1');
    expect(t1).toMatchObject({ label: 'Весна', sent: 2, opened: 1, replied: 1, paid: 1 });
    expect(r.templates.find((t) => t.key === 'default')?.label).toBe('Встроенный');
    expect(r.sentIds.size).toBe(3);
  });
});

describe('lastDays', () => {
  it('возвращает ровно N дней, включая нулевые', () => {
    const d = lastDays(new Map([['2026-10-14', 5]]), new Map([['b', '2026-10-15T09:00:00Z']]), NOW, 3);
    expect(d).toEqual([
      { day: '2026-10-15', sent: 0, paid: 1 },
      { day: '2026-10-14', sent: 5, paid: 0 },
      { day: '2026-10-13', sent: 0, paid: 0 },
    ]);
  });
});
