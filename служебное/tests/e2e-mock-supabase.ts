// tests/e2e-mock-supabase.ts — стенд для e2e без настоящей базы: Supabase Auth (вход по паролю, /user)
// и подмножество PostgREST в памяти. Только для локального прогона Playwright, в прод не попадает.
//
// Запуск (Node ≥ 22.6):
//   node --experimental-strip-types tests/e2e-mock-supabase.ts           # слушает 127.0.0.1:54321
//   .env: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, NEXT_PUBLIC_SUPABASE_ANON_KEY=x,
//               SUPABASE_SERVICE_ROLE_KEY=x, SUPERADMIN_EMAILS=admin@test.local
//   next build && next start -p 3100
//   E2E_BASE_URL=http://localhost:3100 E2E_ADMIN_EMAIL=admin@test.local E2E_ADMIN_PASSWORD=secret123 \
//     E2E_ALLOW_WRITES=1 npx playwright test
//
// Поддержано ровно то, что нужно спекам: eq/neq/in/is/like/ilike/gt/lt (+not.), order, limit/offset/Range,
// count (Prefer: count=exact), .single(), insert/upsert/update/delete, вложенный vertical_templates у businesses.
// Фильтры or=(…) и cs.{…} пропускаются (всегда true) — для экранов админки этого достаточно.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const ADMIN = { email: 'admin@test.local', password: 'secret123' };
const TOKEN = 'tok-admin';
const SERVICE_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and']);
const SEED_BUSINESSES = 60; // > 50 — чтобы была вторая страница списка и шага 1 воронки.

const now = (): string => new Date().toISOString();
const db = new Map<string, Row[]>();
const table = (name: string): Row[] => {
  let rows = db.get(name);
  if (!rows) db.set(name, (rows = []));
  return rows;
};

const verticalId = randomUUID();
table('vertical_templates').push({
  id: verticalId, name: 'Барбершопы', slug: 'barbershop', url_prefix: 'b', icon: '', description: '', fields: [],
  default_services: [], default_texts: {}, blocks: {}, is_active: true, show_demo_mode: true, created_at: now(),
});
for (let i = 0; i < SEED_BUSINESSES; i++) {
  table('businesses').push({
    id: randomUUID(), name: `Салон ${i}`, slug: `salon-${i}`, slug_history: [], city: i % 2 ? 'Москва' : 'Казань',
    status: 'new', emails: ['owner@example.test'], phones: [], vertical_template_id: verticalId,
    created_at: new Date(Date.now() - i * 1000).toISOString(),
  });
}

function send(res: http.ServerResponse, code: number, body?: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(code, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function literal(v: string): unknown {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function likeToRegExp(pattern: string, flags: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*');
  return new RegExp(`^${escaped}$`, flags);
}

// Одно условие PostgREST вида col=op.value (с необязательным not.).
function matches(row: Row, col: string, expr: string): boolean {
  const negate = expr.startsWith('not.');
  const body = negate ? expr.slice(4) : expr;
  const dot = body.indexOf('.');
  const op = body.slice(0, dot);
  const raw = body.slice(dot + 1);
  const cell = row[col];
  const text = cell === null || cell === undefined ? '' : String(cell);
  let ok: boolean;
  switch (op) {
    case 'eq': ok = cell === literal(raw) || text === raw; break;
    case 'neq': ok = text !== raw; break;
    case 'gt': ok = text > raw; break;
    case 'gte': ok = text >= raw; break;
    case 'lt': ok = text < raw; break;
    case 'lte': ok = text <= raw; break;
    case 'is': ok = raw === 'null' ? cell === null || cell === undefined : cell === literal(raw); break;
    case 'in': ok = raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(text); break;
    case 'like': ok = likeToRegExp(raw, '').test(text); break;
    case 'ilike': ok = likeToRegExp(raw, 'i').test(text); break;
    default: ok = true;
  }
  return negate ? !ok : ok;
}

function filter(rows: Row[], params: [string, string][]): Row[] {
  return rows.filter((row) => params.every(([k, v]) => SERVICE_PARAMS.has(k) || matches(row, k, v)));
}

function withEmbeds(name: string, row: Row): Row {
  const out: Row = { ...row };
  if (name === 'businesses') out.vertical_templates = table('vertical_templates').find((v) => v.id === row.vertical_template_id) ?? null;
  if ('business_id' in row) out.businesses = table('businesses').find((b) => b.id === row.business_id) ?? null;
  return out;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  return body ? (JSON.parse(body) as unknown) : null;
}

function auth(req: http.IncomingMessage, res: http.ServerResponse, path: string, json: unknown): boolean {
  if (path === '/auth/v1/token') {
    const creds = (json ?? {}) as { email?: string; password?: string };
    if (creds.email === ADMIN.email && creds.password === ADMIN.password) {
      send(res, 200, { access_token: TOKEN, token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: { id: 'u1', email: ADMIN.email } });
    } else {
      send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    return true;
  }
  if (path === '/auth/v1/user') {
    if (req.headers.authorization === `Bearer ${TOKEN}`) send(res, 200, { id: 'u1', email: ADMIN.email, aud: 'authenticated' });
    else send(res, 401, { msg: 'invalid JWT' });
    return true;
  }
  return false;
}

function write(name: string, method: string, url: URL, json: unknown, prefer: string): Row[] | { conflict: true } {
  const rows = table(name);
  const params = [...url.searchParams.entries()];
  if (method === 'PATCH') {
    const hit = filter(rows, params);
    hit.forEach((r) => Object.assign(r, json as Row));
    return hit;
  }
  if (method === 'DELETE') {
    const hit = filter(rows, params);
    db.set(name, rows.filter((r) => !hit.includes(r)));
    return hit;
  }
  const list = (Array.isArray(json) ? json : [json]) as Row[];
  const key = url.searchParams.get('on_conflict') ?? (prefer.includes('merge-duplicates') ? 'id' : null);
  const out: Row[] = [];
  for (const input of list) {
    const row: Row = { id: randomUUID(), created_at: now(), ...input };
    // unique-индекс businesses.slug — как в миграции 0001.
    if (name === 'businesses' && rows.some((b) => b.slug === row.slug)) return { conflict: true };
    const existing = key ? rows.find((x) => x[key] === row[key]) : undefined;
    if (existing) Object.assign(existing, row, { id: existing.id });
    else rows.push(row);
    out.push(existing ?? row);
  }
  return out;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const method = req.method ?? 'GET';
    const json = await readJson(req);
    if (auth(req, res, url.pathname, json)) return;

    const m = /^\/rest\/v1\/(\w+)/.exec(url.pathname);
    if (!m) return send(res, 404, { message: 'not found' });
    const name = m[1];
    const prefer = String(req.headers.prefer ?? '');
    const single = String(req.headers.accept ?? '').includes('vnd.pgrst.object');

    let rows: Row[];
    if (method === 'GET' || method === 'HEAD') {
      rows = filter(table(name), [...url.searchParams.entries()]);
    } else {
      const result = write(name, method, url, json, prefer);
      if ('conflict' in result) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
      rows = result;
    }

    const total = rows.length;
    const order = url.searchParams.get('order');
    if (order) {
      const [col, dir] = order.split(',')[0].split('.');
      const sign = dir === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => (String(a[col] ?? '') > String(b[col] ?? '') ? sign : -sign));
    }
    let from = Number(url.searchParams.get('offset') ?? 0);
    let limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
    const range = req.headers.range;
    if (range) {
      const [a, b] = range.split('-').map(Number);
      from = a;
      limit = b - a + 1;
    }
    rows = rows.slice(from, limit === undefined ? undefined : from + limit).map((r) => withEmbeds(name, r));
    const headers = { 'content-range': `${from}-${from + rows.length - 1}/${prefer.includes('count') ? total : '*'}` };

    if (method === 'HEAD') return send(res, 200, undefined, headers);
    if (method !== 'GET' && prefer.includes('return=minimal')) return send(res, 201, undefined, headers);
    if (single) {
      if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      return send(res, 200, rows[0], headers);
    }
    return send(res, 200, rows, headers);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock supabase: http://127.0.0.1:${PORT}`));
