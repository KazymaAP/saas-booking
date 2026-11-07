// lib/sw-rules.test.ts — правила кэширования service worker: что сохраняется, а что нет.
import { describe, expect, it } from 'vitest';
import { buildServiceWorker, swRulesSource } from './sw-source';
import { isCacheableResponse, isShellPath, isShellPathWith, RESERVED_SEGMENTS, SHELL_PATHS } from './sw-rules';

describe('isShellPath: какие пути можно кэшировать', () => {
  it('статические страницы и публичная страница бизнеса — да', () => {
    for (const p of ['/', '/oferta', '/privacy', '/dogovor-porucheniya', '/s/tire', '/tire-studio/sgx']) {
      expect(isShellPath(p), p).toBe(true);
    }
  });

  it('токенные, персональные и служебные пути — нет', () => {
    const bad = [
      '/booking/cancel/abc', '/booking/reschedule/abc', '/s/tire/booking/cancel/abc', // отмена и перенос
      '/invite/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', '/magic-link', '/reset-password', // токенные ссылки
      '/unsubscribe/tok', '/data-request', '/blocked', '/preview/x', // отписка, выгрузка, служебные
      '/panel', '/panel/funnel', '/s/tire/panel', '/s/tire/panel/bookings', // кабинеты
      '/api/bookings', '/api/cron/send-emails', '/sw.js', '/robots.txt', '/_next/static/x.js',
      '/a/b/c',
    ];
    for (const p of bad) {
      expect(isShellPath(p), p).toBe(false);
    }
  });

  it('одна неизвестная пара сегментов без зарезервированного первого — это бизнес и кэшируется', () => {
    // Осознанный компромисс: /{prefix}/{slug} неотличим от любой публичной пары. Все служебные
    // маршруты с токенами должны быть в RESERVED_SEGMENTS — проверяем это явно ниже.
    expect(isShellPath('/x/y')).toBe(true);
  });

  it('все известные токенные двухсегментные маршруты зарезервированы', () => {
    for (const first of ['invite', 'unsubscribe', 'preview', 'api', 'panel', 'booking']) {
      expect(RESERVED_SEGMENTS, first).toContain(first);
      expect(isShellPath(`/${first}/tok`), first).toBe(false);
    }
  });

  it('исходная строка проверки совпадает с константами', () => {
    expect(isShellPathWith('/oferta', SHELL_PATHS, RESERVED_SEGMENTS)).toBe(true);
    expect(isShellPathWith('/invite/tok', SHELL_PATHS, RESERVED_SEGMENTS)).toBe(false);
  });
});

describe('isCacheableResponse: какие ответы можно сохранять', () => {
  const ok = { ok: true, status: 200, redirected: false, contentType: 'text/html; charset=utf-8', setCookie: null };

  it('успешный HTML — да', () => {
    expect(isCacheableResponse(ok)).toBe(true);
  });

  it('редирект, ошибка, не-HTML, Set-Cookie — нет', () => {
    expect(isCacheableResponse({ ...ok, redirected: true })).toBe(false);
    expect(isCacheableResponse({ ...ok, status: 302 })).toBe(false);
    expect(isCacheableResponse({ ...ok, ok: false, status: 500 })).toBe(false);
    expect(isCacheableResponse({ ...ok, status: 404 })).toBe(false);
    expect(isCacheableResponse({ ...ok, contentType: 'application/json' })).toBe(false);
    expect(isCacheableResponse({ ...ok, contentType: null })).toBe(false);
    expect(isCacheableResponse({ ...ok, setCookie: 'sa_session=x; HttpOnly' })).toBe(false);
  });
});

describe('swRulesSource: вставленный в service worker код ведёт себя как оригинал', () => {
  // Выполняем ровно тот текст, который уходит в браузер, и сравниваем результаты.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const embedded = new Function(`${swRulesSource()}\nreturn { isShellPathWith, isCacheableResponse, SHELL, RESERVED };`)() as {
    isShellPathWith: (p: string, s: string[], r: string[]) => boolean;
    isCacheableResponse: (r: Parameters<typeof isCacheableResponse>[0]) => boolean;
    SHELL: string[];
    RESERVED: string[];
  };

  it('правила совпадают с оригиналом на наборе путей', () => {
    for (const p of ['/', '/oferta', '/s/tire', '/invite/tok', '/s/tire/panel', '/api/x', '/a/b/c']) {
      expect(embedded.isShellPathWith(p, embedded.SHELL, embedded.RESERVED), p).toBe(isShellPath(p));
    }
  });

  it('проверка ответа совпадает с оригиналом', () => {
    const ok = { ok: true, status: 200, redirected: false, contentType: 'text/html', setCookie: null };
    expect(embedded.isCacheableResponse(ok)).toBe(isCacheableResponse(ok));
    expect(embedded.isCacheableResponse({ ...ok, redirected: true })).toBe(isCacheableResponse({ ...ok, redirected: true }));
  });

  it('полный текст worker содержит обработчики и версию кэша', () => {
    const sw = buildServiceWorker();
    expect(sw).toContain("const CACHE = \"booking-shell-v2\"");
    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).toContain('isCacheableResponse(');
    expect(sw).not.toContain('${');
  });
});
