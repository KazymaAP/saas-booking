// служебное/scripts/links.cjs — собрать внутренние ссылки со страницы и проверить коды ответа.
// Использование: node служебное/scripts/links.cjs /test/ful/sts [/другая ...]
const BASE = process.env.SHOOT_BASE || 'https://www.zapishisya.ru';

async function get(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 audit' } });
      return { status: res.status, location: res.headers.get('location'), body: res.status === 200 ? await res.text() : '' };
    } catch (e) {
      if (i === attempts) return { status: 0, error: String(e.cause?.code || e.message) };
      await new Promise((r) => setTimeout(r, 1200 * i));
    }
  }
}

(async () => {
  const seeds = process.argv.slice(2);
  if (!seeds.length) { console.error('нужен хотя бы один путь'); process.exit(1); }

  const links = new Set();
  for (const seed of seeds) {
    const r = await get(BASE + seed);
    if (r.status !== 200) { console.log(`SEED ${r.status} ${seed}`); continue; }
    const re = /href="(\/[^"#?]*)/g;
    let m;
    while ((m = re.exec(r.body))) {
      const p = m[1];
      if (p.startsWith('/_next') || p.startsWith('/api/')) continue;
      links.add(p);
    }
  }

  const list = [...links].sort();
  console.log(`ссылок собрано: ${list.length}\n`);

  const bad = [];
  let i = 0;
  const CONC = 6;
  async function worker() {
    while (i < list.length) {
      const p = list[i++];
      const r = await get(BASE + p, 2);
      if (r.status !== 200) bad.push({ p, status: r.status, location: r.location });
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  if (!bad.length) { console.log('битых ссылок нет'); return; }
  for (const b of bad.sort((a, b) => String(a.p).localeCompare(String(b.p)))) {
    console.log(`${b.status} ${b.p}${b.location ? ' -> ' + b.location : ''}`);
  }
  console.log(`\nбитых: ${bad.length} из ${list.length}`);
})();
