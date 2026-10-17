// lib/log.test.ts — запись ошибок: обрезка, маскирование, устойчивость к сбоям базы (Vitest).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
vi.mock('./supabase', () => ({
  adminClient: () => ({ from: (table: string) => ({ insert: (row: unknown) => insert(table, row) }) }),
}));

import { logError, buildErrorRow, errorMessage, MAX_MESSAGE } from './log';

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe('buildErrorRow', () => {
  it('ставит action error:<source> и entity = source', () => {
    const row = buildErrorRow('generate', 'упало');
    expect(row.action).toBe('error:generate');
    expect(row.entity).toBe('generate');
    expect(row.entity_id).toBeNull();
  });

  it('обрезает сообщение до 500 символов', () => {
    const row = buildErrorRow('email', 'x'.repeat(2000));
    expect(String(row.payload.message).length).toBe(MAX_MESSAGE);
  });

  it('маскирует email и телефон в сообщении и payload', () => {
    const row = buildErrorRow('email', 'SMTP отказ для client@mail.ru', { phone: '+79991234567' });
    expect(row.payload.message).toBe('SMTP отказ для c***@m***.ru');
    expect(row.payload.phone).toBe('+7******67');
  });

  it('payload не может подменить message', () => {
    const row = buildErrorRow('cron', 'настоящая', { message: 'подмена' });
    expect(row.payload.message).toBe('настоящая');
  });

  it('пустое сообщение заменяется заглушкой', () => {
    expect(buildErrorRow('cron', '   ').payload.message).toBe('без сообщения');
  });
});

describe('errorMessage', () => {
  it('достаёт текст из Error, строки и объекта', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage({ code: 1 })).toBe('{"code":1}');
  });
});

describe('logError', () => {
  it('пишет строку в audit_log', async () => {
    await expect(logError('vercel', 'timeout', { domain: 'a.ru' })).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith('audit_log', expect.objectContaining({ action: 'error:vercel' }));
  });

  it('не бросает, если база недоступна', async () => {
    insert.mockRejectedValueOnce(new Error('network'));
    await expect(logError('import', 'x')).resolves.toBe(false);
    insert.mockResolvedValueOnce({ error: { message: 'rls' } });
    await expect(logError('import', 'x')).resolves.toBe(false);
  });
});
