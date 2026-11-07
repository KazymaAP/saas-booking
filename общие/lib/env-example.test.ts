// lib/env-example.test.ts — .env.example синхронизирован с кодом: каждая process.env.X из исходников описана.
// Новая переменная без строки в .env.example → тест падает (ловит «забыли добавить в Vercel»).
// Плюс: клиентские компоненты ('use client') не читают серверные переменные — в браузере они undefined,
// а при попытке «починить» префиксом NEXT_PUBLIC_ секрет утечёт в бандл.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REQUIRED_ENV } from './env';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'out']);
const SOURCE_RE = /\.(?:ts|tsx|mjs)$/;
const ENV_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;

// Выставляются платформой (Next, Vercel), в .env.example не нужны.
const PLATFORM_ENV = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL', 'VERCEL_GIT_COMMIT_SHA']);

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (SOURCE_RE.test(entry.name) && !entry.name.includes('.test.')) files.push(path);
  }
  return files;
}

function usedEnv(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of sourceFiles(ROOT)) {
    for (const match of readFileSync(file, 'utf8').matchAll(ENV_RE)) {
      const name = match[1];
      if (name && !used.has(name)) used.set(name, relative(ROOT, file));
    }
  }
  return used;
}

function documentedEnv(): Set<string> {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8');
  return new Set([...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? ''));
}

describe('.env.example', () => {
  it('описывает все переменные, которые читает код', () => {
    const documented = documentedEnv();
    const missing = [...usedEnv()]
      .filter(([name]) => !PLATFORM_ENV.has(name) && !documented.has(name))
      .map(([name, file]) => `${name} (${file})`);
    expect(missing).toEqual([]);
  });

  it('содержит все обязательные переменные из lib/env.ts', () => {
    const documented = documentedEnv();
    expect(REQUIRED_ENV.filter((name) => !documented.has(name))).toEqual([]);
  });

  it("'use client' файлы читают только NEXT_PUBLIC_* и NODE_ENV", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = readFileSync(file, 'utf8');
      if (!/^\s*['"]use client['"]/m.test(text)) continue;
      for (const match of text.matchAll(ENV_RE)) {
        const name = match[1] ?? '';
        if (name !== 'NODE_ENV' && !name.startsWith('NEXT_PUBLIC_')) violations.push(`${name} (${relative(ROOT, file)})`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('не содержит заполненных секретов', () => {
    const text = readFileSync(join(ROOT, '.env.example'), 'utf8');
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'ENCRYPTION_KEY', 'CRON_SECRET', 'TELEGRAM_BOT_TOKEN', 'VERCEL_API_TOKEN']) {
      expect(text, name).toMatch(new RegExp(`^${name}=$`, 'm'));
    }
  });
});
