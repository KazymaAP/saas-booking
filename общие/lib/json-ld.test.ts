// lib/json-ld.test.ts — экранирование JSON-LD: значения из базы не должны закрывать <script>.
import { describe, expect, it } from 'vitest';
import { jsonLdSafe } from './json-ld';

describe('jsonLdSafe', () => {
  it('не даёт закрыть тег script значением из базы', () => {
    const html = jsonLdSafe({ name: '</script><script>alert(1)</script>' });
    expect(html).not.toContain('<');
    expect(html).not.toContain('>');
    expect(html).not.toContain('</script');
  });

  it('экранирует & и разделители строк U+2028/U+2029', () => {
    const html = jsonLdSafe({ description: 'a&b\u2028c\u2029d' });
    expect(html).not.toContain('&');
    expect(html).not.toContain('\u2028');
    expect(html).not.toContain('\u2029');
  });

  it('результат остаётся валидным JSON и сохраняет значения', () => {
    const value = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Шиномонтаж «Колесо» </script><img src=x onerror=alert(1)>',
      telephone: '+7 999 123-45-67',
      address: { '@type': 'PostalAddress', streetAddress: 'Ленина, 1 & 2' },
      description: undefined,
    };
    const parsed = JSON.parse(jsonLdSafe(value));
    expect(parsed.name).toBe(value.name);
    expect(parsed.address.streetAddress).toBe('Ленина, 1 & 2');
    expect(parsed).not.toHaveProperty('description');
  });

  it('обычный текст без спецсимволов не меняется', () => {
    expect(jsonLdSafe({ name: 'Студия' })).toBe('{"name":"Студия"}');
  });
});
