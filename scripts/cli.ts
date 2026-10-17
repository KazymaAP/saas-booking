// scripts/cli.ts — общее для CLI-скриптов импорта: .env.local, проверка переменных (Zod), аргументы, вывод.
// Вывод через process.stdout/stderr: это CLI, а не серверный код, console.* в проекте запрещён.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const ENV_LINE_RE = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/;

// Значения из .env.local не перекрывают уже заданные в окружении (так удобнее в CI).
export function loadEnvFile(path = '.env.local'): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(ENV_LINE_RE);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string({ required_error: 'не задан' }).url('нужен URL проекта Supabase'),
  SUPABASE_SERVICE_ROLE_KEY: z.string({ required_error: 'не задан' }).min(20, 'слишком короткий ключ'),
});

export function serviceClient(): SupabaseClient {
  const env = EnvSchema.safeParse(process.env);
  if (!env.success) {
    const issues = env.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new CliError(`${issues} (задайте в окружении или .env.local)`);
  }
  return createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Ошибка пользователя (неверные аргументы, нет файла): печатается без стека, код выхода 2.
export class CliError extends Error {}

export type CliArgs = { positional: string[]; flags: Map<string, string | true> };

// --key=value, --key value (только для известных ключей со значением), --flag.
export function parseArgs(argv: readonly string[], valueKeys: readonly string[] = []): CliArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (valueKeys.includes(key) && next !== undefined && !next.startsWith('--')) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { positional, flags };
}

export function readInputFile(path: string | undefined, maxBytes: number, ext: RegExp): Buffer {
  if (!path) throw new CliError('Не указан входной файл');
  if (!ext.test(path)) throw new CliError(`Неверное расширение файла: ${path}`);
  if (!existsSync(path)) throw new CliError(`Файл не найден: ${path}`);
  const size = statSync(path).size;
  if (size > maxBytes) throw new CliError(`Файл ${path} больше ${Math.round(maxBytes / 1024 / 1024)} МБ`);
  return readFileSync(path);
}

export const out = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
export const err = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

// Запуск main с понятным кодом выхода: 0 — успех, 1 — ошибка выполнения, 2 — ошибка аргументов, 3 — частичный успех.
export function runCli(main: () => Promise<number>): void {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      err(e instanceof CliError ? `Ошибка: ${e.message}` : `Сбой: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      process.exitCode = e instanceof CliError ? 2 : 1;
    },
  );
}
