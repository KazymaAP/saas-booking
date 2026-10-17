// app/panel/(protected)/_lib/network.ts — отказ server action на клиенте (сеть пропала, 502, деплой посреди запроса).
// Server action в этом случае не возвращает ActionResult, а отклоняет промис: без обработки transition падает молча —
// тоста нет, optimistic-значение откатывается без объяснения. Модуль без серверных импортов: безопасен для 'use client'.

export const MSG_NETWORK = 'Сервер не ответил. Ничего не изменено — попробуйте ещё раз.';

type Failed = { ok: false; error: string };

// Результат action или «ошибка сети» в форме обычного отказа — UI обрабатывает одной веткой.
export async function orNetworkError<R>(call: Promise<R>): Promise<R | Failed> {
  try {
    return await call;
  } catch {
    return { ok: false, error: MSG_NETWORK };
  }
}
