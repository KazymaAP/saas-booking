// data/rules.ts — правила удаления аккаунта (ТЗ §32). Чистый модуль: используется формой, action и тестами.
export const DELETION_GRACE_DAYS = 30;

// Регистр и пробелы по краям не важны: на телефоне клавиатура часто ставит заглавную первую букву.
export function confirmationMatches(input: string, slug: string): boolean {
  return input.trim().toLowerCase() === slug.toLowerCase();
}
