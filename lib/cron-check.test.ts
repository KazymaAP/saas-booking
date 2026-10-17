// lib/cron-check.test.ts — scripts/cron-check.sh на заглушке psql: коды выхода 0/1 без живого Supabase.
// Заглушка отвечает на запросы скрипта по ключевым словам; набор задач cron.job берётся из реестра SCHEDULES.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schedulesBy } from './schedules';

const SCRIPT = join(process.cwd(), 'scripts', 'cron-check.sh');
const hasBash = process.platform !== 'win32' && spawnSync('bash', ['--version']).status === 0;

interface StubOptions {
  jobs?: string[];
  settings?: string;
  // Имена задач, у которых команда в cron.job отличается от cron_registry.
  badCommands?: string[];
}

function expectedJobs(): string[] {
  return [...schedulesBy('pg_cron_http'), ...schedulesBy('pg_cron_sql')].map((s) => `${s.name}|${s.schedule}|t`);
}

// Каталог с исполняемым psql, который печатает заготовленные ответы.
function stubPath(options: StubOptions): string {
  const dir = mkdtempSync(join(tmpdir(), 'cron-check-'));
  writeFileSync(join(dir, 'jobs.txt'), `${(options.jobs ?? expectedJobs()).join('\n')}\n`);
  const psql = `#!/usr/bin/env bash
sql="\${@: -1}"
case "$sql" in
  *"from cron.job order by jobname"*) cat "${dir}/jobs.txt" ;;
  *"from cron_registry r join cron.job"*) printf '%s' "${(options.badCommands ?? []).join('\\n')}" ;;
  *cron_setting*) echo "${options.settings ?? 't|t'}" ;;
  *"from audit_log"*) echo 0 ;;
  *) ;;
esac
`;
  writeFileSync(join(dir, 'psql'), psql);
  chmodSync(join(dir, 'psql'), 0o755);
  return dir;
}

function run(options: StubOptions, env: Record<string, string> = { SUPABASE_DB_URL: 'postgresql://stub' }) {
  const dir = stubPath(options);
  const result = spawnSync('bash', [SCRIPT], {
    // Чистое окружение: SUPABASE_DB_URL разработчика не должен попасть в тест.
    env: { NODE_ENV: 'test', PATH: `${dir}:${process.env.PATH ?? ''}`, ...env },
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe.skipIf(hasBash === false)('scripts/cron-check.sh', () => {
  it('все задачи на месте → exit 0', () => {
    const { code, out } = run({});
    expect(out).toContain('ИТОГ: все задачи на месте');
    expect(code).toBe(0);
  });

  it('расписание расходится → exit 1', () => {
    const jobs = expectedJobs().map((j) => (j.startsWith('send-emails|') ? 'send-emails|*/2 * * * *|t' : j));
    const { code, out } = run({ jobs });
    expect(out).toContain('РАСПИС.  send-emails');
    expect(code).toBe(1);
  });

  it('задача выключена или отсутствует → exit 1', () => {
    const jobs = expectedJobs()
      .filter((j) => j.startsWith('keep-alive|') === false)
      .map((j) => (j.startsWith('follow-up|') ? j.replace(/\|t$/, '|f') : j));
    const { code, out } = run({ jobs });
    expect(out).toContain('НЕТ      keep-alive');
    expect(out).toContain('ВЫКЛ.    follow-up');
    expect(code).toBe(1);
  });

  it('лишняя задача — только предупреждение, exit 0', () => {
    const { code, out } = run({ jobs: [...expectedJobs(), 'old-job|0 0 * * *|t'] });
    expect(out).toContain('ЛИШНЯЯ   old-job');
    expect(code).toBe(0);
  });

  it('команда задачи подменена (не совпадает с cron_registry) → exit 1', () => {
    const { code, out } = run({ badCommands: ['follow-up'] });
    expect(out).toContain('КОМАНДА  follow-up');
    expect(code).toBe(1);
  });

  it('не заданы app.site_url / app.cron_secret → exit 1', () => {
    const { code, out } = run({ settings: 't|f' });
    expect(out).toContain('НЕТ      app.site_url');
    expect(code).toBe(1);
  });

  it('нет SUPABASE_DB_URL → exit 1 с понятной ошибкой', () => {
    const { code, out } = run({}, {});
    expect(out).toContain('не задан SUPABASE_DB_URL');
    expect(code).toBe(1);
  });
});
