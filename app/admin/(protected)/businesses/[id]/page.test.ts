// Тесты загрузки карточки бизнеса: сбой любой связанной выборки — исключение (error.tsx), а не «пусто».
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/главная/lib/fake-db';

const fake = createFakeDb();
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('./CardForms', () => ({ CardButtons: () => null, DomainForms: () => null, NotesForm: () => null, SlugForm: () => null, StatusControl: () => null }));

import BusinessCard from './page';

const A = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const BIZ = { id: A, name: 'Салон', slug: 'salon', status: 'new', emails: [], vertical_templates: null };

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe('карточка бизнеса', () => {
  it('всё загрузилось — рендер без исключений, все выборки параллельно', async () => {
    fake.reply('businesses', { data: BIZ });
    fake.reply('bookings', { data: [] }, { count: 3 });
    await expect(BusinessCard({ params: { id: A } })).resolves.toBeTruthy();
    const tables = fake.queries.map((q) => q.table).sort();
    expect(tables).toEqual(['audit_log', 'bookings', 'bookings', 'businesses', 'outreach_log', 'photos', 'services', 'settings']);
  });

  it('невалидный id — 404 без запросов к базе', async () => {
    await expect(BusinessCard({ params: { id: 'nope' } })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fake.queries).toHaveLength(0);
  });

  it('бизнеса нет — 404', async () => {
    fake.reply('businesses', { data: null });
    await expect(BusinessCard({ params: { id: A } })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('сбой чтения бизнеса — исключение, а не 404', async () => {
    fake.reply('businesses', { data: null, error: { message: 'timeout' } });
    await expect(BusinessCard({ params: { id: A } })).rejects.toThrow('timeout');
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each(['services', 'photos', 'outreach_log', 'audit_log', 'settings'])('сбой выборки %s — исключение, а не «пусто»', async (table) => {
    fake.reply('businesses', { data: BIZ });
    fake.reply(table, { data: null, error: { message: `${table} down` } });
    await expect(BusinessCard({ params: { id: A } })).rejects.toThrow(`${table} down`);
  });

  it('сбой подсчёта броней — исключение, а не «Брони (0)»', async () => {
    fake.reply('businesses', { data: BIZ });
    fake.reply('bookings', { data: [] }, { count: null, error: { message: 'count down' } });
    await expect(BusinessCard({ params: { id: A } })).rejects.toThrow('count down');
  });
});
