// app/[prefix]/[slug]/admin/(protected)/team/actions.ts — команда: приглашение менеджера и удаление (ТЗ §5.6, §13.10).
// Только владелец. Пароль нового менеджера возвращается в ответе action и живёт только в состоянии
// клиентского компонента — cookie sa_flash больше не используется (пароль не оседает в браузере и логах прокси).
'use server';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { writeAccess } from '../_lib/access';
import { ERR, fail, ok, UUID_RE, zodFieldErrors, type ActionResult } from '../_lib/result';
import { InviteSchema, MAX_MANAGERS, type InviteInput, type InviteResult, type MemberRow } from './schema';
import { z } from 'zod';
import { SECTION_KEYS, isCustomRole, customRoleId } from '@/lib/sections';

// 12 байт → 16 символов base64url: ~96 бит энтропии, легко продиктовать/скопировать.
const PASSWORD_BYTES = 12;
const TEAM_PATH = '/[prefix]/[slug]/admin/team';

// lib/log.ts (чужая зона) не знает источника 'auth' — пишем в тот же audit_log с тем же префиксом error:. Без email (ПД).
async function logAuthError(message: string, payload: Record<string, unknown>): Promise<void> {
  await audit('error:auth', 'auth', null, { message, ...payload }).catch(() => undefined);
}

export async function inviteManager(slug: string, input: InviteInput): Promise<ActionResult<InviteResult>> {
  const access = await writeAccess(slug, 'team');
  if (!access) return fail(ERR.ownerOnly);
  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));
  const { email, role } = parsed.data;
  // Сотрудник не может пригласить владельца. Действия смены собственной роли в проекте нет,
  // поэтому «повысить себя» через приглашение невозможно: writeAccess('team') пропускает только owner.
  if (access.member.role !== 'owner' && role === 'owner') return fail(ERR.ownerOnly);
  const businessId = access.business.id;
  const db = adminClient();

  // Кастомную роль можно назначить, только если она принадлежит этому бизнесу.
  if (isCustomRole(role)) {
    const cid = customRoleId(role);
    const { data: cr } = await db.from('business_custom_roles').select('id').eq('id', cid).eq('business_id', businessId).maybeSingle();
    if (!cr) return fail(ERR.invalid, { role: 'Роль не найдена' });
  }

  // Один запрос: и проверка дубля, и лимит менеджеров.
  const { data: members, error: listError } = await db
    .from('admin_users').select('email, role').eq('business_id', businessId)
    .returns<Pick<MemberRow, 'email' | 'role'>[]>();
  if (listError) return fail(ERR.server);
  if ((members ?? []).some((m) => m.email?.toLowerCase() === email)) return fail(ERR.invalid, { email: 'Этот человек уже в команде' });
  if ((members ?? []).filter((m) => m.role !== 'owner').length >= MAX_MANAGERS) return fail(`Не больше ${MAX_MANAGERS} сотрудников`);

  const password = randomBytes(PASSWORD_BYTES).toString('base64url');
  const { data: created, error: authError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !created.user) {
    // Самая частая причина — email уже зарегистрирован (например, менеджер другого бизнеса).
    return fail(ERR.invalid, { email: 'Этот email уже зарегистрирован. Укажите другой' });
  }

  const { data: member, error: insertError } = await db
    .from('admin_users')
    .insert({ business_id: businessId, email, role: role ?? 'manager', auth_user_id: created.user.id })
    .select('id, email, role')
    .single<MemberRow>();
  if (insertError || !member) {
    // Откат: без строки admin_users аккаунт бесполезен и занимает email.
    await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    await logAuthError('panel: manager insert failed', { business_id: businessId, code: insertError?.code });
    return fail(ERR.server);
  }

  await audit('manager_invite', 'business', businessId, { member_id: member.id }).catch(() => undefined);
  revalidatePath(TEAM_PATH, 'page');
  return ok('Менеджер добавлен', { member, password });
}

export async function removeMember(slug: string, id: string): Promise<ActionResult> {
  const access = await writeAccess(slug, 'team');
  if (!access) return fail(ERR.ownerOnly);
  if (!UUID_RE.test(id)) return fail(ERR.invalid);

  // Один DELETE … RETURNING: business_id и «не владелец» в WHERE — чужого участника и владельца удалить нельзя,
  // но менеджеров и кастомные роли удалять можно.
  const { data, error } = await adminClient()
    .from('admin_users')
    .delete()
    .eq('id', id)
    .eq('business_id', access.business.id)
    .neq('role', 'owner')
    .select('auth_user_id')
    .returns<{ auth_user_id: string | null }[]>();
  if (error) return fail(ERR.server);
  const removed = data?.[0];
  if (!removed) return fail(ERR.notFound);

  // Удаляем и auth-аккаунт: иначе бывший менеджер сохранит рабочий логин.
  if (removed.auth_user_id) {
    const { error: authError } = await adminClient().auth.admin.deleteUser(removed.auth_user_id);
    if (authError) await logAuthError('panel: manager auth delete failed', { member_id: id });
  }
  await audit('manager_remove', 'business', access.business.id, { member_id: id }).catch(() => undefined);
  revalidatePath(TEAM_PATH, 'page');
  return ok('Доступ менеджера закрыт');
}

// ---------- Пользовательские роли (шаг 5) ----------

// Матрица прав кастомной роли: раздел → 'read' | 'write'. Только известные разделы.
const CustomRoleSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(60, 'Слишком длинное название'),
  matrix: z.record(z.enum(['read', 'write']))
    .refine((m) => Object.keys(m).every((k) => (SECTION_KEYS as readonly string[]).includes(k)), 'Неизвестный раздел'),
});
export type CustomRoleInput = z.infer<typeof CustomRoleSchema>;

export async function createCustomRole(slug: string, input: CustomRoleInput): Promise<ActionResult<{ id: string }>> {
  const access = await writeAccess(slug, 'team');
  if (!access) return fail(ERR.ownerOnly);
  const parsed = CustomRoleSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));
  const businessId = access.business.id;
  const { data, error } = await adminClient()
    .from('business_custom_roles')
    .insert({ business_id: businessId, name: parsed.data.name, matrix: parsed.data.matrix })
    .select('id').single<{ id: string }>();
  if (error) return fail(ERR.server);
  await audit('custom_role_create', 'business', businessId, { role_id: data.id }).catch(() => undefined);
  revalidatePath(TEAM_PATH, 'page');
  return ok('Роль создана', { id: data.id });
}

export async function updateCustomRole(slug: string, id: string, input: CustomRoleInput): Promise<ActionResult> {
  const access = await writeAccess(slug, 'team');
  if (!access) return fail(ERR.ownerOnly);
  if (!UUID_RE.test(id)) return fail(ERR.invalid);
  const parsed = CustomRoleSchema.safeParse(input);
  if (!parsed.success) return fail(ERR.invalid, zodFieldErrors(parsed.error));
  const { error } = await adminClient()
    .from('business_custom_roles')
    .update({ name: parsed.data.name, matrix: parsed.data.matrix })
    .eq('id', id).eq('business_id', access.business.id);
  if (error) return fail(ERR.server);
  await audit('custom_role_update', 'business', access.business.id, { role_id: id }).catch(() => undefined);
  revalidatePath(TEAM_PATH, 'page');
  return ok('Роль обновлена');
}

export async function deleteCustomRole(slug: string, id: string): Promise<ActionResult> {
  const access = await writeAccess(slug, 'team');
  if (!access) return fail(ERR.ownerOnly);
  if (!UUID_RE.test(id)) return fail(ERR.invalid);
  // Не даём удалить роль, пока есть сотрудники с ней: сначала переназначьте.
  const { data: used } = await adminClient()
    .from('admin_users').select('id').eq('business_id', access.business.id).eq('role', `custom:${id}`).limit(1)
    .returns<{ id: string }[]>();
  if ((used ?? []).length) return fail('Сначала переназначьте сотрудников с этой ролью');
  const { error } = await adminClient()
    .from('business_custom_roles').delete().eq('id', id).eq('business_id', access.business.id);
  if (error) return fail(ERR.server);
  await audit('custom_role_delete', 'business', access.business.id, { role_id: id }).catch(() => undefined);
  revalidatePath(TEAM_PATH, 'page');
  return ok('Роль удалена');
}
