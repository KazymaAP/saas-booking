// служебное/scripts/link-audit.cjs — обход карты сайта и проверка всех внутренних ссылок.
//
// Зачем: битые ссылки не видны ни в сборке, ни в тестах — они появляются из данных
// (архивный бизнес, удалённая услуга, старый slug) и из ручных href в шаблонах.
// Скрипт берёт sitemap.xml, вытаскивает из каждой страницы внутренние href,
// дедуплицирует и проверяет статус каждого адреса.
//
// Запуск: node служебное/scripts/link-audit.cjs [--limit N]
const BASE = 'https://www.zapishisya.ru';

async function fetchText(url, redirect = 'follow') {
  const res = await fetch(url, { redirect, headers: { 'user-agent': 'link-audit/1.0' } });
  return { status: res.status, text: res.status < 400 ? await res.text() : '' };
}

function internalLinks(html, pageUrl) {
  const out = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const raw = m[1];
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue;
    if (raw.startsWith('javascript:') || raw.startsWith('data:')) continue;
    let url;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== BASE) continue;
    url.hash = '';
    out.add(url.pathname + url.search);
  }
  return out;
}

(async () => {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  const map = await fetchText(`${BASE}/sitemap.xml`);
  const pages = [...map.text.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]).slice(0, limit);
  console.log(`страниц в карте: ${pages.length}`);

  const links = new Map(); // путь -> откуда найден
  const pageErrors = [];
  for (const page of pages) {
    const res = await fetchText(page);
    if (res.status !== 200) {
      pageErrors.push({ page, status: res.status });
      continue;
    }
    for (const link of internalLinks(res.text, page)) {
      if (!links.has(link)) links.set(link, page);
    }
  }
  console.log(`уникальных внутренних ссылок: ${links.size}`);

  const broken = [];
  const redirects = [];
  const entries = [...links.entries()];
  for (let i = 0; i < entries.length; i += 12) {
    const batch = entries.slice(i, i + 12);
    await Promise.all(
      batch.map(async ([link, from]) => {
        try {
          const res = await fetchText(`${BASE}${link}`, 'manual');
          if (res.status === 404 || res.status === 410) broken.push({ link, from, status: res.status });
          else if (res.status >= 300 && res.status < 400) redirects.push({ link, from, status: res.status });
        } catch (e) {
          broken.push({ link, from, status: String(e.message) });
        }
      }),
    );
  }

  console.log(`\nбитых страниц карты: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(`  ${e.status} ${e.page}`);
  console.log(`битых ссылок: ${broken.length}`);
  for (const b of broken.slice(0, 40)) console.log(`  ${b.status} ${b.link}  <- ${b.from}`);
  console.log(`редиректов: ${redirects.length}`);
  for (const r of redirects.slice(0, 40)) console.log(`  ${r.status} ${r.link}  <- ${r.from}`);

  process.exitCode = broken.length + pageErrors.length > 0 ? 1 : 0;
})();
