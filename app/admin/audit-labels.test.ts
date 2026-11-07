// app/admin/audit-labels.test.ts — подписи событий журнала: ошибки, namespace-события, неизвестное.
import { describe, expect, it } from 'vitest';
import { auditActionLabel, isErrorAction } from './audit-labels';

describe('auditActionLabel', () => {
  it('известные события — по-русски', () => {
    expect(auditActionLabel('business_add')).toBe('Бизнес добавлен');
    expect(auditActionLabel('platform.email_queued')).toBe('Письмо поставлено в очередь');
  });

  it('ошибки: источник из lib/log переводится', () => {
    expect(auditActionLabel('error:cron')).toBe('Ошибка: планировщик');
    expect(auditActionLabel('error:email')).toBe('Ошибка: почта');
  });

  it('неизвестный источник ошибки не теряется', () => {
    expect(auditActionLabel('error:unknown_source')).toBe('Ошибка: unknown_source');
  });

  it('очистка старых записей — с человеческим именем таблицы', () => {
    expect(auditActionLabel('cron:retention:audit_log')).toBe('Очистка старых записей: журнал действий');
    expect(auditActionLabel('cron:retention:custom_table')).toBe('Очистка старых записей: custom_table');
  });

  it('namespace без спецправила собирается из частей', () => {
    expect(auditActionLabel('cron:create_partitions')).toBe('Планировщик · create partitions');
  });

  it('неизвестное событие без namespace остаётся как есть', () => {
    expect(auditActionLabel('some_legacy_action')).toBe('some_legacy_action');
  });

  it('пустая строка не ломает подпись', () => {
    expect(auditActionLabel('')).toBe('');
  });
});

describe('isErrorAction', () => {
  it('распознаёт только префикс error:', () => {
    expect(isErrorAction('error:cron')).toBe(true);
    expect(isErrorAction('cron:retention:audit_log')).toBe(false);
    expect(isErrorAction('')).toBe(false);
  });
});
