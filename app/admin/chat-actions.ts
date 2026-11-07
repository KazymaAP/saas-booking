'use server';

// app/admin/chat-actions.ts — реальная переписка с арендаторами через Телеграм-бота.
// Источник данных — таблица telegram_messages: её заполняет сам бот на каждое входящее
// и исходящее сообщение (см. телеграмм-бот/telegram.ts → logTelegramMessage).
// Никаких демо-диалогов: пусто в таблице — пусто в интерфейсе.
import { adminClient } from '@/lib/supabase';
import { requireSuperAdminAction } from '@/lib/admin-session';
import { audit } from '@/lib/audit';
import { hitRateLimit } from '@/lib/rate-limit';
import { sendTelegram } from '@/телеграмм-бот/telegram';
import { unbindChat } from '@/телеграмм-бот/telegram-connect';
import { groupMessages, shortText, sortGroups, type RawMessage } from './chat-threads';

/** Сколько последних сообщений поднимаем, чтобы собрать список диалогов. */
const THREAD_SCAN_LIMIT = 600;
/** Сколько сообщений показываем в открытом диалоге. */
const MESSAGES_LIMIT = 200;
/** Ограничение Телеграма — 4096 символов; оставляем запас и режем на входе. */
const MAX_MESSAGE_LEN = 3500;
/** Не больше 30 сообщений в минуту: защита от случайного спама по всем арендаторам. */
const SEND_RATE_LIMIT = 30;
const SEND_RATE_WINDOW_SECONDS = 60;

export type ChatThread = {
  /** Идентификатор диалога: `b:<businessId>` для привязанного бизнеса, `c:<chatId>` для непривязанного чата. */
  id: string;
  businessId: string | null;
  chatId: string | null;
  name: string;
  slug: string | null;
  lastText: string;
  lastAt: string;
  lastDirection: 'in' | 'out';
  messages: number;
  /** Последнее слово за арендатором — диалог ждёт ответа платформы. */
  awaiting: boolean;
  /** Чат привязан к бизнесу: можно отвечать. */
  canReply: boolean;
};

export type ChatMessage = {
  id: string;
  direction: 'in' | 'out';
  text: string;
  at: string;
};

/** Диалоги: группируем последние сообщения по бизнесу/чату. */
export async function getChatThreadsAction(): Promise<ChatThread[]> {
  if (!(await requireSuperAdminAction())) return [];
  const db = adminClient();
  try {
    const { data, error } = await db
      .from('telegram_messages')
      .select('id, direction, chat_id, business_id, text, created_at')
      .order('created_at', { ascending: false })
      .limit(THREAD_SCAN_LIMIT);
    if (error) return [];

    const grouped = groupMessages((data ?? []) as RawMessage[]);

    const businessIds = [...grouped.values()]
      .map((g) => g.businessId)
      .filter((id): id is string => Boolean(id));

    const chatIds = [...grouped.values()]
      .map((g) => (g.businessId ? null : g.chatId))
      .filter((id): id is string => Boolean(id));

    const names = new Map<string, { name: string; slug: string | null; chatId: string | null }>();
    /** Чат без business_id: входящие сообщения бота пишутся без привязки — ищем бизнес по telegram_chat_id. */
    const byChat = new Map<string, { id: string; name: string; slug: string | null }>();

    const [byId, byChatId] = await Promise.all([
      businessIds.length > 0
        ? db.from('businesses').select('id, name, slug, telegram_chat_id').in('id', businessIds)
        : Promise.resolve({ data: [] as unknown[] }),
      chatIds.length > 0
        ? db.from('businesses').select('id, name, slug, telegram_chat_id').in('telegram_chat_id', chatIds)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    for (const raw of byId.data ?? []) {
      const b = raw as { id: string; name?: string | null; slug?: string | null; telegram_chat_id?: string | null };
      names.set(b.id, { name: b.name ?? b.slug ?? 'Без названия', slug: b.slug ?? null, chatId: b.telegram_chat_id ?? null });
    }
    for (const raw of byChatId.data ?? []) {
      const b = raw as { id: string; name?: string | null; slug?: string | null; telegram_chat_id?: string | null };
      if (b.telegram_chat_id) {
        byChat.set(b.telegram_chat_id, { id: b.id, name: b.name ?? b.slug ?? 'Без названия', slug: b.slug ?? null });
      }
    }

    const threads: ChatThread[] = [];
    for (const [id, group] of grouped) {
      const business = group.businessId ? names.get(group.businessId) : undefined;
      const linked = !business && group.chatId ? byChat.get(group.chatId) : undefined;
      const chatId = business?.chatId ?? group.chatId;
      const direction: 'in' | 'out' = group.last.direction === 'in' ? 'in' : 'out';
      threads.push({
        id,
        businessId: group.businessId ?? linked?.id ?? null,
        chatId,
        name: business?.name ?? linked?.name ?? (group.chatId ? `Чат ${group.chatId}` : 'Без названия'),
        slug: business?.slug ?? linked?.slug ?? null,
        lastText: shortText(group.last.text),
        lastAt: group.last.created_at ?? '',
        lastDirection: direction,
        messages: group.count,
        awaiting: direction === 'in',
        canReply: Boolean(chatId),
      });
    }

    return sortGroups(threads);
  } catch {
    return [];
  }
}

/** Сообщения одного диалога в хронологическом порядке. */
export async function getChatMessagesAction(threadId: string): Promise<ChatMessage[]> {
  if (!(await requireSuperAdminAction())) return [];
  const key = String(threadId ?? '');
  if (!key.startsWith('b:') && !key.startsWith('c:')) return [];
  const value = key.slice(2);
  if (!value) return [];

  const db = adminClient();
  try {
    const base = db
      .from('telegram_messages')
      .select('id, direction, text, created_at, business_id, chat_id');
    const { data, error } = await (key.startsWith('b:')
      ? base.eq('business_id', value)
      : base.eq('chat_id', value).is('business_id', null)
    )
      .order('created_at', { ascending: false })
      .limit(MESSAGES_LIMIT);
    if (error) return [];

    return ((data ?? []) as RawMessage[])
      .slice()
      .reverse()
      .map((row) => ({
        id: String(row.id),
        direction: row.direction === 'in' ? 'in' : 'out',
        text: row.text ?? '',
        at: row.created_at ?? '',
      }));
  } catch {
    return [];
  }
}

/** Отправка сообщения арендатору в его Телеграм-чат. История пишется ботом автоматически. */
export async function sendChatMessageAction(
  threadId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSuperAdminAction())) return { ok: false, error: 'Нет прав' };

  const key = String(threadId ?? '');
  if (!key.startsWith('b:') && !key.startsWith('c:')) return { ok: false, error: 'Неизвестный диалог' };
  const value = key.slice(2);
  const text = String(body ?? '').trim();
  if (!text) return { ok: false, error: 'Пустое сообщение' };
  if (text.length > MAX_MESSAGE_LEN) return { ok: false, error: `Слишком длинное сообщение (максимум ${MAX_MESSAGE_LEN} символов)` };

  const allowed = await hitRateLimit('admin_chat_send', SEND_RATE_LIMIT, SEND_RATE_WINDOW_SECONDS);
  if (!allowed) return { ok: false, error: 'Слишком часто. Подождите минуту.' };

  const db = adminClient();
  let chatId: string | null = key.startsWith('c:') ? value : null;
  let businessId: string | null = key.startsWith('b:') ? value : null;

  if (businessId) {
    const { data, error } = await db
      .from('businesses')
      .select('id, telegram_chat_id')
      .eq('id', businessId)
      .maybeSingle();
    if (error) return { ok: false, error: 'Не удалось прочитать бизнес' };
    chatId = (data as { telegram_chat_id?: string | null } | null)?.telegram_chat_id ?? null;
  }

  if (!chatId) return { ok: false, error: 'У арендатора не подключён Телеграм — сообщение отправить некуда' };

  const result = await sendTelegram(chatId, text, {
    role: 'business',
    businessId,
    // Текст администратора — как есть: HTML-разметку не разбираем, чтобы «<» и «&» не ломали отправку.
    parseMode: null,
  });

  if (!result.ok) {
    // Бот заблокирован или удалён из чата — отвязываем, иначе каждое следующее сообщение упадёт так же.
    if (result.error === 'http_403') await unbindChat(chatId);
    if (result.error === 'no_token') return { ok: false, error: 'Не задан токен бизнес-бота' };
    if (result.error === 'http_403') return { ok: false, error: 'Арендатор заблокировал бота — чат отвязан' };
    return { ok: false, error: `Телеграм не принял сообщение (${result.error ?? 'ошибка отправки'})` };
  }

  await audit('platform.chat_message_sent', 'business', businessId, { chat_id: chatId, length: text.length });
  return { ok: true };
}
