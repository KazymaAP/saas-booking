// app/panel/(protected)/logs/page.tsx — ошибки (email, генерация, Vercel, брони, импорт) и аудит (ТЗ §5.4 /panel/logs).
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function LogsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = searchParams.tab === 'audit' ? 'audit' : 'errors';
  let q = adminClient().from('audit_log').select('id, action, entity, entity_id, payload, created_at').order('created_at', { ascending: false }).limit(300);
  q = tab === 'errors' ? q.like('action', 'error:%') : q.not('action', 'like', 'error:%');
  const { data } = await q;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold">Логи</h1>
        <div className="flex gap-3 text-[14px]">
          <a className={tab === 'errors' ? 'font-semibold underline' : 'text-[#666666] underline'} href="?tab=errors">Ошибки</a>
          <a className={tab === 'audit' ? 'font-semibold underline' : 'text-[#666666] underline'} href="?tab=audit">Аудит</a>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-[#e5e5e5]"><th className="p-2">Время</th><th className="p-2">{tab === 'errors' ? 'Источник' : 'Действие'}</th><th className="p-2">Объект</th><th className="p-2">Данные</th></tr></thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-b border-[#e5e5e5] align-top">
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</td>
                <td className="p-2">{tab === 'errors' ? r.action.replace('error:', '') : r.action}</td>
                <td className="p-2">{r.entity} {r.entity_id ? String(r.entity_id).slice(0, 8) : ''}</td>
                <td className="p-2 break-all text-[#666666]">{JSON.stringify(r.payload)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="mt-4 text-[14px] text-[#666666]">Записей нет.</p>}
      </div>
    </div>
  );
}
