// app/[prefix]/[slug]/panel/(protected)/texts/page.tsx — тексты сайта: заголовок, подзаголовок, о нас, кнопка (ТЗ §5.3, §15 шаблон текстов).
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const KEYS = ['hero_title', 'hero_subtitle', 'about', 'cta'] as const;
const LABEL: Record<(typeof KEYS)[number], string> = {
  hero_title: 'Заголовок',
  hero_subtitle: 'Подзаголовок',
  about: 'О нас',
  cta: 'Текст кнопки записи',
};
const LIMIT: Record<(typeof KEYS)[number], number> = { hero_title: 120, hero_subtitle: 200, about: 1500, cta: 30 };

export default async function TextsPage({ params, searchParams }: { params: { prefix: string; slug: string }; searchParams: { saved?: string } }) {
  const access = (await currentOwner(params.slug))!;
  const texts = (access.business.custom_texts ?? {}) as Record<string, string>;

  async function save(formData: FormData) {
    'use server';
    const owner = await currentOwner(params.slug);
    if (!owner) redirect(`/${params.prefix}/${params.slug}/panel/login`);
    const next: Record<string, string> = {};
    for (const k of KEYS) next[k] = String(formData.get(k) ?? '').trim().slice(0, LIMIT[k]);
    await adminClient().from('businesses').update({ custom_texts: next }).eq('id', owner!.business.id);
    revalidatePath(`/${params.prefix}/${params.slug}`);
    redirect(`/${params.prefix}/${params.slug}/panel/texts?saved=1`);
  }

  return (
    <div className="grid max-w-[560px] gap-4">
      <h1 className="text-[24px] font-semibold">Тексты сайта</h1>
      {searchParams.saved && <p className="rounded-md bg-[#f5f5f5] p-3 text-[14px]">Сохранено</p>}
      <form action={save} className="grid gap-4">
        {KEYS.map((k) => (
          <label key={k} className="grid gap-1 text-[14px]">
            {LABEL[k]} <span className="text-[#666666]">(до {LIMIT[k]} символов)</span>
            {k === 'about' || k === 'hero_subtitle'
              ? <textarea name={k} defaultValue={texts[k] ?? ''} maxLength={LIMIT[k]} className="input h-auto py-2" />
              : <input name={k} defaultValue={texts[k] ?? ''} maxLength={LIMIT[k]} className="input" />}
          </label>
        ))}
        <button type="submit" className="btn-primary">Сохранить</button>
      </form>
    </div>
  );
}
