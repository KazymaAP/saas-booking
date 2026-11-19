// app/api/gera/route.ts — выдача базы организаций для страницы /GERA.
//
// Раньше файл лежал в public/ и отдавался как статика: 3,4 МБ, 5907 организаций,
// 5573 телефона — скачать мог любой, кто знал адрес (robots.txt такой путь не закрывает,
// а noindex у самой страницы на файл не действует). Теперь данные читаются только
// действующим супер-админом, остальным — 401.
import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isSuperAdmin } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Файл читается с диска (не импортируется), поэтому путь фиксирован от корня проекта.
// На Vercel попадание файла в сборку обеспечивает outputFileTracingIncludes в next.config.mjs.
const FILE = path.join(process.cwd(), 'data', 'gera-data.json');

// Один файл на процесс: 3,4 МБ разбирать на каждый запрос незачем, но и в памяти держать вечно
// не нужно — кэш сбрасывается при перезапуске функции.
let cache: string | null = null;

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    if (cache === null) cache = await readFile(FILE, 'utf8');
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return new NextResponse(cache, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Персональные данные лидов не должны оседать ни в CDN, ни в истории браузера.
      'cache-control': 'private, no-store',
    },
  });
}
