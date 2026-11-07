// lib/telegram.test.ts — Vitest: единая точка отправки (успех, ошибка, retry, timeout, кэш getMe).
// Telegram API и Supabase замоканы: сеть и БД не нужны.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}

const inserts: InsertCall[] = [];
let insertError: { code: string } | null = null;
let insertThrows = false;

vi.mock('@/lib/supabase', () => ({
  adminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (insertThrows && table === 'telegram_messages') throw new TypeError('db driver crashed');
        inserts.push({ table, row });
        return { error: table === 'telegram_messages' ? insertError : null };
      },
    }),
  }),
}));

import {
  botToken,
  clampText,
  escapeHtml,
  getBotInfo,
  hashChatId,
  isAdminChat,
  resetTelegramState,
  runInBackground,
  safeEqual,
  sendTelegram,
  stripHtml,
  TELEGRAM_TEXT_LIMIT,
} from './telegram';

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const okBody = { ok: true, result: { message_id: 42 } };

let fetchMock: Mock<FetchFn>;

function sentPayload(index: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[index][1];
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  inserts.length = 0;
  insertError = null;
  insertThrows = false;
  resetTelegramState();
  fetchMock = vi.fn<FetchFn>();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'admin-token');
  vi.stubEnv('TELEGRAM_BUSINESS_BOT_TOKEN', '');
  vi.stubEnv('TELEGRAM_CHAT_ID', '1000');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('токены и роли', () => {
  it('один бот на обе роли, если бизнес-токен не задан', () => {
    expect(botToken('admin')).toBe('admin-token');
    expect(botToken('business')).toBe('admin-token');
  });

  it('бизнес-роль использует свой токен, если он задан', () => {
    vi.stubEnv('TELEGRAM_BUSINESS_BOT_TOKEN', 'biz-token');
    expect(botToken('business')).toBe('biz-token');
    expect(botToken('admin')).toBe('admin-token');
  });

  it('isAdminChat сравнивает со строкой TELEGRAM_CHAT_ID', () => {
    expect(isAdminChat(1000)).toBe(true);
    expect(isAdminChat('1001')).toBe(false);
  });
});

describe('sendTelegram', () => {
  it('успех: одна попытка, HTML, message_id, запись в telegram_messages', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, okBody));
    const res = await sendTelegram('555', '<b>Привет</b>', { businessId: 'b1' });
    expect(res).toEqual({ ok: true, messageId: 42, attempts: 1, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/botadmin-token/sendMessage');
    expect(sentPayload(0)).toMatchObject({ chat_id: '555', parse_mode: 'HTML', disable_web_page_preview: true });
    const log = inserts.find((i) => i.table === 'telegram_messages');
    expect(log?.row).toMatchObject({ direction: 'out', chat_id: '555', business_id: 'b1', message_id: '42' });
  });

  it('ошибка 400: без повторов, лог ошибки без chat_id и текста', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(400, { ok: false, description: 'Bad Request: chat not found' }));
    const res = await sendTelegram('555', 'секретный текст', { backoffMs: 0, alertOnFailure: false });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('http_400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit?.row.action).toBe('error:telegram');
    expect(JSON.stringify(audit?.row)).not.toContain('555');
    expect(JSON.stringify(audit?.row)).not.toContain('секретный');
  });

  it('retry: 500 → 500 → 200 даёт успех с третьей попытки', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { ok: false }))
      .mockResolvedValueOnce(jsonResponse(502, { ok: false }))
      .mockResolvedValueOnce(jsonResponse(200, okBody));
    const res = await sendTelegram('555', 'x', { backoffMs: 0 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(3);
  });

  it('retry: ровно 2 повтора, затем алерт админу', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(500, { ok: false }));
    const res = await sendTelegram('555', 'x', { backoffMs: 0 });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(3);
    // 3 попытки бизнесу + 3 попытки алерта админу (алерт тоже не доставлен, но не рекурсирует)
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(sentPayload(3).chat_id).toBe('1000');
  });

  it('алерты о недоставке не чаще раза в 10 минут; пропущенные считаются в следующем', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      fetchMock.mockImplementation(async (_url, init) => {
        const chat = String(JSON.parse(String(init.body)).chat_id);
        return chat === '1000' ? jsonResponse(200, okBody) : jsonResponse(400, { ok: false });
      });
      const alerts = () => fetchMock.mock.calls.filter(([, init]) => String(JSON.parse(String(init.body)).chat_id) === '1000');
      for (let i = 0; i < 5; i++) await sendTelegram(String(500 + i), 'x', { backoffMs: 0 });
      expect(alerts()).toHaveLength(1);
      vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
      await sendTelegram('600', 'x', { backoffMs: 0 });
      expect(alerts()).toHaveLength(2);
      expect(String(JSON.parse(String(alerts()[1][1].body)).text)).toContain('ещё 4 с прошлого алерта');
      // Каждая недоставка всё равно в audit_log.
      expect(inserts.filter((i) => i.table === 'audit_log' && i.row.payload && JSON.stringify(i.row.payload).includes('send_failed'))).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('429 с retry_after повторяется', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { ok: false, parameters: { retry_after: 0 } }))
      .mockResolvedValueOnce(jsonResponse(200, okBody));
    const res = await sendTelegram('555', 'x', { backoffMs: 0 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it('timeout: запрос прерывается и повторяется', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const started = Date.now();
    const res = await sendTelegram('555', 'x', { timeoutMs: 20, backoffMs: 0, alertOnFailure: false });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('timeout');
    expect(res.attempts).toBe(3);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('сетевой сбой: network и повтор', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(jsonResponse(200, okBody));
    const res = await sendTelegram('555', 'x', { backoffMs: 0 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
  });

  it('ошибка разметки HTML → повтор простым текстом', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { ok: false, description: "Bad Request: can't parse entities" }))
      .mockResolvedValueOnce(jsonResponse(200, okBody));
    const res = await sendTelegram('555', '<b>A &amp; B</b>', { backoffMs: 0 });
    expect(res.ok).toBe(true);
    const second = sentPayload(1);
    expect(second.parse_mode).toBeUndefined();
    expect(second.text).toBe('A & B');
  });

  it('фолбэк простым текстом не расходует попытку: срабатывает и при retries: 0', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { ok: false, description: "Bad Request: can't parse entities" }))
      .mockResolvedValueOnce(jsonResponse(200, okBody));
    const res = await sendTelegram('555', '<b>x</b>', { retries: 0, backoffMs: 0 });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('сбой журнала telegram_messages (исключение) не ломает отправку', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, okBody));
    insertThrows = true;
    const res = await sendTelegram('555', 'x');
    expect(res.ok).toBe(true);
    expect(inserts.find((i) => i.table === 'audit_log')?.row.payload).toMatchObject({ message: 'messages_log_crashed' });
  });

  it('миграция без нового chat_id и повторная миграция не зацикливают', async () => {
    const migrated = { ok: false, description: 'Bad Request: group chat was upgraded', parameters: { migrate_to_chat_id: -1009 } };
    fetchMock.mockImplementation(async () => jsonResponse(400, migrated));
    const res = await sendTelegram('-100', 'x', { alertOnFailure: false });
    expect(res.ok).toBe(false);
    // 1-я попытка → исправление на -1009 → 2-я попытка: тот же chat_id, исправлять нечего, 400 окончательна.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('фолбэк только один раз: повторная ошибка разметки не зацикливает', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(400, { ok: false, description: "Bad Request: can't parse entities" }));
    const res = await sendTelegram('555', '<b>x</b>', { backoffMs: 0, alertOnFailure: false });
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('403 (бот заблокирован) не будит админа', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(403, { ok: false, description: 'Forbidden: bot was blocked by the user' }));
    const res = await sendTelegram('555', 'x', { backoffMs: 0 });
    expect(res.error).toBe('http_403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('нет токена / нет chat_id — без запросов', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    expect((await sendTelegram('555', 'x')).error).toBe('no_token');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 't');
    expect((await sendTelegram(null, 'x')).error).toBe('no_chat');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('кнопки уходят как inline_keyboard, длинный текст обрезается', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, okBody));
    await sendTelegram('555', 'я'.repeat(TELEGRAM_TEXT_LIMIT + 100), { buttons: [[{ text: 'Открыть', url: 'https://x.ru' }]] });
    const payload = sentPayload(0);
    expect(String(payload.text).length).toBe(TELEGRAM_TEXT_LIMIT);
    expect(payload.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Открыть', url: 'https://x.ru' }]] });
  });

  it('нет таблицы telegram_messages — отправка работает, журнал отключается', async () => {
    insertError = { code: '42P01' };
    fetchMock.mockImplementation(async () => jsonResponse(200, okBody));
    expect((await sendTelegram('555', 'x')).ok).toBe(true);
    expect((await sendTelegram('555', 'y')).ok).toBe(true);
    expect(inserts.filter((i) => i.table === 'telegram_messages')).toHaveLength(1);
  });
});

describe('глобальный лимит отправки', () => {
  it('параллельные отправки сверх 25/с не уходят в одну секунду', async () => {
    vi.useFakeTimers();
    try {
      const sentTimes: number[] = [];
      fetchMock.mockImplementation(async () => {
        sentTimes.push(Date.now());
        return jsonResponse(200, okBody);
      });
      const started = Date.now();
      const batch = Promise.all(Array.from({ length: 60 }, (_, i) => sendTelegram(String(i), 'x', { log: false })));
      await vi.advanceTimersByTimeAsync(5_000);
      const results = await batch;
      expect(results.every((r) => r.ok)).toBe(true);
      // В любом окне 1 с — не больше 25 отправок.
      for (const t of sentTimes) {
        const inWindow = sentTimes.filter((x) => x >= t && x < t + 1_000).length;
        expect(inWindow).toBeLessThanOrEqual(25);
      }
      expect(Math.max(...sentTimes) - started).toBeGreaterThanOrEqual(2_000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getBotInfo', () => {
  it('кэширует getMe на час и перезапрашивает после истечения', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    fetchMock.mockImplementation(async () => jsonResponse(200, { ok: true, result: { id: 7, username: 'zapis_bot', first_name: 'Запись' } }));
    expect(await getBotInfo()).toEqual({ id: 7, username: 'zapis_bot', firstName: 'Запись' });
    await getBotInfo();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1);
    await getBotInfo();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('ошибка getMe кэшируется на минуту (не ждём таймаут на каждом запросе), затем повтор', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { ok: false })).mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { id: 7, username: 'b' } }));
      expect(await getBotInfo()).toBeNull();
      expect(await getBotInfo()).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 60 * 1000 + 1);
      expect((await getBotInfo())?.username).toBe('b');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('утилиты', () => {
  it('escapeHtml экранирует спецсимволы', () => {
    expect(escapeHtml('<a href="x">A & B</a>')).toBe('&lt;a href=&quot;x&quot;&gt;A &amp; B&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
  });

  it('stripHtml обратна escapeHtml для текста', () => {
    expect(stripHtml(`<b>${escapeHtml('A < B & "C"')}</b>`)).toBe('A < B & "C"');
  });

  it('clampText не разрезает эмодзи (суррогатную пару)', () => {
    const cut = clampText('ab🎉cd', 4);
    expect(cut).toBe('ab…');
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('длинный HTML уходит простым текстом сразу (без 400 на разрезанном теге)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, okBody));
    await sendTelegram('555', `<b>${'a&amp;'.repeat(1000)}</b>`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = sentPayload(0);
    expect(payload.parse_mode).toBeUndefined();
    expect(String(payload.text).startsWith('a&a&')).toBe(true);
    expect(String(payload.text).length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
  });

  it('clampText не трогает короткий текст', () => {
    expect(clampText('abc', 10)).toBe('abc');
    expect(clampText('abcdef', 4)).toBe('abc…');
  });

  it('safeEqual: совпадение, несовпадение, пустые значения', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secreT', 'secret')).toBe(false);
    expect(safeEqual('short', 'longer-secret')).toBe(false);
    expect(safeEqual(null, 'secret')).toBe(false);
    expect(safeEqual('secret', undefined)).toBe(false);
  });

  it('hashChatId детерминирован и не содержит исходного id', () => {
    expect(hashChatId(123456789)).toBe(hashChatId('123456789'));
    expect(hashChatId(123456789)).not.toContain('123456789');
  });

  it('hashChatId — HMAC: без ключа сервера не воспроизводится простым sha256', async () => {
    const { createHash } = await import('crypto');
    const plain = createHash('sha256').update('123456789').digest('hex').slice(0, 16);
    expect(hashChatId(123456789)).not.toBe(plain);
    const before = hashChatId(123456789);
    vi.stubEnv('TELEGRAM_HASH_SECRET', 'other');
    expect(hashChatId(123456789)).not.toBe(before);
  });
});

describe('runInBackground', () => {
  const contextKey = Symbol.for('@vercel/request-context');

  afterEach(() => {
    Reflect.deleteProperty(globalThis, contextKey);
  });

  it('без request context — дожидается задачи (корректность важнее скорости)', async () => {
    let done = false;
    await runInBackground(async () => { done = true; });
    expect(done).toBe(true);
  });

  it('с waitUntil (Vercel) — отдаёт промис платформе и не ждёт', async () => {
    const waitUntil = vi.fn<(p: Promise<unknown>) => void>();
    Reflect.set(globalThis, contextKey, { get: () => ({ waitUntil }) });
    let release: () => void = () => undefined;
    const task = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    await runInBackground(task);
    expect(task).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    release();
    await waitUntil.mock.calls[0][0];
  });

  it('исключение задачи не теряется: error:telegram в audit_log, наружу не летит', async () => {
    await expect(runInBackground(async () => { throw new TypeError('boom'); })).resolves.toBeUndefined();
    const logged = inserts.find((i) => i.table === 'audit_log');
    expect(logged?.row.payload).toMatchObject({ message: 'background_failed', reason: 'TypeError' });
  });
});
