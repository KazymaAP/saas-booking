// app/[prefix]/[slug]/panel/(protected)/texts/actions.ts — сохранение текстов сайта (ТЗ §5.3, §13.10).
// Только владелец (manager — просмотр). Служебные ключи custom_texts (_panel_theme, _site_theme,
// произвольные поля владельца) не затираются: mergeTexts складывает их со свежей строкой из БД.
'use server';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { actionAccess, OWNER_ONLY } from '../_lib/access';
import { ERR, fail, ok, zodFieldErrors, type ActionResult } from '../_lib/result';
import { TextsSchema, mergeTexts, type TextsValues } from './schema';

export async function saveTexts(slug: string, input: TextsValues): Promise<ActionResult> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const parsed = TextsSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const db = adminClient();
  // Сессия хранит снимок бизнеса на момент входа. Если владелец сменил стиль в другой вкладке,
  // запись поверх снимка вернула бы старый стиль. Берём актуальную строку перед UPDATE.
  const { data: fresh, error: readError } = await db
    .from('businesses')
    .select('custom_texts')
    .eq('id', access.business.id)
    .maybeSingle();
  if (readError) {
    await logError('admin', 'texts: read custom_texts failed', { error: readError.message });
    return fail(ERR.server);
  }
  const current = fresh?.custom_texts ?? access.business.custom_texts;

  const { error } = await db
    .from('businesses')
    .update({ custom_texts: mergeTexts(current, parsed.data) })
    .eq('id', access.business.id);
  if (error) {
    await logError('admin', 'texts: save failed', { error: error.message });
    return fail(ERR.server);
  }

  revalidatePath('/[prefix]/[slug]/panel/texts', 'page');
  revalidatePath('/[prefix]/[slug]', 'page');
  return ok('Тексты сохранены — уже на сайте');
}
