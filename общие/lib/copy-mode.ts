// общие/lib/copy-mode.ts — временный раздел /test/ful/sts: копии всех страниц сайта без входа.
//
// Как это устроено: middleware видит путь с префиксом /test/ful/sts, срезает его и переписывает
// запрос на настоящий маршрут, добавляя заголовки x-copy-mode и x-copy-path. Адрес в браузере
// остаётся с префиксом, а рендерится тот же компонент, что и на оригинале — поэтому копия
// выглядит и работает одинаково, без дублирования кода.
//
// Авторизация в режиме копии не запрашивается: супер-админка считается доступной, а кабинет
// бизнеса открывается от лица его владельца. Роль для страниц сотрудников берётся из адреса.
//
// Удаление раздела: убрать блок COPY_PREFIX в middleware.ts, папку app/test/ful и этот файл.
import { headers } from 'next/headers';

import { COPY_MODE_HEADER, COPY_PATH_HEADER, COPY_PREFIX } from './copy-mode-paths';

export { COPY_MODE_HEADER, COPY_PATH_HEADER, COPY_PREFIX };

function header(name: string): string | null {
  try {
    return headers().get(name);
  } catch {
    // Вне запроса (сборка, скрипты) заголовков нет — режим копии выключен.
    return null;
  }
}

// true — запрос пришёл на копию страницы. Все проверки доступа это учитывают.
export function inCopyMode(): boolean {
  return header(COPY_MODE_HEADER) === '1';
}

// Путь оригинала внутри копии: '/d/vippro/admin/services'. Нужен, чтобы понять запрошенную роль.
export function copyPath(): string {
  return header(COPY_PATH_HEADER) ?? '';
}

// Ссылка внутри копии: '/admin' → '/test/ful/sts/admin'. Уже префиксованные не трогаем.
export function copyHref(path: string): string {
  if (path === COPY_PREFIX || path.startsWith(`${COPY_PREFIX}/`)) return path;
  return `${COPY_PREFIX}${path}`;
}
