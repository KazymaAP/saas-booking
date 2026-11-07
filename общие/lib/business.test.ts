// общие/lib/business.test.ts — резолв публичного адреса бизнеса.
// Проверяем три правила: оплаченный клиент открывается, чужой/неизвестный префикс уводит на канонический,
// неоплаченный и не-клиент не открываются. Мок PostgREST — без сети и БД.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// react.cache вне рендера React не работает — в тесте это просто тождественная обёртка.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T,>(fn: T): T => fn };
});

// react.cache вне рендера React не работает — в тесте это просто тождественная обёртка.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T,>(fn: T): T => fn };
});

type Row = Record<string, unknown>;

const db = {
  templates: [] as Row[],
  businesses: [] as Row[],
  history: [] as Row[],
};

vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const api = {
        select: () => api,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return api;
        },
        contains: (col: string, val: unknown) => {
          filters.push([col, val]);
          return api;
        },
        maybeSingle: async () => {
          const byHistory = filters.some(([col]) => col === 'slug_history');
          const source = table === 'vertical_templates'
            ? db.templates
            : byHistory
              ? db.history
              : table === 'businesses' ? db.businesses : [];
          const hit = source.find((row) => filters.every(([col, val]) => {
            if (col === 'slug_history') return Array.isArray(row.slug_history) && (row.slug_history as unknown[]).includes((val as unknown[])[0]);
            return row[col] === val;
          })) ?? null;
          return { data: hit, error: null };
        },
      };
      return api;
    },
  }),
}));

const TEMPLATE = { id: 'tpl-manicure', url_prefix: 'm', slug: 'manicure' };
const BEAUTY_TEMPLATE = { id: 'tpl-barber', url_prefix: 'b', slug: 'barbershop' };
const BUSINESS = {
  id: 'b1', slug: 'lyubava', status: 'client', subscription_active: true,
  vertical_template_id: 'tpl-manicure', name: 'Студия «Любава»',
};

async function resolve(prefix: string, slug: string) {
  vi.resetModules();
  const mod = await import('./business');
  return mod.resolveBusiness(prefix, slug);
}

describe('resolveBusiness', () => {
  beforeEach(() => {
    db.templates = [TEMPLATE, BEAUTY_TEMPLATE];
    db.businesses = [BUSINESS];
    db.history = [];
  });

  it('канонический префикс ниши открывает сайт', async () => {
    const r = await resolve('m', 'lyubava');
    expect(r.kind).toBe('found');
  });

  it('неизвестный префикс уводит 308 на канонический адрес', async () => {
    const r = await resolve('x', 'lyubava');
    expect(r).toEqual({ kind: 'redirect', to: '/m/lyubava' });
  });

  it('чужой существующий префикс тоже уводит на канонический, а не даёт 404', async () => {
    const r = await resolve('b', 'lyubava');
    expect(r).toEqual({ kind: 'redirect', to: '/m/lyubava' });
  });

  it('неоплаченная подписка — сайт закрыт', async () => {
    db.businesses = [{ ...BUSINESS, subscription_active: false }];
    const r = await resolve('m', 'lyubava');
    expect(r.kind).toBe('notfound');
  });

  it('статус не client — сайт закрыт', async () => {
    db.businesses = [{ ...BUSINESS, status: 'approved' }];
    const r = await resolve('m', 'lyubava');
    expect(r.kind).toBe('notfound');
  });

  it('старый slug из истории — редирект на актуальный', async () => {
    db.businesses = [];
    db.history = [{ slug: 'lyubava', slug_history: ['lyubava-old'], status: 'client', vertical_template_id: 'tpl-manicure' }];
    const r = await resolve('m', 'lyubava-old');
    expect(r).toEqual({ kind: 'redirect', to: '/m/lyubava' });
  });

  it('несуществующий slug — 404', async () => {
    db.businesses = [];
    const r = await resolve('m', 'nope');
    expect(r.kind).toBe('notfound');
  });
});
