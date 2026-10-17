// app/panel/(protected)/_lib/action.ts — общий каркас server actions супер-админки.
// Каждое действие: проверка прав → валидация zod → ≤ 1–2 SQL → audit → revalidatePath → типизированный результат.
// Результат всегда сериализуемый объект: клиент показывает toast и откатывает optimistic при ok=false.
import { z } from 'zod';
import { ForbiddenError, requireSuperAdmin } from './guard';
import { errorMessage, logError } from '@/lib/log';

export type FieldErrors = Record<string, string>;

export type ActionResult<T = null> =
  | { ok: true; message: string; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

// Итог массовой операции: какие id изменены, какие нет (статус уже другой, удалён и т. п.).
export type BulkResult = { ok: boolean; message: string; done: string[]; skipped: string[] };

export const MAX_BULK = 500;
export const MSG_FORBIDDEN = 'Нет доступа. Войдите заново.';
export const MSG_FAIL = 'Не удалось. Попробуйте ещё раз.';

export const uuid = z.string().uuid();
export const idList = z.array(uuid).min(1, 'Ничего не выбрано').max(MAX_BULK, `Не больше ${MAX_BULK} за раз`);

export function ok<T>(message: string, data: T): ActionResult<T> {
  return { ok: true, message, data };
}

export function fail(error: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

// Первая ошибка zod по каждому полю — для aria-describedby у конкретного input.
export function zodFieldErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function zodFail(err: z.ZodError): ActionResult<never> {
  return fail('Проверьте поля формы', zodFieldErrors(err));
}

// redirect()/notFound() внутри действия бросают служебную ошибку с digest NEXT_* — её нельзя глотать.
function isNextControlFlow(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');
}

// Обёртка: права + перехват неожиданных ошибок с записью в журнал (без PII — маскирует lib/log).
export async function guarded<T>(name: string, run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requireSuperAdmin();
    return await run();
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    if (e instanceof ForbiddenError) return fail(MSG_FORBIDDEN);
    await logError('admin', errorMessage(e), { action: name });
    return fail(MSG_FAIL);
  }
}

// То же для массовых операций: результат с разбивкой done/skipped (отчёт о частичном выполнении).
export async function guardedBulk(name: string, ids: unknown, run: (ids: string[]) => Promise<BulkResult>): Promise<BulkResult> {
  const parsed = idList.safeParse(Array.isArray(ids) ? [...new Set(ids)] : ids);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? MSG_FAIL, done: [], skipped: [] };
  try {
    await requireSuperAdmin();
    return await run(parsed.data);
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    if (e instanceof ForbiddenError) return { ok: false, message: MSG_FORBIDDEN, done: [], skipped: parsed.data };
    await logError('admin', errorMessage(e), { action: name, count: parsed.data.length });
    return { ok: false, message: MSG_FAIL, done: [], skipped: parsed.data };
  }
}

// Сообщение для отчёта: «Готово: 8. Пропущено: 2 (статус уже изменён)».
export function bulkReport(verb: string, done: string[], requested: string[]): BulkResult {
  const doneSet = new Set(done);
  const skipped = requested.filter((id) => !doneSet.has(id));
  const tail = skipped.length ? `. Пропущено: ${skipped.length} (статус уже изменён или запись удалена)` : '';
  return { ok: done.length > 0 || requested.length === 0, message: `${verb}: ${done.length}${tail}`, done, skipped };
}

// Строки FormData → объект для zod (только string-значения; файлы игнорируются).
export function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === 'string') out[k] = v;
  });
  return out;
}
