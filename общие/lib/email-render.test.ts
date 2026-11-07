// lib/email-render.test.ts — рендер шаблонов: переменные, экранирование, inline CSS, размеры.
import { describe, expect, it } from 'vitest';
import {
  EmailTooLargeError,
  MAX_EMAIL_BYTES,
  TEMPLATE_VARIABLES,
  escapeHtml,
  extractVariables,
  htmlToText,
  inlineCss,
  renderEmail,
  renderSubject,
  renderText,
  rewriteLinks,
  substitute,
  textToHtml,
  type TemplateVars,
} from './email-render';

describe('substitute / renderText', () => {
  it('подставляет все 19 переменных ТЗ §9.9', () => {
    expect(TEMPLATE_VARIABLES).toHaveLength(19);
    const vars = Object.fromEntries(TEMPLATE_VARIABLES.map((k) => [k, `v_${k}`])) as TemplateVars;
    const tpl = TEMPLATE_VARIABLES.map((k) => `{${k}}`).join('|');
    expect(renderText(tpl, vars)).toBe(TEMPLATE_VARIABLES.map((k) => `v_${k}`).join('|'));
  });

  it('пустые значения → пустая строка, числа → строка', () => {
    expect(renderText('{name}-{rating}-{city}', { name: null, rating: 4.8 })).toBe('-4.8-');
  });

  it('неизвестный плейсхолдер не трогается', () => {
    expect(renderText('Цена {price} для {name}', { name: 'A' })).toBe('Цена {price} для A');
  });

  it('значение не интерпретируется повторно (нет инъекции плейсхолдеров)', () => {
    expect(renderText('{name}', { name: '{password}', password: 'secret' })).toBe('{password}');
  });

  it('encode применяется только к значениям', () => {
    expect(substitute('<b>{name}</b>', { name: '<i>x</i>' }, escapeHtml)).toBe('<b>&lt;i&gt;x&lt;/i&gt;</b>');
  });
});

describe('renderSubject', () => {
  it('убирает переводы строк (header injection) и ограничивает длину', () => {
    expect(renderSubject('Привет {name}', { name: 'A\r\nBcc: evil@x.ru' })).toBe('Привет A Bcc: evil@x.ru');
    expect(renderSubject('{name}', { name: 'x'.repeat(500) })).toHaveLength(200);
  });
});

describe('escapeHtml', () => {
  it('экранирует 5 опасных символов', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('textToHtml / htmlToText', () => {
  it('абзацы, переносы и ссылки', () => {
    const html = textToHtml('Строка 1\nСтрока 2\n\nСайт: https://ex.ru/a?b=1&c=2.');
    expect(html).toBe('<p>Строка 1<br>Строка 2</p><p>Сайт: <a href="https://ex.ru/a?b=1&amp;c=2">https://ex.ru/a?b=1&amp;c=2</a>.</p>');
  });

  it('html → текст со ссылками и сущностями', () => {
    expect(htmlToText('<p>A &amp; B</p><p><a href="https://x.ru">Открыть</a></p><style>p{}</style>')).toBe('A & B\n\nОткрыть (https://x.ru)');
  });
});

describe('inlineCss', () => {
  it('добавляет стиль тегам без style', () => {
    expect(inlineCss('<p>x</p>')).toContain('<p style="margin:0 0 16px 0;');
  });
  it('стиль автора сохраняется и идёт последним', () => {
    const out = inlineCss('<p class="c" style="color:red">x</p>');
    expect(out).toMatch(/<p class="c" style="margin:[^"]*;color:red">/);
  });
  it('не трогает неизвестные теги', () => {
    expect(inlineCss('<span>x</span>')).toBe('<span>x</span>');
  });
});

describe('rewriteLinks', () => {
  it('переписывает только http(s)', () => {
    const out = rewriteLinks('<a href="https://a.ru/?x=1&amp;y=2">a</a><a href="mailto:z@z.ru">m</a>', (u) => `T(${u})`);
    expect(out).toBe('<a href="T(https://a.ru/?x=1&amp;y=2)">a</a><a href="mailto:z@z.ru">m</a>');
  });
});

describe('extractVariables', () => {
  it('разделяет известные и неизвестные', () => {
    expect(extractVariables('{name} {foo} {name} {url}')).toEqual({ known: ['name', 'url'], unknown: ['foo'] });
  });
});

describe('renderEmail', () => {
  const vars: TemplateVars = { name: 'Студия <Ногти & Co>', url: 'https://servis-jade.ru/p/1', unsubscribe_url: 'https://servis-jade.ru/unsubscribe/t' };

  it('текстовый шаблон: экранированный HTML, inline CSS, отписка в обеих частях', () => {
    const r = renderEmail({ subject: 'Сайт для {name}', body_text: 'Здравствуйте, {name}!\n\nДемо: {url}' }, vars, { pixelUrl: 'https://servis-jade.ru/api/track/open/t' });
    expect(r.subject).toBe('Сайт для Студия <Ногти & Co>');
    expect(r.html).toContain('Студия &lt;Ногти &amp; Co&gt;');
    expect(r.html).not.toContain('<Ногти');
    expect(r.html).not.toMatch(/<style/i);
    expect(r.html).toContain('Отписаться от писем');
    expect(r.html).toContain('/api/track/open/t');
    expect(r.text).toContain('Отписаться: https://servis-jade.ru/unsubscribe/t');
    expect(r.text).toContain('Здравствуйте, Студия <Ногти & Co>!');
  });

  it('HTML-шаблон: значения экранируются, текст выводится из HTML', () => {
    const r = renderEmail({ subject: 'x', body_html: '<p>Привет, {name}</p>' }, vars);
    expect(r.html).toContain('Привет, Студия &lt;Ногти &amp; Co&gt;');
    expect(r.text.startsWith('Привет, Студия <Ногти & Co>')).toBe(true);
  });

  it('linkRewriter применяется к ссылкам контента, но не к отписке', () => {
    const r = renderEmail({ subject: 'x', body_text: 'Демо: {url}' }, vars, { linkRewriter: (u) => `https://t.ru/c?u=${encodeURIComponent(u)}` });
    expect(r.html).toContain('href="https://t.ru/c?u=https%3A%2F%2Fservis-jade.ru%2Fp%2F1"');
    expect(r.html).toContain('href="https://servis-jade.ru/unsubscribe/t"');
  });

  it('без unsubscribe_url — без ссылки отписки', () => {
    const r = renderEmail({ subject: 'x', body_text: 'y' }, {});
    expect(r.html).not.toContain('Отписаться');
    expect(r.text).toBe('y');
  });

  it('preheader скрыт', () => {
    expect(renderEmail({ subject: 'x', body_text: 'y' }, {}, { preheader: 'Коротко' }).html).toContain('display:none');
  });

  it('больше 500 КБ — ошибка', () => {
    expect(() => renderEmail({ subject: 'x', body_text: 'a'.repeat(MAX_EMAIL_BYTES) }, {})).toThrow(EmailTooLargeError);
  });
});
