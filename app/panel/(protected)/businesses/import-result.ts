// app/panel/(protected)/businesses/import-result.ts — разбор ответа /api/import/2gis для ImportForm.
// Чистые функции без DOM и React: покрыты unit-тестами (import-result.test.ts).

type Stats = { total: number; selected: number; withEmail: number; created: number; updated: number; errors: unknown[] };

const REASON: Record<string, string> = { file: 'файл пустой или больше 10 МБ', parse: 'не удалось прочитать файл', forbidden: 'нет доступа' };

// errors обязан быть массивом: summary() читает .length — строка/объект дали бы неверное число ошибок.
function isStats(v: unknown): v is Stats {
  return typeof v === 'object' && v !== null && 'total' in v && 'created' in v && 'errors' in v && Array.isArray(v.errors);
}

function summary(s: Stats, dry: boolean): string {
  const head = dry ? 'Проверка без записи' : 'Импорт завершён';
  return `${head}: строк ${s.total}, по фильтру ${s.selected}, с email ${s.withEmail}, создано ${s.created}, обновлено ${s.updated}, ошибок ${s.errors.length}.`;
}

// Ответ API → итог для пользователя.
export function interpret(res: { status: number; body: unknown }, dry: boolean): { ok: boolean; text: string } {
  if (res.status === 401 || res.status === 403) return { ok: false, text: `Ошибка: ${REASON.forbidden}` };
  const body = typeof res.body === 'object' && res.body !== null ? (res.body as { ok?: unknown; reason?: unknown; stats?: unknown }) : null;
  if (body?.ok !== true || !isStats(body.stats)) {
    // hasOwn: reason приходит с сервера — «toString»/«constructor» не должны достать функцию из прототипа.
    const reason = typeof body?.reason === 'string' && Object.prototype.hasOwnProperty.call(REASON, body.reason) ? REASON[body.reason] : undefined;
    return { ok: false, text: `Ошибка: ${reason ?? 'сервер не ответил'}` };
  }
  return { ok: true, text: summary(body.stats, dry) };
}
