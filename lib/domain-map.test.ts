// lib/domain-map.test.ts — подпись и проверка cookie «домен → prefix/slug».
import { describe, expect, it } from 'vitest';
import { signDomainMap, verifyDomainMap, type DomainMap } from './domain-map';

const SECRET = 'f'.repeat(64);
const NOW = 1_800_000_000;
const MAP: DomainMap = { host: 'client.ru', prefix: 't', slug: 'tire-shop', status: 'client', exp: NOW + 600 };

describe('domain-map', () => {
  it('подписанное значение проходит проверку', async () => {
    const signed = await signDomainMap(MAP, SECRET);
    expect(signed).not.toBeNull();
    expect(await verifyDomainMap(signed ?? '', 'client.ru', SECRET, NOW)).toEqual(MAP);
  });

  it('cookie другого домена не принимается (нельзя перенести cookie между доменами)', async () => {
    const signed = await signDomainMap(MAP, SECRET);
    expect(await verifyDomainMap(signed ?? '', 'other.ru', SECRET, NOW)).toBeNull();
  });

  it('истёкшая cookie не принимается', async () => {
    const signed = await signDomainMap(MAP, SECRET);
    expect(await verifyDomainMap(signed ?? '', 'client.ru', SECRET, MAP.exp)).toBeNull();
  });

  it('подмена slug ломает подпись', async () => {
    const signed = (await signDomainMap(MAP, SECRET)) ?? '';
    const forged = signed.replace('tire-shop', 'other-shop');
    expect(await verifyDomainMap(forged, 'client.ru', SECRET, NOW)).toBeNull();
  });

  it('другой секрет — подпись недействительна', async () => {
    const signed = await signDomainMap(MAP, SECRET);
    expect(await verifyDomainMap(signed ?? '', 'client.ru', 'e'.repeat(64), NOW)).toBeNull();
  });

  it('мусор и пустые значения → null без исключений', async () => {
    for (const value of [undefined, '', '.', 'abc', 'a.b', 'client.ru|t|x|client|1.!!!', `${'x'.repeat(10)}.${'y'.repeat(43)}`]) {
      expect(await verifyDomainMap(value, 'client.ru', SECRET, NOW)).toBeNull();
    }
  });

  it('без секрета не подписывает и не проверяет', async () => {
    expect(await signDomainMap(MAP, undefined)).toBeNull();
    const signed = await signDomainMap(MAP, SECRET);
    expect(await verifyDomainMap(signed ?? '', 'client.ru', undefined, NOW)).toBeNull();
  });

  it('некорректный prefix/slug в полезной нагрузке отвергается даже с верной подписью', async () => {
    const signed = await signDomainMap({ ...MAP, slug: '../panel' }, SECRET);
    expect(await verifyDomainMap(signed ?? '', 'client.ru', SECRET, NOW)).toBeNull();
  });
});
