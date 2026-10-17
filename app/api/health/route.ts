// app/api/health/route.ts — healthcheck для мониторинга (ТЗ §3.2, §16.8: ping /api/health каждую минуту).
// 200 — приложение и БД работают, 503 — БД недоступна/не отвечает или не настроено окружение.
// Без чувствительных данных: ни URL базы, ни текстов ошибок SDK, ни имён переменных окружения.
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { checkEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Бюджет ответа ≤ 200 мс: БД, не ответившая за 150 мс, считается деградировавшей.
const DB_TIMEOUT_MS = 150;
const MS_IN_SECOND = 1000;
const STARTED_AT = Date.now();

type CheckResult = 'ok' | 'timeout' | 'error' | 'misconfigured';

// Аналог SELECT 1: HEAD-запрос count по маленькой таблице без чтения строк.
async function checkDatabase(): Promise<{ result: CheckResult; latency_ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);
  try {
    const { error } = await adminClient()
      .from('settings')
      .select('key', { head: true, count: 'planned' })
      .limit(1)
      .abortSignal(controller.signal);
    if (controller.signal.aborted) return { result: 'timeout', latency_ms: Date.now() - started };
    return { result: error ? 'error' : 'ok', latency_ms: Date.now() - started };
  } catch {
    const result: CheckResult = controller.signal.aborted ? 'timeout' : 'error';
    return { result, latency_ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<NextResponse> {
  const env_ok = checkEnv().length === 0;
  const db = env_ok ? await checkDatabase() : { result: 'misconfigured' as const, latency_ms: 0 };
  const healthy = db.result === 'ok';

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      uptime_s: Math.round((Date.now() - STARTED_AT) / MS_IN_SECOND),
      time: new Date().toISOString(),
      checks: { env: env_ok ? 'ok' : 'misconfigured', db: db.result, db_latency_ms: db.latency_ms },
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
}

// HEAD для мониторингов, которые не читают тело (UptimeRobot): тот же код ответа, без тела.
export async function HEAD(): Promise<Response> {
  const res = await GET();
  return new Response(null, { status: res.status, headers: res.headers });
}
