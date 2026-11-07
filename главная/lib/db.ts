// app/panel/(protected)/_lib/db.ts — разбор ответов Supabase для страниц и actions зоны.
// Supabase не бросает исключений: при сбое приходит { data: null, count: null, error }. Если писать `count ?? 0`,
// сбой базы выглядит как «записей нет» — счётчики воронки обнуляются, кнопки блокируются, ниша «пустая».
// Эти хелперы превращают error в исключение: страница уходит в error.tsx («Повторить»), action — в guarded (журнал + тост).

type DbError = { message: string } | null;

// Строки запроса; null без ошибки (maybeSingle не нашёл) — пустой массив.
export function rowsOf<T>(res: { data: T[] | null; error: DbError }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

// Число из count: 'exact' (в том числе head: true). null без ошибки бывает только без count — считаем 0.
export function countOf(res: { count: number | null; error: DbError }): number {
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}
