// _lib/form.ts — связка react-hook-form с ответом server action.
// Сервер проверяет те же zod-схемы; если он нашёл ошибку, которую клиент пропустил (например, гонка или
// обход клиента), — подсвечиваем те же поля тем же текстом, а фокус ставим на первое.
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { FieldErrors } from './result';

export function applyServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: FieldErrors | undefined,
  known: readonly Path<T>[],
): boolean {
  if (!fieldErrors) return false;
  let first = true;
  let applied = false;
  for (const name of known) {
    const message = fieldErrors[name];
    if (!message) continue;
    setError(name, { type: 'server', message }, { shouldFocus: first });
    first = false;
    applied = true;
  }
  return applied;
}
