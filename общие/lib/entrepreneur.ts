// lib/entrepreneur.ts — заявка предпринимателя с публичной страницы /auth.
// Создаёт бизнес в статусе 'new' (виден в /admin/businesses) с уникальным slug.
// Аккаунт Supabase Auth создаётся отдельно в server action (email+password).
//
// Slug: словарь транслита живёт в lib/slug.ts (ТЗ §0.4), здесь только подбор свободного значения.
// Раньше был цикл «select → если занят, +1 → select»: N запросов на N занятых адресов и гонка
// между двумя одновременными заявками (обе видели адрес свободным и падали на unique-индексе).
// Теперь занятые адреса читаются ОДНИМ запросом, кандидат выбирается в памяти, а на случай
// параллельной вставки остаётся повтор по коду 23505.
import { adminClient } from './supabase';
import { pickUniqueSlug, slugify } from './slug';

const PG_UNIQUE_VIOLATION = '23505';
const INSERT_ATTEMPTS = 3;

type SlugRow = { slug: string; slug_history: string[] | null };

// Один запрос: корень, все «корень-N» и все, у кого корень лежит в истории прежних адресов.
// root приходит из slugify() — только [a-z0-9-], поэтому подстановка в or() безопасна.
async function loadTakenSlugs(root: string): Promise<Set<string>> {
  const { data, error } = await adminClient()
    .from('businesses')
    .select('slug, slug_history')
    .or(`slug.eq.${root},slug.like.${root}-*,slug_history.cs.{${root}}`)
    .returns<SlugRow[]>();
  if (error) throw new Error(error.message);
  const taken = new Set<string>();
  for (const row of data ?? []) {
    taken.add(row.slug);
    for (const old of row.slug_history ?? []) taken.add(old);
  }
  return taken;
}

export async function createEntrepreneurRequest(input: { name: string; email: string }): Promise<{ id: string; slug: string }> {
  const db = adminClient();
  const base = slugify(input.name);
  // pickUniqueSlug мутирует набор: следующий повтор автоматически возьмёт следующий свободный адрес.
  const taken = await loadTakenSlugs(base);

  for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt++) {
    const slug = pickUniqueSlug(base, taken);
    const { data, error } = await db
      .from('businesses')
      .insert({
        name: input.name.trim().slice(0, 160),
        slug,
        status: 'new',
        emails: [input.email],
        notes: 'Заявка с /auth (предприниматель)',
        subscription_active: false,
      })
      .select('id, slug')
      .single<{ id: string; slug: string }>();
    // Адрес занял параллельный запрос — набор уже содержит наш кандидат, берём следующий.
    if (error?.code === PG_UNIQUE_VIOLATION) continue;
    if (error || !data) throw new Error(error?.message ?? 'Не удалось создать заявку');
    return { id: data.id, slug: data.slug };
  }
  throw new Error('Не удалось подобрать свободный адрес — попробуйте ещё раз');
}
