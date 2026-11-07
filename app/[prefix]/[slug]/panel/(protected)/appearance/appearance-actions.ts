// app/[prefix]/[slug]/panel/(protected)/settings/appearance-actions.ts — выбор стиля кабинета и сайта.
// Только владелец. Значения кладём в businesses.custom_texts под служебными ключами (_panel_theme,
// _site_theme): форма текстов сливает ключи и служебные не затирает, миграция не нужна.
'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase';
import { logError } from '@/lib/log';
import { actionAccess, OWNER_ONLY } from '../_lib/access';
import { ERR, fail, ok, type ActionResult } from '../_lib/result';
import { AUTO_KEY, PANEL_THEME_KEY, SITE_THEME_KEY, APPEARANCES } from '@/lib/appearance';

const ALLOWED = new Set<string>([AUTO_KEY, ...APPEARANCES.map((a) => a.key)]);
const AppearanceInput = z.object({ panel: z.string(), site: z.string() });

function normalize(value: string): string | null {
  const v = value.trim();
  return ALLOWED.has(v) ? v : null;
}

export async function saveAppearance(
  slug: string,
  input: { panel: string; site: string },
): Promise<ActionResult> {
  const access = await actionAccess(slug, OWNER_ONLY);
  if (!access) return fail(ERR.ownerOnly);

  // Экшен вызывается с клиента: null/undefined/объект вместо строки не должен ронять
  // server action без внятного сообщения.
  const parsed = AppearanceInput.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid);
  const panel = normalize(parsed.data.panel);
  const site = normalize(parsed.data.site);
  if (!panel || !site) return fail(ERR.invalid);

  // Не берём custom_texts из сессии: это снимок на момент входа. Пока владелец держал вкладку
  // открытой, он мог сохранить тексты сайта — запись из снимка затерла бы их. Читаем свежую строку.
  const db = adminClient();
  const { data: fresh, error: readError } = await db
    .from('businesses')
    .select('custom_texts')
    .eq('id', access.business.id)
    .maybeSingle();
  if (readError) {
    await logError('admin', 'appearance: read custom_texts failed', { error: readError.message });
    return fail(ERR.server);
  }
  const current = (fresh?.custom_texts ?? access.business.custom_texts ?? {}) as Record<string, string>;
  const next: Record<string, string> = { ...current };
  // «auto» — это отсутствие ключа: стиль берётся из ниши бизнеса.
  if (panel === AUTO_KEY) delete next[PANEL_THEME_KEY];
  else next[PANEL_THEME_KEY] = panel;
  if (site === AUTO_KEY) delete next[SITE_THEME_KEY];
  else next[SITE_THEME_KEY] = site;

  const { error } = await db
    .from('businesses')
    .update({ custom_texts: next })
    .eq('id', access.business.id);
  if (error) {
    await logError('admin', 'appearance: save failed', { error: error.message });
    return fail(ERR.server);
  }

  revalidatePath('/[prefix]/[slug]/panel', 'layout');
  revalidatePath('/[prefix]/[slug]', 'page');
  return ok('Стиль сохранён');
}
