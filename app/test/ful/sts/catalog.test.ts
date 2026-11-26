// app/test/ful/sts/catalog.test.ts — список сервисов для раздела копий.
//
// Главный случай — отсутствие переменных окружения: 26.11.2026 сборка на Vercel падала
// на предрендере /test/ful/sts, потому что adminClient() бросал EnvError синхронно и это
// не ловилось. Тест держит поведение: нет окружения — пустой список, а не исключение.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ adminClient: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ adminClient: mocks.adminClient }));

import { loadServices } from './catalog';

// Цепочка supabase-js: from().select().eq().order() — each step возвращает себя,
// а ждёт результат только await. Так же ведёт себя настоящий построитель запросов.
function chain(result: { data: unknown[] }) {
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    order: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

function dbWith(businesses: unknown[], templates: unknown[]) {
  return {
    from: (table: string) => chain({ data: table === 'businesses' ? businesses : templates }),
  };
}

describe('loadServices', () => {
  beforeEach(() => {
    mocks.adminClient.mockReset();
  });

  it('без переменных окружения возвращает пустой список, а не бросает', async () => {
    mocks.adminClient.mockImplementation(() => {
      throw new Error('Переменные окружения не настроены:\n  - NEXT_PUBLIC_SUPABASE_URL: не задана');
    });

    await expect(loadServices()).resolves.toEqual([]);
  });

  it('сбой запроса к базе тоже даёт пустой список', async () => {
    mocks.adminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.reject(new Error('network down')),
          }),
        }),
      }),
    });

    await expect(loadServices()).resolves.toEqual([]);
  });

  it('подставляет префикс ниши из vertical_templates', async () => {
    mocks.adminClient.mockReturnValue(
      dbWith(
        [{ slug: 'vippro', name: 'Вип Про', status: 'client', vertical_template_id: 't1' }],
        [{ id: 't1', url_prefix: 'd' }],
      ),
    );

    await expect(loadServices()).resolves.toEqual([
      { slug: 'vippro', name: 'Вип Про', status: 'client', prefix: 'd' },
    ]);
  });

  it('без шаблона или без данных берёт префикс d', async () => {
    mocks.adminClient.mockReturnValue(
      dbWith([{ slug: 'x', name: 'X', status: 'client', vertical_template_id: null }], []),
    );

    await expect(loadServices()).resolves.toEqual([{ slug: 'x', name: 'X', status: 'client', prefix: 'd' }]);
  });

  it('пустая база — пустой список', async () => {
    mocks.adminClient.mockReturnValue(dbWith([], []));

    await expect(loadServices()).resolves.toEqual([]);
  });
});
