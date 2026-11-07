// app/api/health/route.ts — healthcheck для мониторинга (ТЗ §3.2, §16.8: ping /api/health каждую минуту).
// 200 — приложение и БД работают, 503 — БД недоступна/не отвечает или не настроено окружение.
// Без чувствительных данных: ни URL базы, ни текстов ошибок SDK, ни имён переменных окружения.
import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { checkEnv } from '@/lib/env';
import { jwtSecretTrusted } from '@/lib/auth-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Бюджет ответа ≤ 200 мс: БД, не ответившая за 150 мс, считается деградировавшей.
// Порог настраивается через HEALTH_DB_TIMEOUT_MS — локально и на удалённой БД 150 мс мало.
const DB_TIMEOUT_DEFAULT_MS = 150;
const DB_TIMEOUT_MIN_MS = 50;
const DB_TIMEOUT_MAX_MS = 5000;
const MS_IN_SECOND = 1000;
const STARTED_AT = Date.now();

function dbTimeoutMs(): number {
  const raw = Number(process.env.HEALTH_DB_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DB_TIMEOUT_DEFAULT_MS;
  return Math.min(DB_TIMEOUT_MAX_MS, Math.max(DB_TIMEOUT_MIN_MS, Math.round(raw)));
}

type CheckResult = 'ok' | 'timeout' | 'error' | 'misconfigured';

// Аналог SELECT 1: HEAD-запрос count по маленькой таблице без чтения строк.
async function checkDatabase(): Promise<{ result: CheckResult; latency_ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dbTimeoutMs());
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
      version: process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      uptime_s: Math.round((Date.now() - STARTED_AT) / MS_IN_SECOND),
      time: new Date().toISOString(),
      checks: {
        env: env_ok ? 'ok' : 'misconfigured',
        db: db.result,
        db_latency_ms: db.latency_ms,
        // Слабый секрет не роняет сервис, но означает, что локальная проверка токенов отключена:
        // видно в мониторинге, без раскрытия самого значения.
        security: jwtSecretTrusted() ? 'ok' : 'weak_jwt_secret',
      },
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
}

// HEAD для мониторингов, которые не читают тело (UptimeRobot): тот же код ответа, без тела.
export async function HEAD(): Promise<Response> {
  const res = await GET();
  return new Response(null, { status: res.status, headers: res.headers });
}
