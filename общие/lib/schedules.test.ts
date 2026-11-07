// lib/schedules.test.ts — реестр расписаний: формат, уникальность, лимиты Vercel Hobby, синхронизация с vercel.json и SQL.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RETENTION_DAYS, SCHEDULES, VERCEL_HOBBY_MAX_CRONS, findSchedule, isValidCronExpression,
  runsMoreThanDaily, schedulesBy, toCrontab, toVercelCrons,
} from './schedules';

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const read = (path: string) => readFileSync(root(path), 'utf8');

interface VercelConfig {
  regions: string[];
  crons: { path: string; schedule: string }[];
}

describe('isValidCronExpression', () => {
  it.each(['* * * * *', '*/5 * * * *', '0 3 * * 0', '30 2 * * *', '0 7 1 * *', '0,30 8-18 * * 1-5', '0 0 1 1 7'])(
    'валидно: %s', (expr) => expect(isValidCronExpression(expr)).toBe(true),
  );
  it.each(['', '* * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '*/0 * * * *', '5-1 * * * *', 'a * * * *', '1/5 * * * *', '* * * * * *'])(
    'невалидно: "%s"', (expr) => expect(isValidCronExpression(expr)).toBe(false),
  );
});

describe('SCHEDULES', () => {
  it('не менее 12 задач, имена уникальны', () => {
    expect(SCHEDULES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SCHEDULES.map((s) => s.name)).size).toBe(SCHEDULES.length);
  });

  it('у каждой задачи валидное расписание и все поля', () => {
    for (const s of SCHEDULES) {
      expect(isValidCronExpression(s.schedule), s.name).toBe(true);
      expect(s.handler.length, s.name).toBeGreaterThan(0);
      expect(s.timeoutMs, s.name).toBeGreaterThan(0);
      expect(['next_run', 'none']).toContain(s.retry);
    }
  });

  it('HTTP-задачи ведут на /api/cron/<name>, SQL — вызывают функцию public.*', () => {
    for (const s of SCHEDULES) {
      if (s.runner === 'pg_cron_sql') expect(s.handler, s.name).toMatch(/^select public\.[a-z_]+\(/);
      else expect(s.handler, s.name).toBe(`/api/cron/${s.name}`);
    }
  });

  it('Vercel Hobby: не больше 2 задач и не чаще раза в сутки', () => {
    const v = schedulesBy('vercel');
    expect(v.length).toBeLessThanOrEqual(VERCEL_HOBBY_MAX_CRONS);
    for (const s of v) expect(runsMoreThanDaily(s.schedule), s.name).toBe(false);
  });

  it('pg_cron HTTP-таймаут не больше 60 с (лимит функции на Hobby)', () => {
    for (const s of schedulesBy('pg_cron_http')) expect(s.timeoutMs).toBeLessThanOrEqual(60_000);
  });

  it('частоты из ТЗ §8.4: send-emails раз в минуту, check-replies раз в 5 минут, напоминания раз в час', () => {
    expect(findSchedule('send-emails')?.schedule).toBe('* * * * *');
    expect(findSchedule('check-replies')?.schedule).toBe('*/5 * * * *');
    expect(findSchedule('booking-reminders')?.schedule).toBe('0 * * * *');
    expect(findSchedule('unconfirmed-reminder')?.schedule).toBe('0 * * * *');
    expect(findSchedule('keep-alive')?.schedule).toBe('0 * * * *');
    expect(findSchedule('create-partitions')?.schedule).toBe('0 7 1 * *');
  });
});

describe('vercel.json', () => {
  const config = JSON.parse(read('vercel.json')) as VercelConfig;

  it('ровно 2 cron: backup и cleanup-audit-log', () => {
    expect(config.crons.length).toBe(VERCEL_HOBBY_MAX_CRONS);
    expect(config.crons.map((c) => c.path).sort()).toEqual(['/api/cron/backup', '/api/cron/cleanup-audit-log']);
  });

  it('совпадает с реестром и сохраняет регион lhr1', () => {
    expect(config.crons).toEqual(toVercelCrons());
    expect(config.regions).toEqual(['lhr1']);
  });
});

describe('миграции pg_cron синхронизированы с реестром', () => {
  const sql = ['0008_pg_cron.sql', '0009_retention.sql', '0010_partitions.sql']
    .map((f) => read(`supabase/migrations/${f}`)).join('\n');

  it('каждая pg_cron задача объявлена в SQL с тем же расписанием', () => {
    for (const s of [...schedulesBy('pg_cron_http'), ...schedulesBy('pg_cron_sql')]) {
      expect(sql, s.name).toContain(`('${s.name}', '${s.schedule}'`);
    }
  });

  // Кортежи insert into cron_registry: ('name', 'schedule', 'kind', 'command', timeout_ms).
  const registry = new Map<string, { schedule: string; kind: string; command: string; timeoutMs: number }>();
  for (const m of sql.matchAll(/\('([a-z0-9-]+)', '([^']+)', '(http|sql)', '((?:[^']|'')+)', (\d+)\)/g)) {
    const [, name, schedule, kind, command, timeout] = m;
    if (name !== undefined) {
      registry.set(name, { schedule: schedule ?? '', kind: kind ?? '', command: (command ?? '').replace(/''/g, "'"), timeoutMs: Number(timeout) });
    }
  }

  it('cron_registry в SQL полностью совпадает с реестром: те же задачи, вид, команда и таймаут', () => {
    const pg = [...schedulesBy('pg_cron_http'), ...schedulesBy('pg_cron_sql')];
    expect([...registry.keys()].sort()).toEqual(pg.map((s) => s.name).sort());
    for (const s of pg) {
      const row = registry.get(s.name);
      expect(row?.schedule, s.name).toBe(s.schedule);
      expect(row?.timeoutMs, s.name).toBe(s.timeoutMs);
      if (s.runner === 'pg_cron_sql') expect(row, s.name).toMatchObject({ kind: 'sql', command: s.handler });
      else expect(row, s.name).toMatchObject({ kind: 'http', command: s.name });
    }
  });

  it('DELETE батчами адресует строку парой (tableoid, ctid): ctid уникален только внутри партиции', () => {
    const retention = read('supabase/migrations/0009_retention.sql');
    expect(retention).toContain('where (tableoid, ctid) in (select tableoid, ctid from');
    expect(retention).not.toMatch(/where ctid in \(select ctid/);
  });

  it('сроки retention в SQL совпадают с RETENTION_DAYS', () => {
    for (const [table, days] of Object.entries(RETENTION_DAYS)) {
      expect(sql, table).toContain(`('${table}', ${days}`);
    }
  });

  it('cron-check.sh проверяет все pg_cron задачи', () => {
    const script = read('служебное/scripts/cron-check.sh');
    for (const s of [...schedulesBy('pg_cron_http'), ...schedulesBy('pg_cron_sql')]) {
      expect(script, s.name).toContain(`"${s.name}|${s.schedule}"`);
    }
  });
});

describe('toCrontab (VPS, ТЗ §8.2)', () => {
  it('строка на каждую задачу, Bearer CRON_SECRET, без секрета в тексте', () => {
    const lines = toCrontab('http://app:3000');
    expect(lines.length).toBe(SCHEDULES.length);
    expect(lines[0]).toContain('Authorization: Bearer $CRON_SECRET');
    expect(lines.join('\n')).not.toMatch(/Bearer [0-9a-f]{16,}/);
    expect(lines.find((l) => l.includes('cron_keep_alive'))).toContain('psql');
  });
});
