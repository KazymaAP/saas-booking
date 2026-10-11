// lib/cron.ts — защита cron-задач: Authorization: Bearer CRON_SECRET (ТЗ §26).
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}
