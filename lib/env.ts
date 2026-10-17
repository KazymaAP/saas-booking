// lib/env.ts — обязательные переменные окружения и их проверка.
// Используется в lib/supabase.ts (ленивая проверка при первом обращении), instrumentation.ts (при старте
// сервера) и scripts/preflight.sh (перед деплоем). Одно место — один список.

// Без них приложение не работает вообще.
export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'CRON_SECRET',
] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number];

type EnvSource = Readonly<Record<string, string | undefined>>;

// Форматные проверки: ошибка в значении ловится до первого запроса, а не в середине cron-задачи.
const FORMAT_RULES: Partial<Record<RequiredEnvName, { test: (value: string) => boolean; hint: string }>> = {
  NEXT_PUBLIC_SITE_URL: { test: (v) => /^https?:\/\/[^/\s]+\/?$/.test(v), hint: 'полный адрес без пути, например https://zapishisya.ru' },
  // http допустим только для локального `supabase start` (http://127.0.0.1:54321).
  NEXT_PUBLIC_SUPABASE_URL: {
    test: (v) => /^https:\/\/[^/\s]+\/?$/.test(v) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?\/?$/.test(v),
    hint: 'https://<project>.supabase.co (локально — http://127.0.0.1:54321)',
  },
  ENCRYPTION_KEY: { test: (v) => /^[0-9a-fA-F]{64}$/.test(v), hint: '64 hex-символа (openssl rand -hex 32)' },
  CRON_SECRET: { test: (v) => v.length >= 32, hint: 'не короче 32 символов (openssl rand -hex 32)' },
};

// Без parameter properties: файл исполняется и через `node --experimental-strip-types` (scripts/preflight.sh).
export class EnvError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Переменные окружения не настроены:\n  - ${problems.join('\n  - ')}\nСм. .env.example.`);
    this.name = 'EnvError';
    this.problems = problems;
  }
}

// Список проблем: пустой массив — всё в порядке.
export function checkEnv(env: EnvSource = process.env, names: readonly RequiredEnvName[] = REQUIRED_ENV): string[] {
  const problems: string[] = [];
  for (const name of names) {
    const value = env[name]?.trim();
    if (!value) {
      problems.push(`${name}: не задана`);
      continue;
    }
    const rule = FORMAT_RULES[name];
    if (rule && !rule.test(value)) problems.push(`${name}: неверный формат — ${rule.hint}`);
  }
  return problems;
}

// Значение обязательной переменной или понятная ошибка вместо падения где-то внутри SDK.
export function requireEnv(name: RequiredEnvName, env: EnvSource = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new EnvError([`${name}: не задана`]);
  return value;
}
