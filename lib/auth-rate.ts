// lib/auth-rate.ts — rate limit для auth-сценариев поверх lib/rate-limit.ts (Postgres, DECISIONS.md).
// Ключ бакета содержит отпечаток, а не сам email/IP: таблица rate_limits не хранит PII.
// При недоступности хранилища — fail open (ТЗ §7.3) с записью в журнал.
import { hitRateLimit } from './rate-limit';
import { fingerprint, RATE_LIMITS, type RateScope } from './auth-core';
import { authEvent } from './auth-audit';

export function rateBucket(scope: RateScope, key: string): string {
  return `auth:${scope}:${fingerprint(key)}`;
}

// true — запрос можно выполнять; false — лимит исчерпан (ответ 429 / сообщение в форме).
export async function allowRate(scope: RateScope, key: string): Promise<boolean> {
  const rule = RATE_LIMITS[scope];
  try {
    return await hitRateLimit(rateBucket(scope, key), rule.limit, rule.windowSeconds);
  } catch (err) {
    await authEvent('rate_limit_unavailable', { reason: err instanceof Error ? err.message.slice(0, 120) : scope });
    return true;
  }
}

// Проверяет несколько лимитов; считаются все, чтобы атакующий не мог «обойти» второй лимит первым.
export async function allowAll(checks: ReadonlyArray<readonly [RateScope, string]>): Promise<boolean> {
  const results = await Promise.all(checks.map(([scope, key]) => allowRate(scope, key)));
  return results.every(Boolean);
}
