// Тесты server actions «Настройки»: права, ошибки под полем, audit без ПД, пропуск неизменённых значений.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/главная/lib/fake-db';

const fake = createFakeDb();
const isSuperAdmin = vi.fn();
const auditMock = vi.fn();

vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client }));
vi.mock('@/lib/admin-session', () => ({ isSuperAdmin: () => isSuperAdmin() }));
vi.mock('@/lib/audit', () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(async () => true), errorMessage: (e: unknown) => String(e) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveDefaultPrice, saveFlags, saveRateLimits, saveRequisites, saveTariffs } from './actions';

function form(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  isSuperAdmin.mockResolvedValue(true);
});

describe('settings actions', () => {
  it('без прав — отказ без запросов', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const res = await saveDefaultPrice(null, form({ initial: '5000', monthly: '1000' }));
    expect(res.ok).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });

  it('неверная цена — ошибка под полем, в БД ничего', async () => {
    const res = await saveDefaultPrice(null, form({ initial: '-5', monthly: '1000' }));
    expect(!res.ok && res.fieldErrors?.initial).toBeTruthy();
    expect(fake.queries).toHaveLength(0);
  });

  it('тарифы: ошибка с вложенным путём basic.price', async () => {
    const res = await saveTariffs(null, form({ 'basic.name': 'Б', 'basic.price': 'x', 'pro.name': 'П', 'pro.price': '1' }));
    expect(!res.ok && res.fieldErrors?.['basic.price']).toBeTruthy();
  });

  it('сохранение: upsert + audit с перечнем изменённых полей', async () => {
    fake.reply('settings', { data: { value: { initial: 5000, monthly: 1000 } } });
    const res = await saveDefaultPrice(null, form({ initial: '6000', monthly: '1000' }));
    expect(res.ok && res.data.changed).toEqual(['initial']);
    const up = fake.find('settings', 'upsert');
    expect(up).toHaveLength(1);
    expect(up[0]?.calls[0]?.args[0]).toMatchObject({ key: 'default_price', value: { initial: 6000, monthly: 1000 } });
    expect(auditMock).toHaveBeenCalledWith('settings_save', 'settings', 'default_price', { changed: ['initial'], value: { initial: 6000, monthly: 1000 } });
  });

  it('без изменений — ни upsert, ни audit', async () => {
    fake.reply('settings', { data: { value: { booking_per_10min: 5, cancel_per_15min: 10 } } });
    const res = await saveRateLimits(null, form({ booking_per_10min: '5', cancel_per_15min: '10' }));
    expect(res.ok && res.message).toBe('Изменений нет');
    expect(fake.find('settings', 'upsert')).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('реквизиты: в audit только имена полей, без значений (ПД)', async () => {
    const res = await saveRequisites(null, form({ fio: 'Иванов Иван', email: 'op@example.com', inn: '500100732259' }));
    expect(res.ok).toBe(true);
    const payload = auditMock.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(payload).toEqual({ changed: expect.arrayContaining(['fio', 'email', 'inn']) });
    expect(JSON.stringify(payload)).not.toContain('Иванов');
  });

  it('флаги: снятый чекбокс → false', async () => {
    fake.reply('settings', { data: { value: { telegram_clients: false } } });
    const res = await saveFlags(null, form({ telegram_clients: '1' }));
    expect(res.ok && res.data.changed).toEqual(['telegram_clients']);
  });

  it('ошибка БД при записи — общий отказ, не исключение', async () => {
    fake.reply('settings', { data: null }, { error: { message: 'boom' } });
    const res = await saveDefaultPrice(null, form({ initial: '1', monthly: '1' }));
    expect(res.ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
