// lib/json-ld.ts — безопасная сериализация JSON-LD для <script type="application/ld+json">.
// JSON.stringify не экранирует "</script>": значение из базы (название, описание бизнеса) может закрыть
// тег и выполнить произвольный скрипт на публичной странице. Поэтому <, >, & и разделители строк
// заменяются на \u-последовательности: JSON от этого не меняет смысл, а разметка не выходит за тег.
export function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
