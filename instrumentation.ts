// instrumentation.ts — выполняется один раз при старте сервера Next (experimental.instrumentationHook).
// Нет обязательных переменных окружения → сервер падает сразу с понятным списком, а не на первом запросе.
// Во время `next build` не вызывается, поэтому сборка без секретов (CI) возможна.
import { checkEnv, EnvError } from './общие/lib/env';

export function register(): void {
  // Edge-инстансы middleware не читают БД и секреты Supabase — проверяем только Node-сервер.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const problems = checkEnv();
  if (problems.length > 0) throw new EnvError(problems);
}
