// lib/test-utils/context.ts — контекст cron-задачи поверх Supabase в памяти (lib/test-utils/memory-db.ts).
import type { CronContext, CronEnv } from '../cron';
import { createMemoryDb, type MemoryDb, type MemoryDbOptions, type Row } from './memory-db';
import { TEST_NOW, createLoggerMock, createNotifierMock, type LoggerMock, type NotifierMock } from './supabase-mock';

const TEST_BUDGET_MS = 50_000;

export interface MemoryContext extends CronContext {
  mem: MemoryDb;
  notifyMock: NotifierMock;
  logMock: LoggerMock;
}

export interface MemoryContextOptions extends MemoryDbOptions {
  now?: Date;
  mailOk?: boolean;
  mailThrows?: boolean;
  fetchImpl?: typeof fetch;
  env?: Partial<CronEnv>;
  // Бюджет времени, мс. 0 — «время вышло» сразу.
  budgetMs?: number;
}

export function memoryContext(tables: Record<string, Row[]> = {}, options: MemoryContextOptions = {}): MemoryContext {
  const mem = createMemoryDb(tables, options);
  const notifyMock = createNotifierMock({ mailOk: options.mailOk, mailThrows: options.mailThrows });
  const logMock = createLoggerMock();
  const defaultFetch: typeof fetch = () => Promise.resolve(new Response('{}', { status: 200 }));
  return {
    db: mem.client,
    now: options.now ?? TEST_NOW,
    deadline: Date.now() + (options.budgetMs ?? TEST_BUDGET_MS),
    notify: notifyMock,
    log: logMock,
    env: { siteUrl: 'https://example.test', vercelApiToken: 'token', vercelProjectId: 'prj_1', vercelTeamId: '', ...options.env },
    fetch: options.fetchImpl ?? defaultFetch,
    mem,
    notifyMock,
    logMock,
  };
}

// ISO-время со сдвигом от TEST_NOW (или другого now) в часах — удобно для окон напоминаний.
export function hoursFrom(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

export function daysFrom(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}
