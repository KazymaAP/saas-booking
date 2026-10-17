// app/panel/(protected)/licenses/page.tsx — лицензии: статус, последний ping, сигналы, блокировка, домены (ТЗ 4.0 §14.6).
// Данные грузятся фиксированным числом запросов (без N+1): лицензии, бизнесы, ping за 30 дней, сигналы за 7 дней,
// отметки «игнор».
import { adminClient } from '@/lib/supabase';
import { isLicenseStatus, type LicenseStatus } from '@/lib/license-client';
import { UNBOUND_DOMAIN } from '@/lib/license-server';
import { LicensesTable, type LicenseView } from './LicensesTable';
import { CreateLicenseForm } from './CreateLicenseForm';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 300;
const PING_WINDOW_DAYS = 30; // «последний ping» ищем за 30 дней, старше — «давно не выходил на связь»
const PING_FETCH_LIMIT = 5_000;
const SIGNAL_WINDOW_DAYS = 7;
const SIGNAL_STATUSES: LicenseStatus[] = ['unverified', 'unknown'];
const DAY_MS = 86_400_000;

type LicenseRowDb = {
  id: string;
  license_id: string;
  domain: string | null;
  allowed_domains: string[] | null;
  revoked: boolean;
  issued_at: string;
  businesses: { name: string } | { name: string }[] | null;
};
type PingDb = { license_id: string | null; status: string | null; domain: string | null; pinged_at: string };

// Supabase типизирует связь как объект или массив — приводим к имени.
function businessName(b: LicenseRowDb['businesses']): string | null {
  if (!b) return null;
  return Array.isArray(b) ? b[0]?.name ?? null : b.name;
}

async function loadIgnored(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await adminClient()
    .from('audit_log').select('entity_id, created_at').eq('action', 'license_ignore').in('entity_id', ids)
    .order('created_at', { ascending: false }).limit(LIST_LIMIT * 2);
  // Клиент Supabase без сгенерированных типов отдаёт any[] — аннотация типа вместо приведения.
  const marks: { entity_id: string; created_at: string }[] = data ?? [];
  for (const r of marks) {
    if (!out.has(r.entity_id)) out.set(r.entity_id, r.created_at);
  }
  return out;
}

async function loadPings(licenseIds: string[]): Promise<PingDb[]> {
  if (licenseIds.length === 0) return [];
  const since = new Date(Date.now() - PING_WINDOW_DAYS * DAY_MS).toISOString();
  const { data } = await adminClient()
    .from('license_pings').select('license_id, status, domain, pinged_at').in('license_id', licenseIds)
    .gte('pinged_at', since).order('pinged_at', { ascending: false }).limit(PING_FETCH_LIMIT);
  const pings: PingDb[] = data ?? [];
  return pings;
}

// Сигналы — отдельным узким запросом: в общей выборке «последних ping» частые active-ping одной лицензии
// могли вытеснить за limit редкие unverified/unknown другой, и сигнал терялся.
async function loadSignals(licenseIds: string[]): Promise<PingDb[]> {
  if (licenseIds.length === 0) return [];
  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * DAY_MS).toISOString();
  const { data } = await adminClient()
    .from('license_pings').select('license_id, status, domain, pinged_at').in('license_id', licenseIds)
    .in('status', SIGNAL_STATUSES).gte('pinged_at', since).order('pinged_at', { ascending: false }).limit(PING_FETCH_LIMIT);
  const signals: PingDb[] = data ?? [];
  return signals;
}

function lastPings(pings: PingDb[]): Map<string, PingDb> {
  const last = new Map<string, PingDb>();
  for (const p of pings) {
    if (p.license_id && !last.has(p.license_id)) last.set(p.license_id, p);
  }
  return last;
}

// Домены сигналов по лицензии, новее отметки «Игнорировать».
function signalDomains(signals: PingDb[], ignored: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const p of signals) {
    if (!p.license_id || !p.domain) continue;
    const ignoredAt = ignored.get(p.license_id);
    if (ignoredAt && p.pinged_at <= ignoredAt) continue;
    const set = out.get(p.license_id) ?? new Set<string>();
    set.add(p.domain);
    out.set(p.license_id, set);
  }
  return new Map(Array.from(out, ([k, v]) => [k, Array.from(v)]));
}

function buildViews(rows: LicenseRowDb[], pings: PingDb[], signals: PingDb[], ignored: Map<string, string>): LicenseView[] {
  const last = lastPings(pings);
  // Отметки ignore хранятся по licenses.id, сигналы — по license_id: переводим ключи.
  const ignoredByLicense = new Map<string, string>();
  for (const l of rows) {
    const at = ignored.get(l.id);
    if (at) ignoredByLicense.set(l.license_id, at);
  }
  const sig = signalDomains(signals, ignoredByLicense);
  return rows.map((l) => {
    const lp = last.get(l.license_id);
    const status: LicenseStatus | null = lp && isLicenseStatus(lp.status) ? lp.status : null;
    return {
      id: l.id,
      license_id: l.license_id,
      business: businessName(l.businesses),
      domains: Array.from(new Set([l.domain ?? '', ...(l.allowed_domains ?? [])].filter((d) => d && d !== UNBOUND_DOMAIN))),
      revoked: l.revoked,
      last_ping: lp ? { status, domain: lp.domain ?? '', at: lp.pinged_at } : null,
      signal_domains: sig.get(l.license_id) ?? [],
    };
  });
}

export default async function LicensesPage() {
  const db = adminClient();
  const [{ data: licenses, error }, { data: businesses }] = await Promise.all([
    db.from('licenses').select('id, license_id, domain, allowed_domains, revoked, issued_at, businesses(name)')
      .order('issued_at', { ascending: false }).limit(LIST_LIMIT),
    db.from('businesses').select('id, name').eq('status', 'client').order('name').limit(500),
  ]);
  const rows: LicenseRowDb[] = licenses ?? [];
  const clients: { id: string; name: string }[] = businesses ?? [];
  const licenseIds = rows.map((r) => r.license_id);
  const [pings, signals, ignored] = await Promise.all([loadPings(licenseIds), loadSignals(licenseIds), loadIgnored(rows.map((r) => r.id))]);
  const views = buildViews(rows, pings, signals, ignored);

  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="text-[24px] font-semibold">Лицензии</h1>
        <p className="text-[14px] text-[#666666]">
          Ping раз в сутки, ответ подписан HMAC. Сервер никогда не блокирует сам — только вы, кнопкой «Заблокировать».
        </p>
      </header>

      <section aria-labelledby="license-create-title">
        <h2 id="license-create-title" className="text-[18px] font-semibold">Выдать лицензию</h2>
        <CreateLicenseForm businesses={clients} />
      </section>

      <section aria-labelledby="license-list-title" className="grid gap-3">
        <h2 id="license-list-title" className="text-[18px] font-semibold">Выданные лицензии ({views.length})</h2>
        {error ? <p role="alert" className="text-[#dc2626]">Не удалось загрузить лицензии. Обновите страницу.</p> : <LicensesTable licenses={views} />}
      </section>
    </div>
  );
}
