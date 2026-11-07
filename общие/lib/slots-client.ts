// lib/slots-client.ts — загрузка свободных слотов в браузере (BookingForm, RescheduleForm).
// Кэш на 10 секунд (= Cache-Control API), дедупликация параллельных запросов, prefetch при hover/focus
// и отмена устаревших запросов через AbortController. Без серверных импортов.
import { parseApiError, reasonMessage, slotsResponse, NETWORK_MESSAGE, type ApiReason } from './schemas';

export const SLOTS_CACHE_TTL_MS = 10_000;
export const SLOTS_ENDPOINT = '/api/bookings/slots';
const MAX_CACHE_ENTRIES = 64; // ~2 месяца дат × услуга; больше — старые вытесняются

export type SlotsKey = { prefix: string; slug: string; serviceId: string; date: string };
export type SlotsFailureReason = ApiReason | 'network' | 'aborted';
export type SlotsResult = { ok: true; slots: string[] } | { ok: false; reason: SlotsFailureReason; message: string };

type Entry = { at: number; promise: Promise<SlotsResult>; value: SlotsResult | null };
type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

// Стабильная строка запроса — она же ключ кэша. Порядок параметров фиксирован.
export function slotsQueryString(key: SlotsKey): string {
  return new URLSearchParams({ prefix: key.prefix, slug: key.slug, serviceId: key.serviceId, date: key.date }).toString();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : error instanceof Error && error.name === 'AbortError';
}

async function readSlots(response: Response): Promise<SlotsResult> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = slotsResponse.safeParse(body);
  if (response.ok && parsed.success) return { ok: true, slots: parsed.data.slots };
  const error = parseApiError(body);
  return { ok: false, reason: error.reason, message: reasonMessage(error) };
}

export function createSlotsClient(fetchImpl: FetchLike, now: () => number = Date.now) {
  const cache = new Map<string, Entry>();

  function fresh(qs: string): Entry | null {
    const entry = cache.get(qs);
    if (entry === undefined) return null;
    if (now() - entry.at > SLOTS_CACHE_TTL_MS) {
      cache.delete(qs);
      return null;
    }
    return entry;
  }

  function remember(qs: string, promise: Promise<SlotsResult>): Entry {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (oldest.done === false) cache.delete(oldest.value);
    }
    const entry: Entry = { at: now(), promise, value: null };
    cache.set(qs, entry);
    // Ошибки не кэшируются: следующий запрос пойдёт в сеть заново.
    void promise.then((result) => {
      if (result.ok) entry.value = result;
      else if (cache.get(qs) === entry) cache.delete(qs);
    });
    return entry;
  }

  function request(qs: string, signal?: AbortSignal): Promise<SlotsResult> {
    return fetchImpl(`${SLOTS_ENDPOINT}?${qs}`, { signal, headers: { Accept: 'application/json' } })
      .then(readSlots)
      .catch((error: unknown): SlotsResult => {
        if (isAbortError(error)) return { ok: false, reason: 'aborted', message: '' };
        return { ok: false, reason: 'network', message: NETWORK_MESSAGE };
      });
  }

  return {
    // Синхронно: уже загруженный ответ (мгновенная отрисовка без «загрузки»).
    peek(key: SlotsKey): string[] | null {
      const value = fresh(slotsQueryString(key))?.value;
      return value?.ok ? value.slots : null;
    },
    // Загрузка для отображения. Если тот же запрос уже идёт (prefetch) — переиспользуется.
    async load(key: SlotsKey, signal?: AbortSignal): Promise<SlotsResult> {
      const qs = slotsQueryString(key);
      const cached = fresh(qs);
      const result = await (cached ?? remember(qs, request(qs, signal))).promise;
      // Общий запрос мог отменить другой вызывающий (его signal), а наш ещё актуален — повторяем один раз.
      if (result.ok === false && result.reason === 'aborted' && signal?.aborted !== true) {
        return (fresh(qs) ?? remember(qs, request(qs, signal))).promise;
      }
      return result;
    },
    // Фоновая загрузка при hover/focus на дату: без signal, результат ляжет в кэш.
    prefetch(key: SlotsKey): void {
      const qs = slotsQueryString(key);
      if (fresh(qs) === null) remember(qs, request(qs));
    },
    // После slot_taken: список устарел, следующий load пойдёт в сеть.
    invalidate(key: SlotsKey): void {
      cache.delete(slotsQueryString(key));
    },
    size(): number {
      return cache.size;
    },
  };
}

export type SlotsClient = ReturnType<typeof createSlotsClient>;

// Общий экземпляр для страницы: prefetch из одной формы виден другой. Используется только в браузере
// (из useEffect и обработчиков), поэтому серверный рендер кэш не трогает.
let shared: SlotsClient | null = null;
export function sharedSlotsClient(): SlotsClient {
  shared ??= createSlotsClient((input, init) => fetch(input, init));
  return shared;
}
