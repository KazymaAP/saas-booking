// lib/site.test.ts — SITE_URL, нормализация хоста, MAIN_HOSTS, isMainHost.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE_URL, isMainHost, mainHostsFor, normalizeHost, normalizeSiteUrl } from './site';

describe('normalizeSiteUrl', () => {
  it('убирает путь и завершающий слэш', () => {
    expect(normalizeSiteUrl('https://example.ru/')).toBe('https://example.ru');
    expect(normalizeSiteUrl('https://example.ru/some/path?x=1')).toBe('https://example.ru');
  });

  it('сохраняет порт для локальной разработки', () => {
    expect(normalizeSiteUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('пустое, мусорное или не-http значение → дефолт', () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('   ')).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('not a url')).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('ftp://example.ru')).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('javascript:alert(1)')).toBe(DEFAULT_SITE_URL);
  });
});

describe('normalizeHost', () => {
  it('нижний регистр, без порта и завершающей точки', () => {
    expect(normalizeHost('Example.RU:443')).toBe('example.ru');
    expect(normalizeHost('example.ru.')).toBe('example.ru');
    expect(normalizeHost('  sub.example.ru  ')).toBe('sub.example.ru');
  });

  it('punycode-домены допустимы', () => {
    expect(normalizeHost('xn--80aswg.xn--p1ai')).toBe('xn--80aswg.xn--p1ai');
  });

  it('некорректный хост → пустая строка', () => {
    expect(normalizeHost(null)).toBe('');
    expect(normalizeHost(undefined)).toBe('');
    expect(normalizeHost('')).toBe('');
    expect(normalizeHost('evil.com/path')).toBe('');
    expect(normalizeHost('a b.ru')).toBe('');
    expect(normalizeHost('-bad.ru')).toBe('');
    expect(normalizeHost('[::1]:3000')).toBe('');
    expect(normalizeHost(`${'a'.repeat(64)}.ru`)).toBe('');
  });
});

describe('mainHostsFor', () => {
  it('apex, www и хосты разработки', () => {
    expect(mainHostsFor('https://example.ru')).toEqual(['example.ru', 'www.example.ru', 'localhost', '127.0.0.1']);
  });

  it('www в SITE_URL не дублируется', () => {
    expect(mainHostsFor('https://www.example.ru')).toEqual(['example.ru', 'www.example.ru', 'localhost', '127.0.0.1']);
  });
});

describe('isMainHost', () => {
  const hosts = mainHostsFor('https://example.ru');

  it('основной домен в любом регистре и с портом', () => {
    expect(isMainHost('example.ru', hosts)).toBe(true);
    expect(isMainHost('WWW.Example.ru:443', hosts)).toBe(true);
    expect(isMainHost('localhost:3000', hosts)).toBe(true);
    expect(isMainHost('127.0.0.1:3000', hosts)).toBe(true);
  });

  it('превью Vercel — основной сайт', () => {
    expect(isMainHost('saas-booking-git-main-team.vercel.app', hosts)).toBe(true);
  });

  it('кастомный домен клиента — не основной', () => {
    expect(isMainHost('client.ru', hosts)).toBe(false);
    expect(isMainHost('example.ru.client.ru', hosts)).toBe(false);
    expect(isMainHost('vercel.app.client.ru', hosts)).toBe(false);
  });

  it('пустой или мусорный хост считается основным (не уходит в резолв доменов)', () => {
    expect(isMainHost('', hosts)).toBe(true);
    expect(isMainHost(null, hosts)).toBe(true);
    expect(isMainHost('bad host', hosts)).toBe(true);
  });
});

describe('SITE_URL / MAIN_HOSTS из env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('берутся из NEXT_PUBLIC_SITE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://servis-jade.ru/');
    vi.resetModules();
    const site = await import('./site');
    expect(site.SITE_URL).toBe('https://servis-jade.ru');
    expect(site.SITE_HOST).toBe('servis-jade.ru');
    expect(site.MAIN_HOSTS).toContain('www.servis-jade.ru');
    expect(site.isMainHost('servis-jade.ru')).toBe(true);
    expect(site.isMainHost('zapishisya.ru')).toBe(false);
  });

  it('без env — дефолтный домен', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.resetModules();
    const site = await import('./site');
    expect(site.SITE_URL).toBe(DEFAULT_SITE_URL);
  });
});
