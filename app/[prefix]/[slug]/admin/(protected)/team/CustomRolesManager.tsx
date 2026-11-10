'use client';
// team/CustomRolesManager.tsx — создание/редактирование/удаление пользовательских ролей (шаг 5).
// Видят все, у кого есть раздел «Команда»; управляют — только с правом записи в team (по умолчанию владелец).
// Матрица прав: каждый раздел — нет / чтение / запись.
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../_components/Toast';
import { useConfirm } from '../_components/ConfirmDialog';
import { callAction } from '../_lib/client-action';
import { SECTION_KEYS, SECTION_LABELS, type SectionKey } from '@/lib/sections';
import { createCustomRole, updateCustomRole, deleteCustomRole, type CustomRoleInput } from './actions';
import type { BusinessCustomRole } from '@/lib/database.types';

type Grant = '' | 'read' | 'write';
type Grants = Record<string, Grant>;

const SECONDARY = '!min-h-[40px] !border-[var(--line)] !bg-[var(--surface)] !text-[var(--ink)]';
const DANGER = '!min-h-[40px] !border-[#b91c1c] !text-[#b91c1c]';

function emptyGrants(): Grants {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, '' as Grant])) as Grants;
}

function matrixToGrants(matrix: unknown): Grants {
  const m = (matrix ?? {}) as unknown as Record<string, string>;
  const g = emptyGrants();
  for (const k of SECTION_KEYS) {
    const v = m[k];
    g[k] = v === 'read' || v === 'write' ? v : '';
  }
  return g;
}

function buildMatrix(grants: Grants): Record<string, 'read' | 'write'> {
  const out: Record<string, 'read' | 'write'> = {};
  for (const k of SECTION_KEYS) {
    const v = grants[k];
    if (v === 'read' || v === 'write') out[k] = v;
  }
  return out;
}

// Краткое описание прав роли для списка (например: «запись: Брони; чтение: Услуги»).
function summary(matrix: unknown): string {
  const m = (matrix ?? {}) as unknown as Record<string, string>;
  const write = SECTION_KEYS.filter((k) => m[k] === 'write').map((k) => SECTION_LABELS[k]);
  const readOnly = SECTION_KEYS.filter((k) => m[k] === 'read').map((k) => SECTION_LABELS[k]);
  const parts: string[] = [];
  if (write.length) parts.push(`запись: ${write.join(', ')}`);
  if (readOnly.length) parts.push(`чтение: ${readOnly.join(', ')}`);
  return parts.length ? parts.join('; ') : 'нет доступа';
}

export function CustomRolesManager({ slug, customRoles, canManage }: { slug: string; customRoles: BusinessCustomRole[]; canManage: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [grants, setGrants] = useState<Grants>(emptyGrants());
  const [, startTransition] = useTransition();
  const [announce, setAnnounce] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const router = useRouter();

  const openCreate = useCallback(() => { setEditingId(null); setCreating(true); setName(''); setGrants(emptyGrants()); }, []);
  const openEdit = useCallback((cr: BusinessCustomRole) => {
    setCreating(false); setEditingId(cr.id); setName(cr.name); setGrants(matrixToGrants(cr.matrix));
  }, []);
  const close = useCallback(() => { setCreating(false); setEditingId(null); setName(''); setGrants(emptyGrants()); }, []);

  const setGrant = useCallback((key: SectionKey, value: Grant) => setGrants((g) => ({ ...g, [key]: value })), []);

  const save = useCallback(async () => {
    if (!name.trim()) { toast.error('Укажите название роли'); return; }
    const input: CustomRoleInput = { name: name.trim(), matrix: buildMatrix(grants) };
    setBusy(true);
    const res = editingId
      ? await callAction(() => updateCustomRole(slug, editingId, input))
      : await callAction(() => createCustomRole(slug, input));
    setBusy(false);
    if (res.ok) { toast.success(res.message ?? 'Сохранено'); close(); router.refresh(); }
    else { toast.error(res.error); setAnnounce(`Ошибка: ${res.error}`); }
  }, [name, grants, editingId, slug, toast, close, router]);

  const remove = useCallback(async (cr: BusinessCustomRole) => {
    const yes = await confirm({
      title: 'Удалить роль?',
      text: `Роль «${cr.name}» будет удалена. Сначала переназначьте сотрудников с этой ролью на другую.`,
      confirmLabel: 'Удалить', danger: true,
    });
    if (!yes) return;
    startTransition(async () => {
      const res = await callAction(() => deleteCustomRole(slug, cr.id));
      if (res.ok) { toast.success(res.message ?? 'Удалено'); router.refresh(); }
      else { toast.error(res.error); setAnnounce(`Ошибка: ${res.error}`); }
    });
  }, [confirm, slug, toast, router]);

  const formOpen = canManage && (creating || editingId !== null);

  return (
    <section aria-labelledby="custom-roles-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="custom-roles-title" className="!mb-0">Пользовательские роли</h2>
        {canManage && !formOpen && (
          <button type="button" onClick={openCreate} className={SECONDARY}>Создать роль</button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
      {dialog}

      {!canManage && (
        <p className="!mb-0 text-[14px] text-[#595959]">Управление ролями доступно только владельцу кабинета.</p>
      )}
      {canManage && customRoles.length === 0 && !formOpen && (
        <p className="!mb-0 text-[14px] text-[#595959]">Пока нет. Создайте роль с нужным набором разделов — например, «Только брони».</p>
      )}

      <ul className="grid gap-2">
        {customRoles.map((cr) => (
          <li key={cr.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-3 text-[14px]">
            <span className="min-w-0 break-all">
              <span className="font-medium">{cr.name}</span>
              <span className="text-[#595959]"> · {summary(cr.matrix)}</span>
            </span>
            {canManage && (
              <span className="flex gap-2">
                <button type="button" onClick={() => openEdit(cr)} className={SECONDARY}>Изменить</button>
                <button type="button" onClick={() => remove(cr)} aria-label={`Удалить роль ${cr.name}`} className={DANGER}>Удалить</button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {formOpen && (
        <div className="grid gap-3 rounded-xl border border-[#e5e5e5] bg-[var(--surface)] p-4">
          <h3 className="!mb-0">{editingId ? 'Изменить роль' : 'Новая роль'}</h3>
          <label className="grid gap-1 text-[14px]">
            <span className="font-medium">Название</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Название роли" />
          </label>
          <div className="grid gap-1">
            <span className="text-[14px] font-medium">Доступ по разделам</span>
            <div className="grid gap-1">
              {SECTION_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-[14px]">
                  <span className="min-w-[120px]">{SECTION_LABELS[k]}</span>
                  <select value={grants[k]} onChange={(e) => setGrant(k, e.target.value as Grant)} aria-label={`Доступ к разделу ${SECTION_LABELS[k]}`}>
                    <option value="">—</option>
                    <option value="read">чтение</option>
                    <option value="write">запись</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="btn-primary !min-h-[44px]">{busy ? 'Сохраняем…' : 'Сохранить'}</button>
            <button type="button" onClick={close} className="!min-h-[44px] !border-[var(--line)] !bg-[var(--surface)] !text-[var(--ink)]">Отмена</button>
          </div>
        </div>
      )}
    </section>
  );
}
