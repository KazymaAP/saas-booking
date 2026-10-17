// app/panel/(protected)/funnel/constants.ts — лимиты генерации. Отдельный модуль: файл 'use server'
// может экспортировать только async-функции, а клиенту (GenerateProgress) эти числа тоже нужны.

// Сколько прототипов генерируется за один вызов server action. Клиент шлёт пачки по очереди.
export const GENERATE_CHUNK = 5;
// Верхняя граница одного запуска (ТЗ §11: генерация пачками, не всё сразу).
export const GENERATE_MAX = 100;
// Интервал опроса прогресса (ТЗ §13.2 шаг 2: polling раз в 2 секунды).
export const POLL_MS = 2000;
// Размер страницы в шагах воронки (промт: ровно 50 записей).
export const FUNNEL_PAGE = 50;
