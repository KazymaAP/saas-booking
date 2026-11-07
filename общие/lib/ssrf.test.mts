// lib/ssrf.test.ts — защита от SSRF (Vitest). Сеть не нужна: DNS и транспорт подменяются.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SSRF_MAX_BYTES,
  SsrfError,
  defaultTransport,
  expandIpv6,
  isPrivateIp,
  parseSafeUrl,
  readLimited,
  safeFetch,
  validateUrl,
  type Resolver,
  type Transport,
} from './ssrf';

const PUBLIC_IP = '93.184.216.34';
const publicDns: Resolver = async () => [{ address: PUBLIC_IP, family: 4 }];

async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof SsrfError ? e.reason : 'other';
  }
}

function syncReason(fn: () => unknown): string {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e instanceof SsrfError ? e.reason : 'other';
  }
}

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '198.18.0.1',
  ])('IPv4 %s — приватный', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1', '77.88.8.8'])('IPv4 %s — публичный', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it.each([
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1%eth0', 'ff02::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '2001:db8::1', '::127.0.0.1',
  ])('IPv6 %s — приватный', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(['2a00:1450:4010:c05::64', '2606:4700::1111', '::ffff:8.8.8.8'])('IPv6 %s — публичный', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it('не-IP считается небезопасным', () => {
    expect(isPrivateIp('example.com')).toBe(true);
  });

  it('expandIpv6 разворачивает сокращения', () => {
    expect(expandIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
  });
});

describe('parseSafeUrl', () => {
  it('добавляет https:// к голому домену', () => {
    expect(parseSafeUrl('shina.ru').toString()).toBe('https://shina.ru/');
  });

  it.each([
    ['file:///etc/passwd', 'protocol'],
    ['ftp://example.com', 'protocol'],
    ['gopher://example.com', 'protocol'],
    ['javascript:alert(1)', 'protocol'],
    ['http://user:pass@example.com', 'credentials'],
    ['http://example.com:22', 'port'],
    ['http://example.com:6379', 'port'],
    ['http://localhost', 'host'],
    ['http://LOCALHOST.', 'host'],
    ['http://app.localhost', 'host'],
    ['http://db.internal', 'host'],
    ['http://printer.local', 'host'],
    ['http://intranet', 'host'],
    ['http://metadata.google.internal/computeMetadata/v1/', 'host'],
    ['http://127.0.0.1', 'private_ip'],
    ['http://2130706433', 'private_ip'],
    ['http://0x7f.1', 'private_ip'],
    ['http://169.254.169.254/latest/meta-data/', 'private_ip'],
    ['http://[::1]/', 'private_ip'],
    ['http://[::ffff:127.0.0.1]/', 'private_ip'],
    ['http://[fd00::1]/', 'private_ip'],
    ['', 'invalid_url'],
    ['http://', 'invalid_url'],
  ])('%s → %s', (url, expected) => {
    expect(syncReason(() => parseSafeUrl(url))).toBe(expected);
  });

  it('слишком длинный URL отклоняется', () => {
    expect(syncReason(() => parseSafeUrl(`https://a.ru/${'x'.repeat(3000)}`))).toBe('invalid_url');
  });

  it('разрешает обычные сайты и порты 80/443/8080', () => {
    for (const u of ['http://shina.ru', 'https://shina.ru:443/a?b=1', 'http://shina.ru:8080']) {
      expect(syncReason(() => parseSafeUrl(u))).toBe('ok');
    }
  });
});

describe('validateUrl (после DNS)', () => {
  it('публичный адрес проходит', async () => {
    const v = await validateUrl('https://shina.ru', publicDns);
    expect(v.address.address).toBe(PUBLIC_IP);
  });

  it('домен, резолвящийся в 127.0.0.1, блокируется', async () => {
    expect(await reason(validateUrl('https://evil.example', async () => [{ address: '127.0.0.1', family: 4 }]))).toBe('private_ip');
  });

  it('домен, резолвящийся в 169.254.169.254, блокируется', async () => {
    expect(await reason(validateUrl('https://evil.example', async () => [{ address: '169.254.169.254', family: 4 }]))).toBe('private_ip');
  });

  it('round-robin с одним приватным адресом блокируется', async () => {
    const dns: Resolver = async () => [{ address: PUBLIC_IP, family: 4 }, { address: '10.0.0.5', family: 4 }];
    expect(await reason(validateUrl('https://rr.example', dns))).toBe('private_ip');
  });

  it('IPv6 ULA после DNS блокируется', async () => {
    expect(await reason(validateUrl('https://v6.example', async () => [{ address: 'fd00::1', family: 6 }]))).toBe('private_ip');
  });

  it('ошибка DNS и пустой ответ → dns', async () => {
    expect(await reason(validateUrl('https://nx.example', async () => { throw new Error('ENOTFOUND'); }))).toBe('dns');
    expect(await reason(validateUrl('https://nx.example', async () => []))).toBe('dns');
  });

  it('публичный IP-литерал не требует DNS', async () => {
    const v = await validateUrl('http://8.8.8.8/', async () => { throw new Error('не должен вызываться'); });
    expect(v.address).toEqual({ address: '8.8.8.8', family: 4 });
  });
});

describe('readLimited', () => {
  it('читает тело в пределах лимита', async () => {
    const buf = await readLimited(Readable.from([Buffer.from('abc'), 'def']), 10);
    expect(buf.toString()).toBe('abcdef');
  });

  it('обрывает поток при превышении', async () => {
    expect(await reason(readLimited(Readable.from([Buffer.alloc(6), Buffer.alloc(6)]), 10))).toBe('too_large');
  });

  it('отклоняет по Content-Length без чтения', async () => {
    expect(await reason(readLimited(Readable.from([]), 10, '11'))).toBe('too_large');
  });
});

type Hop = { status: number; headers?: Record<string, string>; body?: Buffer | string };

function fakeTransport(hops: Record<string, Hop>, seen: string[] = []): Transport {
  return async (target) => {
    seen.push(`${target.url.toString()}@${target.address.address}`);
    const hop = hops[target.url.toString()] ?? { status: 404 };
    return { status: hop.status, headers: hop.headers ?? {}, body: Readable.from([Buffer.from(hop.body ?? '')]) };
  };
}

describe('safeFetch', () => {
  it('возвращает тело и content-type', async () => {
    const res = await safeFetch('https://shina.ru/', {
      resolve: publicDns,
      transport: fakeTransport({ 'https://shina.ru/': { status: 200, headers: { 'content-type': 'text/html' }, body: '<html>' } }),
    });
    expect(res).toMatchObject({ status: 200, contentType: 'text/html' });
    expect(res.body.toString()).toBe('<html>');
  });

  it('соединяется с проверенным IP (pinning)', async () => {
    const seen: string[] = [];
    await safeFetch('https://shina.ru/', { resolve: publicDns, transport: fakeTransport({ 'https://shina.ru/': { status: 200 } }, seen) });
    expect(seen).toEqual([`https://shina.ru/@${PUBLIC_IP}`]);
  });

  it('следует за редиректом на публичный хост', async () => {
    const res = await safeFetch('http://shina.ru/', {
      resolve: publicDns,
      transport: fakeTransport({
        'http://shina.ru/': { status: 301, headers: { location: 'https://www.shina.ru/home' } },
        'https://www.shina.ru/home': { status: 200, body: 'ok' },
      }),
    });
    expect(res.url).toBe('https://www.shina.ru/home');
  });

  it('редирект на 169.254.169.254 блокируется', async () => {
    const transport = fakeTransport({ 'https://shina.ru/': { status: 302, headers: { location: 'http://169.254.169.254/latest/' } } });
    expect(await reason(safeFetch('https://shina.ru/', { resolve: publicDns, transport }))).toBe('private_ip');
  });

  it('редирект на localhost блокируется', async () => {
    const transport = fakeTransport({ 'https://shina.ru/': { status: 307, headers: { location: 'http://localhost:8080/' } } });
    expect(await reason(safeFetch('https://shina.ru/', { resolve: publicDns, transport }))).toBe('host');
  });

  it('цикл редиректов обрывается', async () => {
    const transport = fakeTransport({ 'https://shina.ru/': { status: 302, headers: { location: '/' } } });
    expect(await reason(safeFetch('https://shina.ru/', { resolve: publicDns, transport, maxRedirects: 2 }))).toBe('too_many_redirects');
  });

  it('тело больше 2 МБ отклоняется', async () => {
    const big = Buffer.alloc(SSRF_MAX_BYTES + 1);
    const transport = fakeTransport({ 'https://shina.ru/': { status: 200, body: big } });
    expect(await reason(safeFetch('https://shina.ru/', { resolve: publicDns, transport }))).toBe('too_large');
  });

  it('зависший сервер → timeout', async () => {
    const hang: Transport = () => new Promise(() => undefined);
    expect(await reason(safeFetch('https://shina.ru/', { resolve: publicDns, transport: hang, timeoutMs: 50 }))).toBe('timeout');
  });

  it('зависший DNS → timeout', async () => {
    const slowDns: Resolver = () => new Promise(() => undefined);
    expect(await reason(safeFetch('https://shina.ru/', { resolve: slowDns, timeoutMs: 50 }))).toBe('timeout');
  });

  it('сетевая ошибка транспорта → network', async () => {
    const broken: Transport = async () => { throw new Error('ECONNRESET'); };
    expect(await reason(safeFetch('https://shina.ru/', { resolve: publicDns, transport: broken }))).toBe('network');
  });

  it('прямой запрос к 127.0.0.1 не доходит до транспорта', async () => {
    const seen: string[] = [];
    expect(await reason(safeFetch('http://127.0.0.1:8080/', { transport: fakeTransport({}, seen) }))).toBe('private_ip');
    expect(seen).toHaveLength(0);
  });
});

describe('defaultTransport', () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end(`host=${req.headers.host}`);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('соединяется с pinned IP и сохраняет Host исходного URL', async () => {
    const target = { url: new URL(`http://pinned.example:${port}/`), address: { address: '127.0.0.1', family: 4 as const } };
    const res = await defaultTransport(target, {}, new AbortController().signal);
    const body = await readLimited(res.body, 1024);
    expect(res.status).toBe(200);
    expect(body.toString()).toBe(`host=pinned.example:${port}`);
  });
});
