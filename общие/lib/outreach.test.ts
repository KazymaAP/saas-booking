// lib/outreach.test.ts — buildEmail, трекинг, List-Unsubscribe, защита от open redirect, queueApproved.
// Supabase заменён фейком в памяти: поддерживаются только цепочки, которые использует outreach.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const tables: Record<string, Row[]> = {};
const failInsert = new Set<string>();

// Минимальный построитель запросов: select/eq/in/limit + insert/delete.
function query(table: string) {
  const filters: Filter[] = [];
  let mode: 'select' | 'delete' = 'select';
  const api = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return api;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return api;
    },
    limit: () => api,
    delete: () => {
      mode = 'delete';
      return api;
    },
    insert: async (row: Row) => {
      if (failInsert.has(table)) return { error: { message: 'insert failed' } };
      (tables[table] ??= []).push({ ...row });
      return { error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => void) => {
      const rows = tables[table] ?? [];
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'delete') tables[table] = rows.filter((r) => !matched.includes(r));
      resolve({ data: matched, error: null });
    },
  };
  return api;
}

vi.mock('./supabase', () => ({ adminClient: () => ({ from: (t: string) => query(t) }) }));
vi.mock('./log', () => ({ logError: async () => undefined }));
vi.mock('./site', () => ({ SITE_URL: 'https://zapishisya.ru' }));

const {
  DEFAULT_TEMPLATE,
  buildEmail,
  chooseTemplate,
  decodeClickTarget,
  encodeClickTarget,
  primaryEmail,
  queueApproved,
  renderTemplate,
  safeRedirectTarget,
  trackingUrls,
  unsubscribeHeaders,
} = await import('./outreach');

const SITE = 'https://zapishisya.ru';
const TOKEN = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

const business = {
  name: 'Шиномонтаж <Колесо>',
  city: 'Казань',
  slug: 'koleso',
  preview_token: 'pt1',
  phones: ['+79990000000'],
  rating: 4.7,
  address: 'ул. Ленина, 1',
};

function approved(id: string, patch: Row = {}): Row {
  return { id, ...business, slug: id, emails: [`${id}@biz.ru`], status: 'approved', vertical_template_id: null, vertical_templates: { name: 'Шиномонтаж' }, ...patch };
}

describe('renderTemplate (прежний API)', () => {
  it('подставляет переменные, неизвестные → пусто', () => {
    expect(renderTemplate('{name} из {city}{x}', { name: 'A', city: 'B' })).toBe('A из B');
  });
});

describe('click target', () => {
  it('base64url round-trip', () => {
    const url = `${SITE}/preview/a?token=x&y=1`;
    expect(decodeClickTarget(encodeClickTarget(url))).toBe(url);
    expect(encodeClickTarget(url)).not.toMatch(/[+/=]/);
  });
  it('пустое значение → null', () => {
    expect(decodeClickTarget(null)).toBeNull();
    expect(decodeClickTarget('')).toBeNull();
  });
});

describe('safeRedirectTarget — open redirect', () => {
  it('свой домен пропускается', () => {
    expect(safeRedirectTarget(`${SITE}/preview/a?token=1`, SITE)).toBe(`${SITE}/preview/a?token=1`);
  });
  it('поддомен-ловушка и чужой домен → главная', () => {
    expect(safeRedirectTarget('https://zapishisya.ru.evil.com/x', SITE)).toBe(`${SITE}/`);
    expect(safeRedirectTarget('https://evil.com', SITE)).toBe(`${SITE}/`);
    expect(safeRedirectTarget('//evil.com/x', SITE)).toBe(`${SITE}/`);
  });
  it('javascript:, credentials, мусор → главная', () => {
    expect(safeRedirectTarget('javascript:alert(1)', SITE)).toBe(`${SITE}/`);
    expect(safeRedirectTarget('https://user:pass@zapishisya.ru/', SITE)).toBe(`${SITE}/`);
    expect(safeRedirectTarget('http://zapishisya.ru/', SITE)).toBe(`${SITE}/`);
  });
  it('относительный путь — на наш домен', () => {
    expect(safeRedirectTarget('/oferta', SITE)).toBe(`${SITE}/oferta`);
  });
});

describe('unsubscribe headers (RFC 8058)', () => {
  it('List-Unsubscribe указывает на API, есть One-Click', () => {
    const h = unsubscribeHeaders(TOKEN, SITE);
    expect(h['List-Unsubscribe']).toBe(`<${SITE}/api/unsubscribe/${TOKEN}>`);
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('buildEmail', () => {
  it('тема и текст из шаблона по умолчанию', () => {
    const e = buildEmail({ business, trackingToken: TOKEN });
    expect(e.subject).toBe('Сайт онлайн-записи для Шиномонтаж <Колесо>');
    expect(e.text).toContain(`${SITE}/preview/koleso?token=pt1`);
    expect(e.text).toContain(`Отписаться: ${SITE}/unsubscribe/${TOKEN}`);
  });

  it('HTML: имя экранировано, есть пиксель, ссылки через трекер, отписка', () => {
    const e = buildEmail({ business, trackingToken: TOKEN });
    expect(e.html).toContain('Шиномонтаж &lt;Колесо&gt;');
    expect(e.html).not.toContain('<Колесо>');
    expect(e.html).toContain(`${SITE}/api/track/open/${TOKEN}`);
    expect(e.html).toContain(`${SITE}/api/track/click/${TOKEN}?url=${encodeClickTarget(`${SITE}/preview/koleso?token=pt1`)}`);
    expect(e.html).toContain(`${SITE}/unsubscribe/${TOKEN}`);
    expect(e.html).toMatch(/<p style="/);
  });

  it('ссылка отписки не переписывается трекером', () => {
    const e = buildEmail({ business, trackingToken: TOKEN });
    expect(e.html).not.toContain(`?url=${encodeClickTarget(`${SITE}/unsubscribe/${TOKEN}`)}`);
  });

  it('предпросмотр: без пикселя и без трекинга', () => {
    const e = buildEmail({ business, trackingToken: 'preview' });
    expect(e.html).not.toContain('/api/track/open/');
    expect(e.html).not.toContain('/api/track/click/');
    expect(e.previewLink).toBe(`${SITE}/preview/koleso?token=pt1`);
  });

  it('пользовательский шаблон и ниша в нижнем регистре', () => {
    const e = buildEmail({ business, trackingToken: TOKEN, verticalName: 'Шиномонтаж', subject: '{name}: {vertical_name_lower}', body: 'Рейтинг {rating}' });
    expect(e.subject).toBe('Шиномонтаж <Колесо>: шиномонтаж');
    expect(e.text.startsWith('Рейтинг 4.7')).toBe(true);
  });

  it('заголовки отписки возвращаются вместе с письмом', () => {
    expect(buildEmail({ business, trackingToken: TOKEN }).headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('URL трекинга строится из токена', () => {
    expect(trackingUrls(TOKEN, SITE).pixel).toBe(`${SITE}/api/track/open/${TOKEN}`);
  });
});

describe('chooseTemplate', () => {
  const t = (id: string, type: string | null, vertical: string | null) => ({ id, type, vertical_template_id: vertical, subject: id, body_text: id, body_html: null });
  const list = [t('u', 'outreach_universal', null), t('tire', 'outreach_tire', 'v-tire')];
  it('явный → ниша → универсальный → null', () => {
    expect(chooseTemplate(list, 'v-tire', 'u')?.id).toBe('u');
    expect(chooseTemplate(list, 'v-tire')?.id).toBe('tire');
    expect(chooseTemplate(list, 'v-other')?.id).toBe('u');
    expect(chooseTemplate([], null)).toBeNull();
  });
});

describe('primaryEmail', () => {
  it('первый непустой адрес в нижнем регистре', () => {
    expect(primaryEmail(['', ' Info@Biz.RU '])).toBe('info@biz.ru');
    expect(primaryEmail(null)).toBeNull();
  });
});

describe('queueApproved', () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    failInsert.clear();
  });

  it('ставит письма в email_queue и outreach_log с общим токеном', async () => {
    tables.businesses = [approved('a'), approved('b')];
    expect(await queueApproved()).toBe(2);
    expect(tables.email_queue).toHaveLength(2);
    const q = tables.email_queue[0];
    expect(q.status).toBe('pending');
    expect(q.to_email).toBe('a@biz.ru');
    expect(String(q.body_html)).toContain(String(q.tracking_token));
    expect(tables.outreach_log[0].tracking_token).toBe(q.tracking_token);
  });

  it('идемпотентно: повторный вызов ничего не добавляет', async () => {
    tables.businesses = [approved('a')];
    await queueApproved();
    expect(await queueApproved()).toBe(0);
    expect(tables.email_queue).toHaveLength(1);
  });

  it('пропускает отписавшихся и бизнесы без email', async () => {
    tables.businesses = [approved('a'), approved('b', { emails: [] })];
    tables.unsubscribes = [{ email: 'a@biz.ru' }];
    expect(await queueApproved()).toBe(0);
  });

  it('пропускает адреса с прошлым hard bounce (раунд 3)', async () => {
    tables.businesses = [approved('a'), approved('b')];
    tables.email_bounces = [{ bounced_email: 'a@biz.ru', bounce_type: 'hard' }, { bounced_email: 'b@biz.ru', bounce_type: 'soft' }];
    expect(await queueApproved()).toBe(1);
    expect(tables.email_queue.map((r) => r.to_email)).toEqual(['b@biz.ru']);
  });

  it('шаблон ниши из templates', async () => {
    tables.businesses = [approved('a', { vertical_template_id: 'v1' })];
    tables.templates = [{ id: 't1', channel: 'outreach', active: true, type: 'outreach_tire', vertical_template_id: 'v1', subject: 'Ниша {name}', body_text: 'x', body_html: null }];
    await queueApproved();
    expect(String(tables.email_queue[0].subject)).toContain('Ниша');
    expect(tables.email_queue[0].template_id).toBe('t1');
  });

  it('ошибка вставки в очередь откатывает журнал', async () => {
    tables.businesses = [approved('a')];
    failInsert.add('email_queue');
    expect(await queueApproved()).toBe(0);
    expect(tables.outreach_log ?? []).toHaveLength(0);
  });

  it('встроенный шаблон, если в БД нет шаблонов', async () => {
    tables.businesses = [approved('a')];
    await queueApproved();
    expect(tables.email_queue[0].subject).toBe(DEFAULT_TEMPLATE.subject.replace('{name}', business.name));
  });
});
