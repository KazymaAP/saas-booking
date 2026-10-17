// app/[prefix]/[slug]/panel/(protected)/texts/page.tsx — тексты сайта (ТЗ §5.3, §15).
// Серверный: данные уже есть в currentOwner (кэш запроса) — дополнительных запросов к БД нет.
import { isOwner, requirePageAccess } from '../_lib/access';
import { toTextsForm } from './schema';
import { TextsForm } from './TextsForm';

export const dynamic = 'force-dynamic';

export default async function TextsPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = await requirePageAccess(params);
  const b = access.business;
  const canEdit = isOwner(access);
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="!mb-1">Тексты сайта</h1>
        <p className="!mb-0 text-[14px] text-[#595959]">
          {canEdit ? 'Оставьте поле пустым, чтобы показывать текст по умолчанию.' : 'Тексты меняет владелец. Вам доступен просмотр.'}
        </p>
      </header>
      <TextsForm
        slug={params.slug}
        canEdit={canEdit}
        defaults={toTextsForm(b.custom_texts)}
        fallbacks={{ title: b.name, subtitle: b.description ?? '' }}
      />
    </div>
  );
}
