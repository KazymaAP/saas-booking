// lib/migrations-booking-overlap.test.ts — статическая проверка миграции 0027 (запрет пересечения броней).
// Зачем: exclusion-ограничение bookings_no_overlap из 0007 не переживает партиционирование в 0014 —
// PostgreSQL не даёт создать его на партиционированной таблице, когда ключ партиционирования входит
// только внутрь выражения (booking_range(...) &&), а 0014 глушит ошибку через `exception when others`.
// Проверку перенесли в триггер с advisory-lock; тест фиксирует три свойства, без которых защита не работает:
// сам триггер, код ошибки 23P01 (его ловит приложение) и блокировку по business_id (без неё остаётся гонка).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

const source = readFileSync(root('supabase/migrations/0027_bookings_overlap_trigger.sql'), 'utf8')
  .split('\n')
  .map((line) => (line.trimStart().startsWith('--') ? '' : line))
  .join('\n');

describe('0027: пересечение активных броней', () => {
  it('создаёт BEFORE-триггер на bookings', () => {
    expect(source).toMatch(/create\s+trigger\s+trg_bookings_no_overlap/i);
    expect(source).toMatch(/before\s+insert\s+or\s+update[\s\S]{0,120}on\s+public\.bookings/i);
    expect(source).toMatch(/execute\s+function\s+public\.bookings_check_overlap\(\)/i);
  });

  it('бросает 23P01 — этот код приложение превращает в 409 slot_taken', () => {
    expect(source).toMatch(/errcode\s*=\s*'23P01'/i);
  });

  it('берёт advisory-lock по business_id — иначе две транзакции обе увидят «свободно»', () => {
    expect(source).toMatch(/pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*new\.business_id::text/i);
  });

  it('сравнивает интервалы через booking_range с учётом длительности', () => {
    expect(source).toMatch(/public\.booking_range\(b\.scheduled_at,\s*b\.duration_at_booking\)/i);
    expect(source).toMatch(/public\.booking_range\(new\.scheduled_at,\s*v_duration\)/i);
  });
});
