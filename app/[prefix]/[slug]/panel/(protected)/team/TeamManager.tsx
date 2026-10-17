'use client';
// team/TeamManager.tsx — список участников, приглашение и удаление менеджера (ТЗ §5.6, §13.10).
// Клиентский: optimistic-удаление с откатом, пароль нового менеджера хранится только в состоянии
// компонента (исчезает при уходе со страницы) — без cookie и без URL.
import { useCallback, useOptimistic, useState, useTransition } from 'react';
import { useToast } from '../_components/Toast';
import { useConfirm } from '../_components/ConfirmDialog';
import { callAction } from '../_lib/client-action';
import { removeMember } from './actions';
import { InviteForm } from './InviteForm';
import { CredentialsCard } from './CredentialsCard';
import { MAX_MANAGERS, ROLE_LABEL, canRemove, managersCount, type InviteResult, type MemberRow } from './schema';

function withoutMember(rows: MemberRow[], id: string): MemberRow[] {
  return rows.filter((m) => m.id !== id);
}

export function TeamManager({ slug, members, currentMemberId }: { slug: string; members: MemberRow[]; currentMemberId: string }) {
  const [rows, removeOptimistic] = useOptimistic(members, withoutMember);
  const [, startTransition] = useTransition();
  const [credentials, setCredentials] = useState<InviteResult | null>(null);
  const [announce, setAnnounce] = useState('');
  const toast = useToast();
  const [confirm, dialog] = useConfirm();

  const remove = useCallback(async (member: MemberRow) => {
    const who = member.email ?? 'менеджер';
    const yes = await confirm({ title: 'Закрыть доступ?', text: `${who} больше не сможет войти в кабинет.`, confirmLabel: 'Удалить', danger: true });
    if (!yes) return;
    startTransition(async () => {
      removeOptimistic(member.id);
      const res = await callAction(() => removeMember(slug, member.id));
      if (res.ok) {
        toast.success(res.message ?? 'Удалено');
        setAnnounce(`${who} удалён из команды`);
        // Если удалили того, чей пароль ещё на экране, — прячем карточку.
        setCredentials((c) => (c?.member.id === member.id ? null : c));
      } else {
        toast.error(res.error);
        setAnnounce(`Ошибка: ${res.error}`);
      }
    });
  }, [confirm, removeOptimistic, slug, toast]);

  const onInvited = useCallback((result: InviteResult) => {
    setCredentials(result);
    setAnnounce(`${result.member.email ?? 'Менеджер'} добавлен. Пароль показан на экране`);
  }, []);
  const hideCredentials = useCallback(() => setCredentials(null), []);

  const limitReached = managersCount(rows) >= MAX_MANAGERS;

  return (
    <div className="grid gap-5">
      <p className="sr-only" aria-live="polite">{announce}</p>
      {dialog}
      {credentials && <CredentialsCard result={credentials} onClose={hideCredentials} />}

      <section aria-labelledby="team-list-title" className="grid gap-2">
        <h2 id="team-list-title" className="!mb-0">Участники <span className="font-normal text-[#595959]">({rows.length})</span></h2>
        <ul className="grid gap-2">
          {rows.map((m) => (
            <MemberItem key={m.id} member={m} isSelf={m.id === currentMemberId} onRemove={remove} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="team-invite-title" className="grid gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h2 id="team-invite-title" className="!mb-0">Добавить менеджера</h2>
        {limitReached
          ? <p className="!mb-0 text-[14px] text-[#595959]">Достигнут лимит: {MAX_MANAGERS} менеджеров. Удалите кого-то, чтобы добавить нового.</p>
          : <InviteForm slug={slug} onInvited={onInvited} />}
      </section>
    </div>
  );
}

function MemberItem({ member, isSelf, onRemove }: { member: MemberRow; isSelf: boolean; onRemove: (m: MemberRow) => void }) {
  const onClick = useCallback(() => onRemove(member), [member, onRemove]);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3 text-[14px]">
      <span className="min-w-0 break-all">
        <span className="font-medium">{member.email ?? 'без email'}</span>
        <span className="text-[#595959]"> · {ROLE_LABEL[member.role]}{isSelf ? ' (вы)' : ''}</span>
      </span>
      {canRemove(member) && (
        <button type="button" onClick={onClick} aria-label={`Удалить ${member.email ?? 'менеджера'}`} className="!min-h-[44px] !border-[#b91c1c] !text-[#b91c1c]">
          Удалить
        </button>
      )}
    </li>
  );
}
