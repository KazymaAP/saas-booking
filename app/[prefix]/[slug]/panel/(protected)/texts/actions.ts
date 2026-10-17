// app/[prefix]/[slug]/panel/(protected)/texts/actions.ts — сохранение текстов сайта (ТЗ §5.3, §13.10).
// Только владелец (manager — просмотр). Один UPDATE: остальные ключи custom_texts берутся из уже загруженного
// бизнеса (currentOwner в этом же запросе) и сохраняются.
'use server';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { actionAccess, OWNER_ONLY } from '../_lib/access';
import { ERR, fail, ok, zodFieldErrors, type ActionResult } from '../_lib/result';
import { TextsSchema, mergeTexts, type TextsValues } from './schema';

export async function saveTexts(slug: string, input: TextsValues): Promise<ActionResult> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);
  const parsed = TextsSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));

  const { error } = await adminClient()
    .from('businesses')
    .update({ custom_texts: mergeTexts(access.business.custom_texts, parsed.data) })
    .eq('id', access.business.id);
  if (error) return fail(ERR.server);

  revalidatePath('/[prefix]/[slug]/panel/texts', 'page');
  revalidatePath('/[prefix]/[slug]', 'page');
  return ok('Тексты сохранены — уже на сайте');
}
