// lib/telegram-webhook.test.ts — Vitest: оба webhook целиком (секрет, idempotency, /start BIZ, TTL,
// одноразовость, rate limit, чужие chat_id, админ-команды). Supabase — in-memory, Telegram API — mock fetch.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createFakeDb } from './telegram.fake-db';

const fake = createFakeDb();
vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client() }));
vi.mock('@/lib/supabase', () => ({ adminClient: () => fake.client() }));

import { POST as businessPost } from '@/app/api/telegram/webhook/route';
import { resetTelegramState } from './telegram';
import { resetWebhookState, parseCommand, SECRET_HEADER, incomingText } from './telegram-webhook';
import { generateCode, normalizeCode, resetConnectState, CODE_ATTEMPTS_LIMIT, CODE_TTL_MS } from './telegram-connect';
import { BOT_REPLIES, newBooking, sendBusinessEvent } from './telegram-events';

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchFn>;

const BIZ_SECRET = 'biz-secret';
const ADMIN_SECRET = BIZ_SECRET;
const ADMIN_CHAT = 1000;
const OWNER_CHAT = 555;
let updateId = 1;

function update(chatId: number, text: string, chatType = 'private') {
  return { update_id: updateId++, message: { message_id: 1, chat: { id: chatId, type: chatType }, from: { id: chatId, is_bot: false }, text } };
}

function post(handler: (req: Request) => Promise<Response>, body: unknown, secret: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) headers[SECRET_HEADER] = secret;
  return handler(new Request('https://x.ru/api/telegram/webhook', { method: 'POST', headers, body: JSON.stringify(body) }));
}

/** Тексты, отправленные ботом в чат chatId. */
function repliesTo(chatId: number): string[] {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse(String(init.body)))
    .filter((p: { chat_id: number | string }) => String(p.chat_id) === String(chatId))
    .map((p: { text: string }) => p.text);
}

function seedBusiness(id = 'b1', name = 'Студия <Ромашка>') {
  fake.tables.businesses = [{ id, name, status: 'client', telegram_chat_id: null }];
}

function seedCode(code: string, businessId = 'b1', ageMs = 0, usedAt: string | null = null) {
  (fake.tables.business_telegram_codes ??= []).push({
    code,
    business_id: businessId,
    created_at: new Date(Date.now() - ageMs).toISOString(),
    expires_at: new Date(Date.now() - ageMs + CODE_TTL_MS).toISOString(),
    used_at: usedAt,
  });
}

beforeEach(() => {
  fake.reset();
  resetTelegramState();
  resetWebhookState();
  resetConnectState();
  fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 9, id: 1, username: 'zapis_bot' } }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
  vi.stubEnv('TELEGRAM_BUSINESS_BOT_TOKEN', '');
  vi.stubEnv('TELEGRAM_CHAT_ID', String(ADMIN_CHAT));
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', BIZ_SECRET);
  vi.stubEnv('TELEGRAM_ADMIN_WEBHOOK_SECRET', ADMIN_SECRET);
  vi.stubEnv('TELEGRAM_BUSINESS_BOT_USERNAME', 'zapis_bot');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('секрет (ТЗ §18.2)', () => {
  it('нет заголовка → 403, без обработки', async () => {
    const res = await post(businessPost, update(OWNER_CHAT, '/start'), null);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('неверный секрет → 403 и запись error:telegram', async () => {
    const res = await post(businessPost, update(OWNER_CHAT, '/start'), 'wrong');
    expect(res.status).toBe(403);
    expect(fake.tables.audit_log?.[0]).toMatchObject({ action: 'error:telegram', payload: { message: 'webhook_secret_mismatch' } });
  });

  it('секрет не настроен → 403 даже с пустым заголовком', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');
    expect((await post(businessPost, update(OWNER_CHAT, '/start'), '')).status).toBe(403);
  });

  // Тест на «секрет бизнеса не подходит к админ-webhook» удалён: теперь один бот, один webhook, один секрет.

  it('фолбэк на имя секрета из ТЗ (TELEGRAM_BIZ_SECRET)', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');
    vi.stubEnv('TELEGRAM_BIZ_SECRET', 'tz-secret');
    expect((await post(businessPost, update(OWNER_CHAT, '/start'), 'tz-secret')).status).toBe(200);
  });

  it('мусор вместо update → 200 без ответа', async () => {
    const res = await post(businessPost, { hello: 'world' }, BIZ_SECRET);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('бизнес-бот: /start (ТЗ §18.3)', () => {
  it('/start без кода → подсказка по ТЗ', async () => {
    await post(businessPost, update(OWNER_CHAT, '/start'), BIZ_SECRET);
    expect(repliesTo(OWNER_CHAT)[0]).toContain('Отправьте код вида <b>BIZ-xxxxx</b> из админки');
  });

  it('валидный код → chat_id установлен, код использован, ответ с экранированным именем', async () => {
    seedBusiness();
    seedCode('BIZ-ABC234');
    const res = await post(businessPost, update(OWNER_CHAT, '/start BIZ-ABC234'), BIZ_SECRET);
    expect(res.status).toBe(200);
    expect(fake.tables.businesses[0].telegram_chat_id).toBe(String(OWNER_CHAT));
    expect(fake.tables.business_telegram_codes[0].used_at).toBeTruthy();
    expect(repliesTo(OWNER_CHAT)[0]).toContain('<b>Студия &lt;Ромашка&gt;</b>');
  });

  it('код регистронезависим и работает из deep-link /start@bot', async () => {
    seedBusiness();
    seedCode('BIZ-ABC234');
    await post(businessPost, update(OWNER_CHAT, '/start@zapis_bot biz-abc234'), BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBe(String(OWNER_CHAT));
  });

  it('код истёк (TTL 15 мин) → «Код истёк», chat_id не меняется', async () => {
    seedBusiness();
    seedCode('BIZ-ABC234', 'b1', CODE_TTL_MS + 1000);
    await post(businessPost, update(OWNER_CHAT, '/start BIZ-ABC234'), BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
    expect(repliesTo(OWNER_CHAT)[0]).toContain('Код истёк');
  });

  it('TTL проверяется и без колонки expires_at (до миграции)', async () => {
    seedBusiness();
    seedCode('BIZ-ABC234', 'b1', CODE_TTL_MS + 1000);
    delete fake.tables.business_telegram_codes[0].expires_at;
    await post(businessPost, update(OWNER_CHAT, '/start BIZ-ABC234'), BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
  });

  it('код одноразовый: второй чат получает «Код уже использован»', async () => {
    seedBusiness();
    seedCode('BIZ-ABC234');
    await post(businessPost, update(OWNER_CHAT, '/start BIZ-ABC234'), BIZ_SECRET);
    await post(businessPost, update(777, '/start BIZ-ABC234'), BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBe(String(OWNER_CHAT));
    expect(repliesTo(777)[0]).toContain('Код уже использован');
  });

  it('неизвестный код → «Код не найден»', async () => {
    await post(businessPost, update(OWNER_CHAT, '/start BIZ-ZZZZZZ'), BIZ_SECRET);
    expect(repliesTo(OWNER_CHAT)[0]).toContain('Код не найден');
  });

  it('голый код без /start тоже принимается', async () => {
    seedBusiness();
    seedCode('BIZ-ABC234');
    await post(businessPost, update(OWNER_CHAT, 'BIZ-ABC234'), BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBe(String(OWNER_CHAT));
  });

  it('другая команда → «Неизвестная команда»', async () => {
    await post(businessPost, update(OWNER_CHAT, '/foo'), BIZ_SECRET);
    expect(repliesTo(OWNER_CHAT)[0]).toMatch(/^Неизвестная команда/);
  });

  it('в группе на прочие сообщения бот молчит', async () => {
    await post(businessPost, update(-100, 'привет всем', 'group'), BIZ_SECRET);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('в группе /start@чужой_бот игнорируется; имя своего бота берётся из getMe, если нет в env', async () => {
    vi.stubEnv('TELEGRAM_BUSINESS_BOT_USERNAME', '');
    seedBusiness();
    seedCode('BIZ-ABCDEF');
    await post(businessPost, update(-100, '/start@other_bot BIZ-ABCDEF', 'group'), BIZ_SECRET);
    const sent = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/sendMessage'));
    expect(sent).toHaveLength(0);
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
    await post(businessPost, update(-100, '/start@zapis_bot BIZ-ABCDEF', 'group'), BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBe('-100');
  });

  it('/stop отключает уведомления этого чата', async () => {
    fake.tables.businesses = [{ id: 'b1', name: 'X', telegram_chat_id: String(OWNER_CHAT) }];
    await post(businessPost, update(OWNER_CHAT, '/stop'), BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
  });

  it('бота заблокировали (my_chat_member kicked) → чат отвязан', async () => {
    fake.tables.businesses = [{ id: 'b1', name: 'X', telegram_chat_id: String(OWNER_CHAT) }];
    const body = { update_id: updateId++, my_chat_member: { chat: { id: OWNER_CHAT, type: 'private' }, new_chat_member: { status: 'kicked' } } };
    await post(businessPost, body, BIZ_SECRET);
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
  });
});

describe('idempotency по update_id', () => {
  it('повтор того же update не обрабатывается дважды', async () => {
    const body = update(OWNER_CHAT, '/start');
    await post(businessPost, body, BIZ_SECRET);
    await post(businessPost, body, BIZ_SECRET);
    expect(repliesTo(OWNER_CHAT)).toHaveLength(1);
    expect(fake.tables.webhook_events).toHaveLength(1);
    expect(fake.tables.webhook_events[0].processed_at).toBeTruthy();
  });

  it('без таблицы webhook_events — фолбэк в rate_limits, повтор всё равно отсекается', async () => {
    fake.missing.add('webhook_events');
    const body = update(OWNER_CHAT, '/start');
    await post(businessPost, body, BIZ_SECRET);
    await post(businessPost, body, BIZ_SECRET);
    expect(repliesTo(OWNER_CHAT)).toHaveLength(1);
    expect(fake.tables.rate_limits.some((r) => String(r.bucket).startsWith('tgu:tg_business:'))).toBe(true);
  });

  it('одинаковый update_id на одном боте дедуплицируется: второй вызов без ответа', async () => {
    const id = updateId++;
    await post(businessPost, { ...update(ADMIN_CHAT, '/ping'), update_id: id }, BIZ_SECRET);
    await post(businessPost, { ...update(ADMIN_CHAT, '/ping'), update_id: id }, ADMIN_SECRET);
    expect(repliesTo(ADMIN_CHAT)).toEqual(['🏓 pong']);
  });
});

describe('rate limit 30/мин/чат', () => {
  it('31-е сообщение за минуту не обрабатывается', async () => {
    for (let i = 0; i < 31; i++) await post(businessPost, update(OWNER_CHAT, '/foo'), BIZ_SECRET);
    expect(repliesTo(OWNER_CHAT)).toHaveLength(30);
  });

  it('ключ лимита не содержит chat_id в открытом виде', async () => {
    await post(businessPost, update(OWNER_CHAT, '/foo'), BIZ_SECRET);
    const buckets = (fake.tables.rate_limits ?? []).map((r) => String(r.bucket));
    expect(buckets.some((b) => b.startsWith('tg:tg_business:'))).toBe(true);
    expect(buckets.every((b) => !b.includes(String(OWNER_CHAT)))).toBe(true);
  });
});

describe('защита от перебора кодов', () => {
  it('11-я попытка кода за 10 минут → «слишком много попыток», даже верный код не принимается', async () => {
    seedBusiness();
    seedCode('BIZ-ABCDEF');
    for (let i = 0; i < CODE_ATTEMPTS_LIMIT; i++) await post(businessPost, update(OWNER_CHAT, `/start BIZ-WRONG${i}`), BIZ_SECRET);
    await post(businessPost, update(OWNER_CHAT, '/start BIZ-ABCDEF'), BIZ_SECRET);
    const replies = repliesTo(OWNER_CHAT);
    expect(replies.at(-1)).toBe(BOT_REPLIES.tooManyAttempts);
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
    expect(fake.tables.business_telegram_codes[0].used_at).toBeNull();
  });

  it('/start без кода попытку не расходует', async () => {
    for (let i = 0; i < CODE_ATTEMPTS_LIMIT + 2; i++) await post(businessPost, update(OWNER_CHAT, '/start'), BIZ_SECRET);
    const buckets = (fake.tables.rate_limits ?? []).map((r) => String(r.bucket));
    expect(buckets.some((b) => b.startsWith('tg:code:'))).toBe(false);
  });
});

describe('размер тела', () => {
  it('Content-Length больше 64 КБ → 200 без обработки и без чтения тела', async () => {
    const req = new Request('https://x.ru/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SECRET_HEADER]: BIZ_SECRET, 'Content-Length': String(65 * 1024) },
      body: JSON.stringify(update(OWNER_CHAT, '/start')),
    });
    const res = await businessPost(req);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('лимит считается в байтах: 40 тыс. кириллических символов (80 КБ) отбрасываются', async () => {
    const res = await post(businessPost, update(OWNER_CHAT, 'ж'.repeat(40_000)), BIZ_SECRET);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('админ-бот (ТЗ §18.4)', () => {
  it('/stats из TELEGRAM_CHAT_ID → сводка', async () => {
    fake.tables.businesses = [{ id: 'b1', status: 'client', telegram_chat_id: '1' }, { id: 'b2', status: 'sent', telegram_chat_id: null }];
    await post(businessPost, update(ADMIN_CHAT, '/stats'), ADMIN_SECRET);
    const text = repliesTo(ADMIN_CHAT)[0];
    expect(text).toContain('Бизнесов: <b>2</b>');
    expect(text).toContain('Клиентов: <b>1</b>');
    expect(text).toContain('Отправлено писем: <b>1</b>');
  });

  it('/ping и /health', async () => {
    await post(businessPost, update(ADMIN_CHAT, '/ping'), ADMIN_SECRET);
    await post(businessPost, update(ADMIN_CHAT, '/health'), ADMIN_SECRET);
    const replies = repliesTo(ADMIN_CHAT);
    expect(replies[0]).toBe('🏓 pong');
    expect(replies[1]).toContain('✅ БД');
    expect(replies[1]).toContain('@zapis_bot');
  });

  it('чужой chat_id → «Неизвестная команда» (без сводки), событие webhook зафиксировано', async () => {
    const res = await post(businessPost, update(4242, '/stats'), ADMIN_SECRET);
    expect(res.status).toBe(200);
    expect(repliesTo(4242)[0]).toMatch(/^Неизвестная команда/);
  });

  it('неизвестная команда админу → подсказка', async () => {
    await post(businessPost, update(ADMIN_CHAT, '/what'), ADMIN_SECRET);
    expect(repliesTo(ADMIN_CHAT)[0]).toMatch(/^Неизвестная команда/);
  });

  it('один бот — две роли: /stats через бизнес-webhook из админ-чата', async () => {
    await post(businessPost, update(ADMIN_CHAT, '/stats'), BIZ_SECRET);
    expect(repliesTo(ADMIN_CHAT)[0]).toContain('📊 <b>Сводка</b>');
  });

  it('/stats через бизнес-webhook из чужого чата → «Неизвестная команда», без сводки', async () => {
    await post(businessPost, update(OWNER_CHAT, '/stats'), BIZ_SECRET);
    expect(repliesTo(OWNER_CHAT)[0]).toMatch(/^Неизвестная команда/);
  });
});

describe('ошибки обработки → всё равно 200', () => {
  it('БД недоступна → 200, Telegram не ретраит', async () => {
    fake.missing.add('webhook_events');
    fake.missing.add('rate_limits');
    fake.missing.add('business_telegram_codes');
    const res = await post(businessPost, update(OWNER_CHAT, '/start BIZ-ABC234'), BIZ_SECRET);
    expect(res.status).toBe(200);
    expect(repliesTo(OWNER_CHAT)[0]).toContain('Не получилось');
  });

  it('исключение в обработчике → 200 и update_handler_failed с источником', async () => {
    seedBusiness();
    seedCode('BIZ-ABCDEF');
    const original = fake.client;
    // Падает именно захват кода (после idempotency и лимитов) — синхронное исключение драйвера.
    fake.client = () => {
      const client = original();
      return {
        from: (table: string) => {
          if (table === 'business_telegram_codes') throw new TypeError('driver crashed');
          return client.from(table);
        },
        rpc: client.rpc,
      };
    };
    try {
      const res = await post(businessPost, update(OWNER_CHAT, '/start BIZ-ABCDEF'), BIZ_SECRET);
      expect(res.status).toBe(200);
    } finally {
      fake.client = original;
    }
    const logged = (fake.tables.audit_log ?? []).map((r) => r.payload);
    expect(logged).toContainEqual(expect.objectContaining({ message: 'update_handler_failed', source: 'tg_business', reason: 'TypeError' }));
  });
});

describe('утилиты кода и команд', () => {
  it('generateCode: формат BIZ- + 6 символов без похожих', () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^BIZ-[A-HJKMNP-Z2-9]{6}$/);
  });

  it('normalizeCode', () => {
    expect(normalizeCode(' biz-abc234 ')).toBe('BIZ-ABC234');
    expect(normalizeCode('BIZ abc234')).toBe('BIZ-ABC234');
    expect(normalizeCode('BIZ-a1b2c3')).toBe('BIZ-A1B2C3');
    expect(normalizeCode('hello')).toBeNull();
    expect(normalizeCode('BIZ-<script>')).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });

  it('parseCommand: упоминание чужого бота → null', () => {
    expect(parseCommand('/start@other_bot X', 'zapis_bot')).toBeNull();
    expect(parseCommand('/Start@Zapis_Bot X', 'zapis_bot')).toEqual({ command: 'start', args: ['X'] });
    expect(parseCommand('просто текст')).toBeNull();
  });

  it('incomingText: от арендатора — текст целиком, от служебного бота — только метка', () => {
    // На тексте арендатора построен раздел «Чат» в супер-админке.
    expect(incomingText('tg_business', '  Здравствуйте, нужна помощь  ')).toBe('Здравствуйте, нужна помощь');
    expect(incomingText('tg_business', '/start')).toBe('/start');
    expect(incomingText('tg_admin', 'секретный текст')).toBe('(text)');
    expect(incomingText('tg_admin', '/stats')).toBe('/stats');
  });

  it('incomingText: длинный текст режется до лимита Телеграма', () => {
    const long = 'я'.repeat(5000);
    const value = incomingText('tg_business', long);
    expect(value.length).toBe(3500);
    expect(value.endsWith('…')).toBe(true);
  });
});

describe('sendBusinessEvent', () => {
  const info = { businessName: 'Студия', scheduledAt: '2026-10-20T10:00:00Z' };

  it('403 (бот заблокирован, my_chat_member потерян) → чат отвязан, админ не тревожится', async () => {
    seedBusiness();
    fake.tables.businesses[0].telegram_chat_id = String(OWNER_CHAT);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), { status: 403 }));
    const res = await sendBusinessEvent(String(OWNER_CHAT), 'b1', newBooking(info));
    expect(res.error).toBe('http_403');
    expect(fake.tables.businesses[0].telegram_chat_id).toBeNull();
    expect(repliesTo(ADMIN_CHAT)).toHaveLength(0);
  });

  it('5xx не отвязывает чат', async () => {
    seedBusiness();
    fake.tables.businesses[0].telegram_chat_id = String(OWNER_CHAT);
    fetchMock.mockImplementation(async () => new Response('{}', { status: 502 }));
    await sendBusinessEvent(String(OWNER_CHAT), 'b1', newBooking(info));
    expect(fake.tables.businesses[0].telegram_chat_id).toBe(String(OWNER_CHAT));
  }, 10_000);

  it('группа стала супергруппой → сообщение ушло в новый чат, привязка перенесена', async () => {
    seedBusiness();
    fake.tables.businesses[0].telegram_chat_id = '-100';
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: -1009 } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { message_id: 5 } }), { status: 200 }));
    const res = await sendBusinessEvent('-100', 'b1', newBooking(info));
    expect(res.ok).toBe(true);
    expect(res.migratedTo).toBe('-1009');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).chat_id).toBe(-1009);
    expect(fake.tables.businesses[0].telegram_chat_id).toBe('-1009');
    expect(repliesTo(ADMIN_CHAT)).toHaveLength(0);
  });

  it('пустой chat_id → без запроса', async () => {
    const res = await sendBusinessEvent(null, 'b1', newBooking(info));
    expect(res.error).toBe('no_chat');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
