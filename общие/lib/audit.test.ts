// lib/audit.test.ts — маскирование ПД и запись в audit_log (Vitest, Supabase замокан).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
vi.mock('./supabase', () => ({
  adminClient: () => ({ from: (table: string) => ({ insert: (row: unknown) => insert(table, row) }) }),
}));

import { audit, auditMany, buildAuditRow, maskPii, maskString, HIDDEN } from './audit';

const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe('maskString', () => {
  it('маскирует email, оставляя первую букву имени и домена', () => {
    expect(maskString('пишите на ivan.petrov@yandex.ru')).toBe('пишите на i***@y***.ru');
  });

  it('маскирует телефоны в разных форматах', () => {
    expect(maskString('+7 (999) 123-45-67')).toBe('+7******67');
    expect(maskString('звонить 89991234567')).toBe('звонить +7******67');
  });

  it('не трогает обычный текст и числа', () => {
    expect(maskString('Шиномонтаж «Колесо», 5000 ₽')).toBe('Шиномонтаж «Колесо», 5000 ₽');
  });
});

describe('maskPii', () => {
  it('скрывает секреты по имени ключа', () => {
    expect(maskPii({ password: 'qwerty', smtp_pass: 'x', token: 'abc', ok: 1 })).toEqual({ password: HIDDEN, smtp_pass: HIDDEN, token: HIDDEN, ok: 1 });
  });

  it('рекурсивно маскирует вложенные объекты и массивы', () => {
    const out = maskPii({ to: ['a@b.ru'], nested: { phone: '+79991234567', client_name: 'Иван' } });
    expect(out).toEqual({ to: ['a***@b***.ru'], nested: { phone: '+7******67', client_name: HIDDEN } });
  });

  it('ограничивает глубину и длину массивов', () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    expect(JSON.stringify(maskPii(deep))).toContain('[глубоко]');
    expect((maskPii(Array.from({ length: 80 }, (_, i) => i)) as unknown[]).length).toBe(50);
  });
});

describe('buildAuditRow', () => {
  it('кладёт UUID в entity_id', () => {
    expect(buildAuditRow('x', 'business', ID).entity_id).toBe(ID);
  });

  it('не-UUID идентификатор переносит в payload.ref', () => {
    const row = buildAuditRow('settings_save', 'settings', 'tariffs', { a: 1 });
    expect(row.entity_id).toBeNull();
    expect(row.payload).toEqual({ a: 1, ref: 'tariffs' });
  });

  it('обрезает длинные action и entity', () => {
    const row = buildAuditRow('a'.repeat(300), 'e'.repeat(300), null);
    expect(row.action.length).toBe(100);
    expect(row.entity.length).toBe(50);
  });
});

describe('audit', () => {
  it('пишет в audit_log с маскированным payload', async () => {
    await expect(audit('create_access', 'business', ID, { email: 'owner@mail.ru' })).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith('audit_log', expect.objectContaining({ action: 'create_access', entity_id: ID, payload: { email: 'o***@m***.ru' } }));
  });

  it('не бросает при ошибке базы и возвращает false', async () => {
    insert.mockResolvedValueOnce({ error: { message: 'down' } });
    await expect(audit('x', 'y', null)).resolves.toBe(false);
    insert.mockRejectedValueOnce(new Error('network'));
    await expect(audit('x', 'y', null)).resolves.toBe(false);
  });

  it('auditMany пишет все строки одним insert', async () => {
    await auditMany('mass_status', 'business', [ID, ID], { status: 'archived' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect((insert.mock.calls[0][1] as unknown[]).length).toBe(2);
  });

  it('auditMany с пустым списком ничего не пишет', async () => {
    await expect(auditMany('x', 'y', [])).resolves.toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });
});
