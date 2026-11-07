// lib/legal.test.ts — модульные тесты юридического слоя (Vitest). БД замокана: проверяется только чистая логика
// и обращения к supabase-клиенту.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data: unknown; error: { message: string } | null };

// Мини-мок цепочки supabase: from().select().eq().maybeSingle() / upsert().select() / in().
const state: { result: QueryResult; calls: string[]; throw_on_from: boolean } = {
  result: { data: null, error: null },
  calls: [],
  throw_on_from: false,
};

function chain(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  const passthrough = (name: string) => (...args: unknown[]) => {
    state.calls.push(`${name}:${JSON.stringify(args)}`);
    return self;
  };
  for (const name of ['select', 'eq', 'in', 'upsert', 'insert']) self[name] = passthrough(name);
  self.maybeSingle = async () => state.result;
  self.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(state.result).then(resolve);
  return self;
}

vi.mock('./supabase', () => ({
  adminClient: () => ({
    from: (table: string) => {
      if (state.throw_on_from) throw new Error('db down');
      state.calls.push(`from:${table}`);
      return chain();
    },
  }),
}));

vi.mock('./site', () => ({ SITE_URL: 'https://servis-jade.ru' }));

const SECRET = 'a'.repeat(64);

beforeEach(() => {
  state.result = { data: null, error: null };
  state.calls = [];
  state.throw_on_from = false;
  process.env.UNSUBSCRIBE_SECRET = SECRET;
  process.env.HASH_SALT = 'salt';
});

const legal = await import('./legal');

describe('версии документов', () => {
  it('PRIVACY_VERSION в формате YYYY-MM-DD и является реальной датой', () => {
    expect(legal.PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(`${legal.PRIVACY_VERSION}T00:00:00Z`).getTime())).toBe(false);
  });

  it('все документы имеют версию, дату и внутренний путь', () => {
    for (const doc of Object.values(legal.LEGAL_DOCS)) {
      expect(doc.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.path.startsWith('/')).toBe(true);
    }
    expect(legal.LEGAL_DOCS.dpa.path).toBe('/dogovor-porucheniya');
  });

  it('cookie-согласие использует версию политики', () => {
    expect(legal.COOKIE_POLICY_VERSION).toBe(legal.PRIVACY_VERSION);
  });

  it('formatLegalDate форматирует по-русски и не падает на мусоре', () => {
    expect(legal.formatLegalDate('2026-10-15')).toBe('15 октября 2026 г.');
    expect(legal.formatLegalDate('2026-01-01')).toBe('1 января 2026 г.');
    expect(legal.formatLegalDate('2026-13-01')).toBe('2026-13-01');
    expect(legal.formatLegalDate('вчера')).toBe('вчера');
  });
});

describe('parseRequisites', () => {
  it('пустые настройки → плейсхолдеры и env-фолбэк email/адреса', () => {
    const { requisites, texts } = legal.parseRequisites(null, { email: 'legal@servis-jade.ru', address: 'г. Москва' });
    expect(requisites.fio).toBeNull();
    expect(requisites.email).toBe('legal@servis-jade.ru');
    expect(requisites.address).toBe('г. Москва');
    expect(requisites.is_complete).toBe(false);
    expect(texts).toEqual({ oferta: null, privacy: null, dpa: null });
  });

  it('заполненные реквизиты имеют приоритет над env', () => {
    const { requisites } = legal.parseRequisites(
      { fio: ' Иванов Иван Иванович ', inn: '123456789012', email: 'me@ya.ru', city: 'Казань', policy: 'Доп. условия' },
      { email: 'env@x.ru', address: '' },
    );
    expect(requisites.fio).toBe('Иванов Иван Иванович');
    expect(requisites.email).toBe('me@ya.ru');
    expect(requisites.address).toBeNull();
    expect(requisites.is_complete).toBe(true);
  });

  it('некорректный ИНН → реквизиты неполные', () => {
    const { requisites } = legal.parseRequisites({ fio: 'Иванов', inn: '12ab', email: 'me@ya.ru' }, { email: '', address: '' });
    expect(requisites.is_complete).toBe(false);
    expect(legal.isValidInn('1234567890')).toBe(true);
    expect(legal.isValidInn('123')).toBe(false);
    expect(legal.isValidInn(null)).toBe(false);
  });

  it('мусорный jsonb не роняет разбор', () => {
    const { requisites } = legal.parseRequisites({ fio: 42, inn: ['x'], email: null }, { email: '', address: '' });
    expect(requisites.fio).toBeNull();
    expect(requisites.inn).toBeNull();
    expect(requisites.email).toBeNull();
  });

  it('тексты из настроек: policy → privacy', () => {
    const { texts } = legal.parseRequisites({ oferta: 'O', policy: 'P', dpa: '  ' }, { email: '', address: '' });
    expect(texts).toEqual({ oferta: 'O', privacy: 'P', dpa: null });
  });
});

describe('formatRequisites и operatorName', () => {
  it('отсутствующие поля помечены missing и показаны плейсхолдером', () => {
    const { requisites } = legal.parseRequisites({ fio: 'Иванов И. И.' }, { email: '', address: '' });
    const lines = legal.formatRequisites(requisites);
    const inn = lines.find((l) => l.label === 'ИНН');
    expect(inn).toEqual({ label: 'ИНН', value: legal.PLACEHOLDER, missing: true });
    expect(lines.find((l) => l.label === 'ФИО')?.missing).toBe(false);
  });

  it('карта и банк никогда не публикуются', () => {
    const { requisites } = legal.parseRequisites({ fio: 'И', card: '2200 0000 0000 0000', bank: 'Т-Банк' }, { email: '', address: '' });
    const joined = JSON.stringify(legal.formatRequisites(requisites));
    expect(joined).not.toContain('2200');
    expect(joined).not.toContain('Т-Банк');
  });

  it('operatorName с ИНН и без ФИО', () => {
    expect(legal.operatorName(legal.parseRequisites({ fio: 'Иванов', inn: '123456789012' }, { email: '', address: '' }).requisites)).toBe('Иванов (ИНН 123456789012)');
    expect(legal.operatorName(legal.parseRequisites({}, { email: '', address: '' }).requisites)).toContain(legal.PLACEHOLDER);
  });
});

describe('getRequisites / getLegalText (БД)', () => {
  it('читает settings.platform_requisites', async () => {
    state.result = { data: { value: { fio: 'Петров', inn: '123456789012', email: 'p@ya.ru', oferta: 'Текст' } }, error: null };
    const req = await legal.getRequisites();
    expect(req.fio).toBe('Петров');
    expect(state.calls).toContain('from:settings');
    expect(await legal.getLegalText('oferta')).toBe('Текст');
  });

  it('ошибка БД → плейсхолдеры, без исключения', async () => {
    state.throw_on_from = true;
    const req = await legal.getRequisites();
    expect(req.fio).toBeNull();
  });

  it('ошибка запроса → плейсхолдеры', async () => {
    state.result = { data: null, error: { message: 'permission denied' } };
    expect((await legal.getRequisites()).inn).toBeNull();
  });
});

describe('цены оферты', () => {
  it('берёт цены из settings', () => {
    const p = legal.parsePricing({ basic: { name: 'Б', price: 1200 }, pro: { name: 'П', price: '3000' } }, { initial: 6000, monthly: 1200 });
    expect(p).toMatchObject({ setup: 6000, basic: 1200, basic_name: 'Б', pro: 3000, pro_name: 'П' });
  });

  it('мусор → цены из ТЗ', () => {
    expect(legal.parsePricing(null, { initial: -1 })).toEqual(legal.DEFAULT_PRICING);
  });

  it('formatRub', () => {
    expect(legal.formatRub(5000).replace(/\s/g, ' ')).toBe('5 000 ₽');
  });
});

describe('IP, хэш, Origin, email', () => {
  it('getClientIp: приоритет Cloudflare → X-Real-IP → X-Forwarded-For', () => {
    expect(legal.getClientIp(new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(legal.getClientIp(new Headers({ 'x-real-ip': '3.3.3.3', 'x-forwarded-for': '2.2.2.2' }))).toBe('3.3.3.3');
    expect(legal.getClientIp(new Headers({ 'x-forwarded-for': ' 2.2.2.2 , 9.9.9.9' }))).toBe('2.2.2.2');
    expect(legal.getClientIp(new Headers())).toBe('unknown');
  });

  it('hashIdentifier: детерминирован, зависит от соли, без соли — null', () => {
    const a = legal.hashIdentifier('1.1.1.1', 's1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(legal.hashIdentifier('1.1.1.1', 's1')).toBe(a);
    expect(legal.hashIdentifier('1.1.1.1', 's2')).not.toBe(a);
    expect(legal.hashIdentifier('1.1.1.1', '')).toBeNull();
  });

  it('isTrustedOrigin: свой хост и SITE_URL — да, чужой и пустой — нет', () => {
    expect(legal.isTrustedOrigin('https://servis-jade.ru', 'servis-jade.ru')).toBe(true);
    expect(legal.isTrustedOrigin('https://client-domain.ru', 'client-domain.ru')).toBe(true);
    expect(legal.isTrustedOrigin('https://servis-jade.ru', 'client-domain.ru')).toBe(true);
    expect(legal.isTrustedOrigin('https://evil.example', 'servis-jade.ru')).toBe(false);
    expect(legal.isTrustedOrigin(null, 'servis-jade.ru')).toBe(false);
    expect(legal.isTrustedOrigin('not a url', 'servis-jade.ru')).toBe(false);
  });

  it('normalizeEmail и maskEmail', () => {
    expect(legal.normalizeEmail('  Ivan@Example.RU ')).toBe('ivan@example.ru');
    expect(legal.normalizeEmail('нет')).toBeNull();
    expect(legal.maskEmail('ivan@example.ru')).toBe('iv***@example.ru');
    expect(legal.maskEmail('broken')).toBe('***');
  });
});

describe('токены отписки', () => {
  it('создаётся и разбирается обратно', () => {
    const token = legal.createUnsubscribeToken('Owner@Salon.ru');
    expect(token).toMatch(/^u1\.[A-Za-z0-9_-]+$/);
    expect(legal.parseUnsubscribeToken(token ?? '')).toBe('owner@salon.ru');
  });

  it('email не читается из токена напрямую', () => {
    const token = legal.createUnsubscribeToken('owner@salon.ru') ?? '';
    expect(Buffer.from(token.slice(3), 'base64url').toString('utf8')).not.toContain('owner@salon.ru');
  });

  it('подделка, чужой ключ, мусор → null', () => {
    const token = legal.createUnsubscribeToken('owner@salon.ru') ?? '';
    const tampered = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(legal.parseUnsubscribeToken(tampered)).toBeNull();
    expect(legal.parseUnsubscribeToken(token, 'b'.repeat(64))).toBeNull();
    expect(legal.parseUnsubscribeToken('u1.')).toBeNull();
    expect(legal.parseUnsubscribeToken('u2.abc')).toBeNull();
    expect(legal.parseUnsubscribeToken('x'.repeat(600))).toBeNull();
    expect(legal.parseUnsubscribeToken(`${token}.extra`)).toBeNull();
  });

  it('без секрета токен не выпускается', () => {
    expect(legal.createUnsubscribeToken('a@b.ru', '')).toBeNull();
  });

  it('unsubscribeRowToken — стабильный uuid v4-формата', () => {
    const a = legal.unsubscribeRowToken('A@b.ru');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(legal.unsubscribeRowToken('a@b.ru')).toBe(a);
    expect(legal.unsubscribeRowToken('c@b.ru')).not.toBe(a);
  });

  it('заголовки List-Unsubscribe по RFC 8058', () => {
    const headers = legal.buildListUnsubscribeHeaders('owner@salon.ru');
    expect(headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/servis-jade\.ru\/api\/unsubscribe\/u1\.[A-Za-z0-9_-]+>$/);
    expect(headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(legal.buildUnsubscribeUrl('owner@salon.ru')).toMatch(/^https:\/\/servis-jade\.ru\/unsubscribe\/u1\./);
  });
});

describe('unsubscribeEmail / isUnsubscribed', () => {
  it('первая отписка: upsert с ignoreDuplicates', async () => {
    state.result = { data: [{ id: 'x' }], error: null };
    expect(await legal.unsubscribeEmail('owner@salon.ru', 'one_click')).toEqual({ ok: true, already: false });
    expect(state.calls.some((c) => c.startsWith('upsert:') && c.includes('"ignoreDuplicates":true'))).toBe(true);
  });

  it('повторная отписка идемпотентна', async () => {
    state.result = { data: [], error: null };
    expect(await legal.unsubscribeEmail('owner@salon.ru', 'page')).toEqual({ ok: true, already: true });
  });

  it('ошибка БД → server', async () => {
    state.result = { data: null, error: { message: 'down' } };
    expect(await legal.unsubscribeEmail('owner@salon.ru', 'page')).toEqual({ ok: false, reason: 'server' });
  });

  it('isUnsubscribed: найден / не найден / ошибка → безопасно true', async () => {
    state.result = { data: { id: 'x' }, error: null };
    expect(await legal.isUnsubscribed('owner@salon.ru')).toBe(true);
    state.result = { data: null, error: null };
    expect(await legal.isUnsubscribed('owner@salon.ru')).toBe(false);
    state.result = { data: null, error: { message: 'down' } };
    expect(await legal.isUnsubscribed('owner@salon.ru')).toBe(true);
    expect(await legal.isUnsubscribed('мусор')).toBe(true);
  });
});

describe('cookie-согласие: localStorage', () => {
  it('parseStoredConsent: валидное значение разбирается', async () => {
    const { parseStoredConsent } = await import('./legal-versions');
    const value = { version: '2026-10-15', analytics: true, decided_at: '2026-10-15T10:00:00Z' };
    expect(parseStoredConsent(JSON.stringify(value))).toEqual(value);
  });

  it('parseStoredConsent: мусор, null, неполный объект, лишние типы → null', async () => {
    const { parseStoredConsent } = await import('./legal-versions');
    for (const raw of [null, '', '{oops', 'null', '42', '"str"', '[]', '{"version":"x"}', '{"version":1,"analytics":true,"decided_at":"x"}', '{"version":"x","analytics":"yes","decided_at":"x"}']) {
      expect(parseStoredConsent(raw), String(raw)).toBeNull();
    }
  });

  it('parseStoredConsent: лишние поля отбрасываются', async () => {
    const { parseStoredConsent } = await import('./legal-versions');
    const parsed = parseStoredConsent('{"version":"v","analytics":false,"decided_at":"d","evil":"<script>"}');
    expect(parsed).toEqual({ version: 'v', analytics: false, decided_at: 'd' });
  });

  it('needsConsent: нет выбора или старая редакция → спросить снова', async () => {
    const { needsConsent, COOKIE_POLICY_VERSION } = await import('./legal-versions');
    expect(needsConsent(null)).toBe(true);
    expect(needsConsent({ version: '2000-01-01', analytics: true, decided_at: 'x' })).toBe(true);
    expect(needsConsent({ version: COOKIE_POLICY_VERSION, analytics: false, decided_at: 'x' })).toBe(false);
  });
});

describe('форма запроса субъекта ПД', () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it('валидный запрос на удаление без текста принимается, email нормализуется', async () => {
    const { parseDataRequestForm } = await import('./data-request');
    const result = parseDataRequestForm(form({ email: '  Ivan@Example.RU ', type: 'delete', request_text: '', business: '' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.email).toBe('ivan@example.ru');
      expect(result.honeypot).toBe(false);
    }
  });

  it('доступ и исправление требуют описания', async () => {
    const { parseDataRequestForm } = await import('./data-request');
    for (const type of ['access', 'correct']) {
      const result = parseDataRequestForm(form({ email: 'a@b.ru', type, request_text: '', business: '' }));
      expect(result.ok, type).toBe(false);
      if (!result.ok) expect(result.fields.request_text).toBeTruthy();
    }
  });

  it('неизвестный тип и плохой email → ошибки по полям', async () => {
    const { parseDataRequestForm } = await import('./data-request');
    const result = parseDataRequestForm(form({ email: 'not-an-email', type: 'drop_table', request_text: '', business: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fields.email).toBeTruthy();
      expect(result.fields.type).toBeTruthy();
    }
  });

  it('управляющие символы вырезаются, длина ограничена', async () => {
    const { parseDataRequestForm, DATA_REQUEST_TEXT_MAX } = await import('./data-request');
    const clean = parseDataRequestForm(form({ email: 'a@b.ru', type: 'access', request_text: 'Где\u0000 мои\u0007 данные?', business: '' }));
    expect(clean.ok && clean.data.request_text).toBe('Где мои данные?');
    const long = parseDataRequestForm(form({ email: 'a@b.ru', type: 'access', request_text: 'я'.repeat(DATA_REQUEST_TEXT_MAX + 1), business: '' }));
    expect(long.ok).toBe(false);
  });

  it('заполненное поле-ловушка помечает бота', async () => {
    const { parseDataRequestForm } = await import('./data-request');
    const result = parseDataRequestForm(form({ email: 'a@b.ru', type: 'unsubscribe', request_text: '', business: '', website: 'http://spam' }));
    expect(result.ok && result.honeypot).toBe(true);
  });

  it('текст ответа обещает срок ФЗ-152 (10 рабочих дней)', async () => {
    const { dataRequestSuccessText } = await import('./data-request');
    expect(dataRequestSuccessText('access')).toContain('10 рабочих дней');
    expect(dataRequestSuccessText('delete')).toContain('подтвердить');
  });
});

describe('ссылки отписки в письмах', () => {
  it('buildUnsubscribeUrl ведёт на страницу, заголовок — на One-Click API, токен одинаково расшифровывается', () => {
    const url = legal.buildUnsubscribeUrl('Ivan@Example.ru', 'https://servis-jade.ru');
    expect(url).toMatch(/^https:\/\/servis-jade\.ru\/unsubscribe\/u1\./);
    const token = (url ?? '').split('/unsubscribe/')[1] ?? '';
    expect(legal.parseUnsubscribeToken(token)).toBe('ivan@example.ru');
    const headers = legal.buildListUnsubscribeHeaders('ivan@example.ru', 'https://servis-jade.ru');
    expect(headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/servis-jade\.ru\/api\/unsubscribe\/u1\.[A-Za-z0-9_-]+>$/);
  });

  it('каждый токен уникален (случайный IV), но адресат один — uuid строки одинаковый', () => {
    const a = legal.createUnsubscribeToken('x@y.ru');
    const b = legal.createUnsubscribeToken('x@y.ru');
    expect(a).not.toBe(b);
    expect(legal.unsubscribeRowToken('X@Y.ru')).toBe(legal.unsubscribeRowToken('x@y.ru'));
  });

  it('слишком длинный токен отклоняется без расшифровки', () => {
    expect(legal.parseUnsubscribeToken(`u1.${'A'.repeat(600)}`)).toBeNull();
  });
});
