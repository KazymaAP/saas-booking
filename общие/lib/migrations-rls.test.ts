// lib/migrations-rls.test.ts — статическая проверка миграций: каждая созданная таблица должна попасть под RLS.
// Зачем: Supabase по умолчанию выдаёт anon/authenticated права на все таблицы схемы public, поэтому таблица
// без RLS читается и пишется публичным anon-ключом через PostgREST. Миграция 0007 включает RLS циклом по всем
// существующим таблицам, но таблицы, созданные ПОСЛЕ неё, этим циклом не покрываются — так и появилась
// business_custom_roles без RLS (закрыта в 0026).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const MIGRATIONS_DIR = 'supabase/migrations';
// Номер миграции, в которой стоит цикл `alter table … enable row level security` по всем таблицам public.
const RLS_SWEEP_MIGRATION = 7;

const files = readdirSync(root(MIGRATIONS_DIR))
  .filter((name) => name.endsWith('.sql'))
  .sort();

/** SQL без строчных комментариев: иначе примеры вида «create table if not exists» в пояснениях ловятся как DDL. */
const read = (name: string) =>
  readFileSync(root(`${MIGRATIONS_DIR}/${name}`), 'utf8')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('--') ? '' : line.replace(/--.*$/, '')))
    .join('\n');

/** Номер миграции из имени файла: `0007_rls_audit.sql` → 7. */
function numberOf(name: string): number {
  const match = /^(\d{4})_/.exec(name);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

type CreatedTable = { table: string; migration: string; number: number };

function createdTables(): CreatedTable[] {
  const out: CreatedTable[] = [];
  for (const migration of files) {
    const source = read(migration);
    // Имя таблицы — только литерал: `create table if not exists public.foo (`. Динамический SQL
    // (`execute format('create table %I …')`) сюда не попадает, его таблицы создаются из шаблона-родителя.
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const table = match[1];
      if (table === undefined) continue;
      // Партиции создаются как `create table … partition of …` — RLS наследуется от родителя.
      const tail = source.slice(match.index, match.index + 400);
      if (/partition\s+of/i.test(tail)) continue;
      // 0014 создаёт bookings_new как временную копию партиционированной таблицы и переименовывает её.
      if (table === 'bookings_new') continue;
      out.push({ table, migration, number: numberOf(migration) });
    }
  }
  return out;
}

/** Таблицы, для которых в миграциях есть явный `alter table … enable row level security`. */
function explicitRlsTables(): Set<string> {
  const enabled = new Set<string>();
  for (const migration of files) {
    const source = read(migration);
    const re = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const table = match[1];
      if (table !== undefined) enabled.add(table);
    }
  }
  return enabled;
}

describe('RLS в миграциях', () => {
  it('цикл включения RLS из 0007 на месте — на нём держится исключение для старых таблиц', () => {
    const sweep = read(files.find((name) => numberOf(name) === RLS_SWEEP_MIGRATION) ?? '');
    expect(sweep).toMatch(/alter\s+table\s+public\.%I\s+enable\s+row\s+level\s+security/i);
    expect(sweep).toMatch(/for\s+v\s+in\s+select\s+c\.relname/i);
  });

  it('каждая таблица либо включила RLS явно, либо создана до цикла 0007', () => {
    const explicit = explicitRlsTables();
    const uncovered = createdTables()
      .filter(({ table, number }) => explicit.has(table) === false && number > RLS_SWEEP_MIGRATION)
      .map(({ table, migration }) => `${table} (${migration})`);
    expect(uncovered).toEqual([]);
  });

  it('business_custom_roles закрыта от anon (регрессия 0022 → 0026)', () => {
    expect(explicitRlsTables().has('business_custom_roles')).toBe(true);
    expect(read('0026_rls_custom_roles.sql')).toMatch(/p_business_custom_roles_deny/);
  });

  it('прямая anon-вставка в bookings закрыта (0029)', () => {
    const lockdown = read('0029_bookings_anon_insert_lockdown.sql');
    expect(lockdown).toMatch(/drop\s+policy\s+if\s+exists\s+p_bookings_anon_ins/i);
    expect(lockdown).toMatch(/revoke\s+insert/i);
    // Политику не должна возвращать ни одна более поздняя миграция.
    const later = files.filter((name) => numberOf(name) > 29 && /create\s+policy\s+p_bookings_anon_ins/i.test(read(name)));
    expect(later).toEqual([]);
  });
});
