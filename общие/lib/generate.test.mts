// lib/generate.test.ts — генератор прототипов (Vitest). БД — in-memory, сеть — подменённый fetcher.
import { describe, expect, it } from 'vitest';
import type { Business, VerticalTemplate } from './database.types';
import { extractOgImage, fetchOgImage, resolveImageUrl, type Fetcher } from './generate-og';
import type { BusinessPatch, GenerateStore, PhotoRow, ServiceRow } from './generate-store';
import { generateMany, generatePrototype, initials, initialsLogo, previewUrl, safeColor, templateServices, type GeneratableBusiness } from './generate';
import { SsrfError, type SafeResponse } from './ssrf';

const noSleep = { sleep: async () => undefined };

class MemoryStore implements GenerateStore {
  taken = new Set<string>();
  services: ServiceRow[] = [];
  photos: PhotoRow[] = [];
  updates: Array<{ id: string; patch: BusinessPatch }> = [];
  failUpdates = 0;
  // Падения для конкретного бизнеса (параллельные задачи не должны делить один счётчик).
  failFor = new Map<string, number>();
  active = 0;
  maxActive = 0;

  async slugTaken(candidate: string) {
    return this.taken.has(candidate);
  }
  async countServices(id: string) {
    return this.services.filter((s) => s.business_id === id).length;
  }
  async insertServices(rows: readonly ServiceRow[]) {
    this.services.push(...rows);
  }
  async countPhotos(id: string) {
    return this.photos.filter((p) => p.business_id === id).length;
  }
  async insertPhoto(row: PhotoRow) {
    this.photos.push(row);
  }
  async updateBusiness(id: string, patch: BusinessPatch) {
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    await new Promise((r) => setTimeout(r, 5));
    this.active--;
    const own = this.failFor.get(id) ?? 0;
    if (patch.generation_status === 'done' && (own > 0 || this.failUpdates > 0)) {
      if (own > 0) this.failFor.set(id, own - 1);
      else this.failUpdates--;
      throw new Error('db timeout');
    }
    this.updates.push({ id, patch });
  }
  last(id: string): BusinessPatch | undefined {
    return [...this.updates].reverse().find((u) => u.id === id)?.patch;
  }
}

const template: VerticalTemplate = {
  id: 'tpl', name: 'Шиномонтаж', slug: 'tire-service', icon: null, url_prefix: 't', description: null, fields: [],
  default_services: [{ name: 'R13-15', price: 1500, duration: 60 }, { name: 'Балансировка', price: 300, duration: 30 }],
  default_texts: {}, default_colors: { primary: '#ff6600' }, blocks: {}, show_demo_mode: true, is_active: true, created_at: '',
};

function business(over: Partial<GeneratableBusiness> = {}): GeneratableBusiness {
  const base = {
    id: 'b1', slug: '', slug_history: [], name: 'Шина Плюс', brand_color: '', websites: [], logo_url: null, favicon_url: null,
    preview_token: null, generation_attempts: 0,
  };
  // В тестах нужны только поля, которые читает генератор; остальные колонки Business не участвуют.
  return { ...base, ...over } as GeneratableBusiness & Business;
}

const html = (body: string): SafeResponse => ({ url: 'https://shina.ru/', status: 200, contentType: 'text/html; charset=utf-8', body: Buffer.from(body) });
const image = (url: string): SafeResponse => ({ url, status: 200, contentType: 'image/jpeg', body: Buffer.from([0xff, 0xd8, 0xff]) });

function siteFetcher(pages: Record<string, SafeResponse | Error>): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const res = pages[url];
    if (!res) throw new SsrfError('network', `нет ${url}`);
    if (res instanceof Error) throw res;
    return res;
  };
  return Object.assign(fn, { calls });
}

const OG_PAGE = '<html><head><meta content="/img/logo.jpg" property="og:image"></head></html>';

describe('extractOgImage', () => {
  it('любой порядок атрибутов, name= и сущности', () => {
    expect(extractOgImage('<meta property="og:image" content="https://a.ru/1.png">')).toBe('https://a.ru/1.png');
    expect(extractOgImage("<meta content='/2.png' name='og:image'>")).toBe('/2.png');
    expect(extractOgImage('<meta property="og:image" content="/x.png?a=1&amp;b=2">')).toBe('/x.png?a=1&b=2');
  });

  it('приоритет secure_url, затем og:image, затем twitter:image', () => {
    const page = '<meta name="twitter:image" content="/t.png"><meta property="og:image" content="/o.png"><meta property="og:image:secure_url" content="/s.png">';
    expect(extractOgImage(page)).toBe('/s.png');
    expect(extractOgImage('<meta name="twitter:image" content="/t.png">')).toBe('/t.png');
    expect(extractOgImage('<title>нет</title>')).toBeNull();
  });

  it('относительный URL — от итоговой страницы; приватный — отбрасывается', () => {
    expect(resolveImageUrl('/a.jpg', 'https://shina.ru/page')).toBe('https://shina.ru/a.jpg');
    expect(resolveImageUrl('http://169.254.169.254/latest', 'https://shina.ru/')).toBeNull();
    expect(resolveImageUrl('javascript:alert(1)', 'https://shina.ru/')).toBeNull();
  });
});

describe('fetchOgImage', () => {
  it('находит og:image и проверяет, что это картинка', async () => {
    const fetcher = siteFetcher({ 'https://shina.ru/': html(OG_PAGE), 'https://shina.ru/img/logo.jpg': image('https://shina.ru/img/logo.jpg') });
    expect(await fetchOgImage('shina.ru', { fetcher })).toBe('https://shina.ru/img/logo.jpg');
  });

  it('по ссылке не картинка — null', async () => {
    const fetcher = siteFetcher({ 'https://shina.ru/': html(OG_PAGE), 'https://shina.ru/img/logo.jpg': html('<html>') });
    expect(await fetchOgImage('shina.ru', { fetcher })).toBeNull();
  });

  it('нет сайта, приватный сайт, не HTML — null без запросов к приватным адресам', async () => {
    const fetcher = siteFetcher({ 'https://shina.ru/': image('https://shina.ru/') });
    expect(await fetchOgImage(undefined, { fetcher })).toBeNull();
    expect(await fetchOgImage('http://127.0.0.1', { fetcher })).toBeNull();
    expect(await fetchOgImage('localhost', { fetcher })).toBeNull();
    expect(await fetchOgImage('shina.ru', { fetcher })).toBeNull();
    expect(fetcher.calls).toEqual(['https://shina.ru/']);
  });

  it('временная ошибка — повтор; SSRF-блок — без повтора', async () => {
    let n = 0;
    const flaky: Fetcher = async (url) => {
      n++;
      if (n === 1) throw new SsrfError('timeout', 'медленно');
      return url.endsWith('.jpg') ? image(url) : html(OG_PAGE);
    };
    expect(await fetchOgImage('shina.ru', { fetcher: flaky })).toBe('https://shina.ru/img/logo.jpg');
    const blocked = siteFetcher({ 'https://shina.ru/': new SsrfError('private_ip', 'rebinding') });
    expect(await fetchOgImage('shina.ru', { fetcher: blocked, attempts: 3 })).toBeNull();
    expect(blocked.calls).toHaveLength(1);
  });

  it('общий бюджет 5 с: после исчерпания картинку не запрашиваем', async () => {
    let clock = 0;
    const slow: Fetcher = async (url, opts) => {
      expect(opts.timeoutMs).toBeLessThanOrEqual(5000);
      expect(opts.maxBytes).toBe(2 * 1024 * 1024);
      clock += 4900;
      return html(OG_PAGE.replace('/img/logo.jpg', url.endsWith('/') ? '/img/logo.jpg' : ''));
    };
    expect(await fetchOgImage('shina.ru', { fetcher: slow, now: () => clock })).toBeNull();
    expect(clock).toBe(4900);
  });
});

describe('логотип и вспомогательные', () => {
  it('инициалы: две первые буквы, кавычки игнорируются, пустое имя — ?', () => {
    expect(initials('«Шина» плюс')).toBe('ШП');
    expect(initials('   ')).toBe('?');
    expect(initials('автосервис')).toBe('А');
  });

  it('SVG: цвет только hex, текст экранируется', () => {
    const svg = Buffer.from(initialsLogo('<b> &', 'red" onload="x').split(',')[1], 'base64').toString();
    expect(svg).toContain('fill="#111111"');
    expect(svg).not.toContain('onload');
    expect(safeColor(null, 'bad', '#ABC')).toBe('#ABC');
  });

  it('услуги из шаблона: мусор отбрасывается, порядок сохраняется', () => {
    const tpl = { ...template, default_services: [...template.default_services, { name: '', price: 1, duration: 60 }, { name: 'X', price: -5, duration: 60 }] };
    expect(templateServices('b1', tpl).map((s) => [s.name, s.sort_order, s.duration_minutes])).toEqual([['R13-15', 1, 60], ['Балансировка', 2, 30]]);
    expect(templateServices('b1', null)).toEqual([]);
  });

  it('preview_url экранирует части', () => {
    expect(previewUrl('https://z.ru/', 'shina', 'a b')).toBe('https://z.ru/preview/shina?token=a%20b');
  });
});

describe('generatePrototype', () => {
  const deps = (store: MemoryStore, fetcher: Fetcher = siteFetcher({})) => ({ store, og: { fetcher }, retry: noSleep, uuid: () => 'tok-1', siteUrl: 'https://z.ru' });

  it('slug, услуги, SVG-логотип, favicon, preview — status preview_ready / done', async () => {
    const store = new MemoryStore();
    store.taken.add('shina-plyus');
    const url = await generatePrototype(business(), template, deps(store));
    expect(url).toBe('https://z.ru/preview/shina-plyus-2?token=tok-1');
    const patch = store.last('b1');
    expect(patch).toMatchObject({ slug: 'shina-plyus-2', brand_color: '#ff6600', preview_token: 'tok-1', status: 'preview_ready', generation_status: 'done', generation_error: null, generation_attempts: 1 });
    expect(patch?.logo_url).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(patch?.favicon_url).toBe(patch?.logo_url);
    expect(store.services).toHaveLength(2);
  });

  it('og:image → логотип и фото', async () => {
    const store = new MemoryStore();
    const fetcher = siteFetcher({ 'https://shina.ru/': html(OG_PAGE), 'https://shina.ru/img/logo.jpg': image('https://shina.ru/img/logo.jpg') });
    await generatePrototype(business({ websites: ['shina.ru'] }), template, deps(store, fetcher));
    expect(store.last('b1')?.logo_url).toBe('https://shina.ru/img/logo.jpg');
    expect(store.photos).toEqual([{ business_id: 'b1', url: 'https://shina.ru/img/logo.jpg', alt: 'Шина Плюс', sort_order: 1 }]);
  });

  it('повторная генерация идемпотентна: услуги и фото не дублируются, токен сохраняется', async () => {
    const store = new MemoryStore();
    const fetcher = siteFetcher({ 'https://shina.ru/': html(OG_PAGE), 'https://shina.ru/img/logo.jpg': image('https://shina.ru/img/logo.jpg') });
    const token = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const b = business({ websites: ['shina.ru'], preview_token: token, slug: 'shina-plyus' });
    await generatePrototype(b, template, deps(store, fetcher));
    await generatePrototype(b, template, deps(store, fetcher));
    expect(store.services).toHaveLength(2);
    expect(store.photos).toHaveLength(1);
    expect(store.last('b1')?.preview_token).toBe(token);
  });

  it('свой логотип владельца не перезаписывается и сайт не запрашивается', async () => {
    const store = new MemoryStore();
    const fetcher = siteFetcher({});
    await generatePrototype(business({ logo_url: 'https://cdn/logo.png', websites: ['shina.ru'] }), template, deps(store, fetcher));
    expect(store.last('b1')?.logo_url).toBe('https://cdn/logo.png');
    expect(fetcher.calls).toEqual([]);
  });

  it('временная ошибка БД — retry, попытки считаются', async () => {
    const store = new MemoryStore();
    store.failUpdates = 2;
    await generatePrototype(business({ generation_attempts: 1 }), template, deps(store));
    expect(store.last('b1')).toMatchObject({ generation_status: 'done', generation_attempts: 4 });
  });

  it('3 неудачи — needs_retry, ошибка и SVG-заглушка', async () => {
    const store = new MemoryStore();
    store.failUpdates = 3;
    await expect(generatePrototype(business(), template, deps(store))).rejects.toThrow('db timeout');
    const patch = store.last('b1');
    expect(patch).toMatchObject({ generation_status: 'needs_retry', generation_error: 'db timeout', generation_attempts: 3 });
    expect(patch?.logo_url).toMatch(/^data:image\/svg/);
  });

  it('промежуточная неудача пишет failed + ошибку + счётчик, затем успех — done', async () => {
    const store = new MemoryStore();
    store.failUpdates = 1;
    await generatePrototype(business(), template, deps(store));
    const statuses = store.updates.filter((u) => u.id === 'b1').map((u) => [u.patch.generation_status, u.patch.generation_attempts]);
    expect(statuses).toEqual([['failed', 1], ['done', 2]]);
    expect(store.updates[0].patch.generation_error).toBe('db timeout');
  });
});

describe('generateMany', () => {
  it('не больше 5 одновременно, ошибка одного не мешает остальным', async () => {
    const store = new MemoryStore();
    store.failFor.set('b0', 3); // первый бизнес исчерпает попытки
    const items = Array.from({ length: 12 }, (_, i) => ({ business: business({ id: `b${i}`, name: `Шина ${i}` }), template }));
    const results = await generateMany(items, { store, og: { fetcher: siteFetcher({}) }, retry: noSleep, siteUrl: 'https://z.ru' });
    expect(results).toHaveLength(12);
    expect(results.filter((r) => r.ok)).toHaveLength(11);
    expect(results[0]).toEqual({ id: 'b0', ok: false, error: 'db timeout' });
    expect(store.maxActive).toBeLessThanOrEqual(5);
    expect(store.maxActive).toBeGreaterThan(1);
  });
});
