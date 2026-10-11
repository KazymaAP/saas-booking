// app/[prefix]/[slug]/panel/(protected)/team/page.tsx — команда бизнеса (ТЗ §5.3, §20).
import { cookies } from 'next/headers';
import { currentOwner } from '@/lib/owner-session';
import { adminClient } from '@/lib/supabase';
import { FLASH_COOKIE } from '@/lib/flash';
import { inviteManager, removeMember } from './actions';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = (await currentOwner(params.slug))!;
  if (access.member.role !== 'owner') return <p>Раздел доступен только владельцу.</p>;

  const flashRaw = cookies().get(FLASH_COOKIE)?.value;
  const flash = flashRaw ? (JSON.parse(flashRaw) as { email: string; password: string }) : null;

  const { data: members } = await adminClient()
    .from('admin_users').select('id, email, role').eq('business_id', access.business.id).order('created_at');
  const { prefix, slug } = params;

  return (
    <div className="grid max-w-[560px] gap-6">
      <h1 className="text-[24px] font-semibold">Команда</h1>
      <p className="text-[14px] text-[#666666]">Менеджер видит брони и не видит настройки и подписку.</p>

      {flash && (
        <div className="rounded-md border border-[#16a34a] bg-[#f0fdf4] p-4 text-[14px]">
          <p className="font-semibold">Менеджер добавлен. Передайте данные. Пароль показывается один раз.</p>
          <p>Логин: {flash.email}</p>
          <p>Пароль: <code>{flash.password}</code></p>
        </div>
      )}

      <ul className="grid gap-2 text-[14px]">
        {(members ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-md border border-[#e5e5e5] p-3">
            <span>{m.email} · {m.role === 'owner' ? 'владелец' : 'менеджер'}</span>
            {m.role !== 'owner' && (
              <form action={removeMember.bind(null, prefix, slug)}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="underline">Удалить</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form action={inviteManager.bind(null, prefix, slug)} className="grid gap-2 text-[14px]">
        <input name="email" type="email" required placeholder="Email менеджера" className="input" />
        <button type="submit" className="btn-primary">Пригласить менеджера</button>
      </form>
    </div>
  );
}
