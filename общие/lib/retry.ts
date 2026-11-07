// lib/retry.ts — повтор операций и ограничение параллельности (общие для импорта и генерации).

export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 200;

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  // false — ошибка не временная, повторять бессмысленно (например, нарушение уникальности).
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Экспоненциальная задержка: 200, 400, 800 мс ... Последняя ошибка пробрасывается наружу.
export async function withRetry<T>(op: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS);
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const wait = opts.sleep ?? sleep;
  let lastError: unknown = new Error('withRetry: нет попыток');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await op(attempt);
    } catch (e) {
      lastError = e;
      const retryable = opts.shouldRetry ? opts.shouldRetry(e, attempt) : true;
      if (!retryable || attempt === attempts) break;
      await wait(base * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

// Выполняет worker для всех элементов, не больше limit одновременно. Порядок результатов = порядок items.
export async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
