// служебное/scripts/text-bugs.cjs — ищет в видимом тексте витрин следы незаполненных данных:
// «от 0 ₽», пустая цена, NaN, undefined, null, [object Object], пустые заголовки.
// Запуск: node служебное/scripts/text-bugs.cjs
//
// Почему не регуляркой на весь HTML: раньше шаблон `\s₽` считал пустой ценой обычное
// «1 000 ₽» — скрипт ругался на 99 страниц из 101, и настоящие дефекты в этом шуме
// было не видно. Теперь цена проверяется по смыслу: у «₽» слева должно быть число.
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

// Всё, что не показывается человеку: JSON-LD, RSC-payload, стили.
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;|&raquo;/g, '"')
    .replace(/\s+/g, ' ');
}

const PATTERNS = [
  ['от 0 ₽', /от\s*0\s*₽/g],
  ['NaN', /\bNaN\b/g],
  ['undefined', /\bundefined\b/g],
  ['null', /\bnull\b/g],
  ['object Object', /\[object Object\]/g],
  ['Infinity', /\bInfinity\b/g],
  ['пустой заголовок', /<h[12][^>]*>\s*<\/h[12]>/g],
];

// «₽» без числа слева — цена не подставилась. Число может быть через пробел: «1 000 ₽».
function emptyPrices(text) {
  const hits = [];
  for (let i = text.indexOf('₽'); i !== -1; i = text.indexOf('₽', i + 1)) {
    const before = text.slice(Math.max(0, i - 20), i);
    if (!/\d/.test(before)) hits.push(text.slice(Math.max(0, i - 30), i + 1));
  }
  return hits;
}

async function get(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 audit' }, signal: AbortSignal.timeout(25000) });
      return { status: r.status, body: r.status === 200 ? await r.text() : '' };
    } catch (e) {
      if (i === attempts) return { status: 0, body: '', error: String(e.cause?.code || e.message) };
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

(async () => {
  const sm = await get(`${BASE}/sitemap.xml`);
  if (sm.status !== 200) { console.error('sitemap', sm.status); process.exit(1); }
  const urls = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  let bad = 0;
  for (const u of urls) {
    const r = await get(u);
    if (r.status !== 200) { console.log(`${r.status} ${u}`); bad++; continue; }
    const text = visibleText(r.body);
    const hits = [];
    for (const [name, re] of PATTERNS) {
      const m = name === 'пустой заголовок' ? r.body.match(re) : text.match(re);
      if (m) hits.push(`${name}×${m.length}`);
    }
    const prices = emptyPrices(text);
    if (prices.length) hits.push(`пустая цена×${prices.length} (${prices[0].trim()})`);
    if (hits.length) { console.log(`${u} → ${hits.join(', ')}`); bad++; }
  }
  console.log(`\nпроверено ${urls.length}, с замечаниями: ${bad}`);
})();
