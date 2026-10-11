// lib/license-client.ts — клиентская часть лицензии (ТЗ §5.8). Попадает в код, который передаётся клиенту.
// Раз в сутки отправляет ping на LICENSE_SERVER_URL, результат кладёт в cookie license_status.
// Блокировка на стороне middleware: статус blocked → переписывание на /blocked.
// Сбой сети не блокирует сайт: при отсутствии ответа используется последний статус или 'unknown'.

export type LicenseStatus = 'active' | 'unverified' | 'unknown' | 'blocked';

export const LICENSE_COOKIE = 'license_status';
const DAY_MS = 86_400_000;

export async function pingLicense(domain: string, version: string): Promise<LicenseStatus> {
  const id = process.env.LICENSE_ID;
  const server = process.env.LICENSE_SERVER_URL;
  if (!id || !server) return 'unknown';
  try {
    const res = await fetch(`${server.replace(/\/$/, '')}/api/license/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_id: id, domain, version }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    const json = (await res.json()) as { status?: LicenseStatus };
    return json.status ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// Нужен ли новый ping: нет cookie или прошло больше суток.
export function pingDue(lastCheckedIso: string | undefined): boolean {
  if (!lastCheckedIso) return true;
  return Date.now() - new Date(lastCheckedIso).getTime() >= DAY_MS;
}
