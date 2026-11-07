'use server';
// app/partner/ready-actions.ts — действия партнёра по готовым сервисам.
import { revalidatePath } from 'next/cache';
import { readPartnerSession } from '@/lib/partners-auth';
import { getNicheThemeBySlug } from '@/шаблоны/_shared/themes';
import { takeReadyService, setPartnerOutcome, setReadyCover, listReadyPhotos, setReadyPhotos, type PartnerOutcome } from '@/lib/ready-services';

export async function takeReadyServiceAction(id: string) {
  const session = readPartnerSession();
  if (!session) return { ok: false as const, error: 'Не авторизован' };
  try {
    await takeReadyService(session.partnerId, id);
    revalidatePath('/partner');
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setPartnerCoverAction(id: string, useCover: boolean) {
  const session = readPartnerSession();
  if (!session) return { ok: false as const, error: 'Не авторизован' };
  try {
    const res = await setReadyCover(id, useCover, session.partnerId);
    revalidatePath('/partner');
    revalidatePath(`/${res.niche}/${res.slug}`);
    const theme = getNicheThemeBySlug(res.niche);
    if (theme) revalidatePath(`/${theme.prefix}/${res.slug}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setOutcomeAction(id: string, outcome: PartnerOutcome) {
  const session = readPartnerSession();
  if (!session) return { ok: false as const, error: 'Не авторизован' };
  try {
    await setPartnerOutcome(session.partnerId, id, outcome);
    revalidatePath('/partner');
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Фото готового сервиса: что стоит сейчас и из чего выбирать. */
export async function listReadyPhotosAction(id: string) {
  const session = readPartnerSession();
  if (!session) return { ok: false as const, error: 'Не авторизован' };
  try {
    const data = await listReadyPhotos(session.partnerId, id);
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Заменить галерею сайта выбранными фото (первое станет обложкой). */
export async function setReadyPhotosAction(id: string, urls: string[]) {
  const session = readPartnerSession();
  if (!session) return { ok: false as const, error: 'Не авторизован' };
  try {
    const res = await setReadyPhotos(session.partnerId, id, urls);
    revalidatePath('/partner');
    revalidatePath(`/${res.niche}/${res.slug}`);
    const theme = getNicheThemeBySlug(res.niche);
    if (theme) revalidatePath(`/${theme.prefix}/${res.slug}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
