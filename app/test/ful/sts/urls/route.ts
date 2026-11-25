// app/test/ful/sts/urls/route.ts — текстовый список всех адресов раздела копий.
//
// Зачем: ИИ-агент (Claude и подобные) открывает только те ссылки, которые уже есть в диалоге.
// HTML-оглавление он читает, но по кнопкам перейти не может. Здесь те же адреса лежат
// простым текстом — один заход, и все ссылки у агента в контексте.
//
// Разбито на части по 33 сервиса: один файл на ~2900 адресов весит под 200 КБ,
// и читающий инструмент обрезал бы его на середине. Каждая часть перечисляет остальные.
import type { NextRequest } from 'next/server';

import { STAFF_ROLES } from '@/lib/auth-roles';
import { COPY_PREFIX } from '@/lib/copy-mode-paths';
import { allPaths, loadServices, servicePaths } from '../catalog';

export const revalidate = 600;

const SITE = 'https://www.zapishisya.ru';
const SERVICES_PER_PART = 33;

export async function GET(req: NextRequest) {
  const requested = Number(new URL(req.url).searchParams.get('part') ?? '1');
  const services = await loadServices();
  const parts = Math.max(1, Math.ceil(services.length / SERVICES_PER_PART));
  const part = Math.min(Math.max(Number.isFinite(requested) ? Math.trunc(requested) : 1, 1), parts);

  const base = `${SITE}${COPY_PREFIX}`;
  const roles = STAFF_ROLES as readonly string[];
  const slice = services.slice((part - 1) * SERVICES_PER_PART, part * SERVICES_PER_PART);

  const lines: string[] = [
    '# Копии страниц сайта — все адреса',
    `# Базовый адрес: ${base}`,
    `# Часть ${part} из ${parts}. Остальные части:`,
    ...Array.from({ length: parts }, (_, i) => `#   ${base}/urls${i === 0 ? '' : `?part=${i + 1}`}`),
    '# Формат: один абсолютный адрес в строке. Все страницы открываются без входа,',
    '# показывают настоящие данные и работают только на чтение: правки не сохраняются.',
    '',
  ];

  if (part === 1) {
    // Публичные страницы и студия — они не зависят от списка сервисов.
    const staticPaths = allPaths([], roles);
    lines.push('# Публичные страницы и супер-админка');
    lines.push(...staticPaths.map((p) => `${base}${p === '/' ? '' : p}`));
    lines.push('');
  }

  for (const service of slice) {
    // Статус в заголовке не нужен: в списке только опубликованные сервисы (status='client').
    lines.push(`# Сервис ${service.slug} — ${service.name}`);
    lines.push(...servicePaths(service, roles).map((p) => `${base}${p}`));
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
}
