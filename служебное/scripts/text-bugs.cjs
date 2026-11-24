// служебное/scripts/text-bugs.cjs — ищет в HTML витрин следы незаполненных данных:
// «от 0 ₽», NaN, undefined, null, [object Object], пустые заголовки.
// Запуск: MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" node служебное/scripts/text-bugs.cjs
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

const PATTERNS = [
  ['от 0 ₽', /от\s*0\s*₽/g],
  ['пустая цена', /от\s*₽|—\s*₽|\s₽/g],
  ['NaN', /\bNaN\b/g],
  ['undefined', /\bundefined\b/g],
  ['null', />null</g],
  ['object Object', /\[object Object\]/g],
  ['пустой заголовок', /<h[12][^>]*>\s*<\/h[12]>/g],
  ['Infinity', /\bInfinity\b/g],
];

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
    const hits = [];
    for (const [name, re] of PATTERNS) {
      const m = r.body.match(re);
      if (!m) continue;
      // «null» и «undefined» в JSON-скриптах — норма; смотрим только видимый текст.
      if (name === 'null' || name === 'undefined') continue;
      hits.push(`${name}×${m.length}`);
    }
    if (hits.length) { console.log(`${u} → ${hits.join(', ')}`); bad++; }
  }
  console.log(`\nпроверено ${urls.length}, с замечаниями: ${bad}`);
})();
