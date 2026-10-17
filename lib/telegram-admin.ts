// lib/telegram-admin.ts — команды владельца сервиса (ТЗ §18.4, §21, §54).
// Вызываются из admin-webhook и из бизнес-webhook (один бот — две роли), только для TELEGRAM_CHAT_ID.
import { adminClient } from './supabase';
import { getBotInfo, logTelegramError, sendTelegram, type TelegramRole } from './telegram';

export const ADMIN_COMMANDS = new Set(['stats', 'ping', 'health', 'help']);

const DAY_MS = 86_400_000;

interface CountQuery {
  label: string;
  run: () => PromiseLike<{ count: number | null; error: { code?: string } | null }>;
}

function countQueries(): CountQuery[] {
  const db = adminClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const head = { count: 'exact' as const, head: true };
  return [
    { label: 'Бизнесов', run: () => db.from('businesses').select('id', head) },
    { label: 'Клиентов', run: () => db.from('businesses').select('id', head).eq('status', 'client') },
    { label: 'Отправлено писем', run: () => db.from('businesses').select('id', head).eq('status', 'sent') },
    { label: 'Броней за 24 ч', run: () => db.from('bookings').select('id', head).gte('created_at', since) },
    { label: 'Telegram подключён', run: () => db.from('businesses').select('id', head).not('telegram_chat_id', 'is', null) },
  ];
}

/** Сводка /stats. Сбой одного счётчика не ломает всю сводку — вместо числа «—». */
export async function buildStats(): Promise<string> {
  const queries = countQueries();
  const results = await Promise.all(queries.map(async (q) => {
    try {
      const { count, error } = await q.run();
      if (error) {
        await logTelegramError('stats_query_failed', { label: q.label, db_code: error.code ?? null });
        return '—';
      }
      return String(count ?? 0);
    } catch {
      // Сеть до Supabase — отражаем прочерком, детали уже не важны для сводки.
      return '—';
    }
  }));
  const rows = queries.map((q, i) => `${q.label}: <b>${results[i]}</b>`);
  return ['📊 <b>Сводка</b>', ...rows].join('\n');
}

/** /health: БД и Bot API. */
export async function buildHealth(role: TelegramRole): Promise<string> {
  const started = Date.now();
  const { error } = await adminClient().from('settings').select('key', { count: 'exact', head: true });
  const dbMs = Date.now() - started;
  const bot = await getBotInfo(role);
  const db = error ? `❌ БД: ошибка ${error.code ?? ''}`.trim() : `✅ БД: ${dbMs} мс`;
  const api = bot ? `✅ Bot API: @${bot.username}` : '❌ Bot API: getMe не отвечает';
  return ['🩺 <b>Health</b>', db, api].join('\n');
}

const HELP = ['Команды:', '/stats — сводка', '/health — состояние БД и Bot API', '/ping — проверка связи'].join('\n');

/** Ответ админу на неизвестную команду / свободный текст. */
export const ADMIN_UNKNOWN_COMMAND = 'Неизвестная команда. /help — список команд.';

/** Выполняет админ-команду и отвечает в чат. chatId уже проверен вызывающим кодом. */
export async function runAdminCommand(command: string, chatId: number, role: TelegramRole): Promise<void> {
  let text: string;
  if (command === 'stats') text = await buildStats();
  else if (command === 'health') text = await buildHealth(role);
  else if (command === 'ping') text = '🏓 pong';
  else text = HELP;
  await sendTelegram(chatId, text, { role, alertOnFailure: false });
}
