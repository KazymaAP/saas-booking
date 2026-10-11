// app/panel/(protected)/stats/page.tsx — аналитика: города, ниши, каналы, дни, шаблоны, MRR, конверсия (ТЗ §5.4 /panel/stats).
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'no_contact', 'in_progress', 'preview_ready', 'approved', 'sent', 'viewed', 'replied', 'client', 'refused', 'archived'];

export default async function StatsPage() {
  const db = adminClient();
  const [{ data: businesses }, { data: templates }, { data: outreach }] = await Promise.all([
    db.from('businesses').select('status, city, vertical_template_id, subscription_price, subscription_active').limit(50000),
    db.from('vertical_templates').select('id, name'),
    db.from('outreach_log').select('channel, template_id, sent_at, opened_at, clicked_at, status').limit(50000),
  ]);
  const verticalName = new Map((templates ?? []).map((t) => [t.id, t.name]));

  const byStatus = new Map<string, number>();
  const byCity = new Map<string, number>();
  const byVertical = new Map<string, number>();
  let mrr = 0;
  for (const b of businesses ?? []) {
    byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
    if (b.city) byCity.set(b.city, (byCity.get(b.city) ?? 0) + 1);
    const v = b.vertical_template_id ? verticalName.get(b.vertical_template_id) ?? 'без ниши' : 'без ниши';
    byVertical.set(v, (byVertical.get(v) ?? 0) + 1);
    if (b.subscription_active && b.subscription_price) mrr += Number(b.subscription_price);
  }

  // Рассылка: по каналам, по шаблонам, по дням (последние 14)
  const byChannel = new Map<string, number>();
  const byTemplate = new Map<string, { sent: number; opened: number; clicked: number }>();
  const byDay = new Map<string, number>();
  for (const o of outreach ?? []) {
    byChannel.set(o.channel ?? 'email', (byChannel.get(o.channel ?? 'email') ?? 0) + 1);
    const tname = o.template_id && o.template_id !== 'default' ? verticalName.get(o.template_id) ?? 'шаблон' : 'встроенный';
    const t = byTemplate.get(tname) ?? { sent: 0, opened: 0, clicked: 0 };
    if (o.status === 'sent') t.sent++;
    if (o.opened_at) t.opened++;
    if (o.clicked_at) t.clicked++;
    byTemplate.set(tname, t);
    if (o.sent_at) {
      const day = o.sent_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);

  const sent = (byStatus.get('sent') ?? 0) + (byStatus.get('viewed') ?? 0) + (byStatus.get('replied') ?? 0) + (byStatus.get('client') ?? 0);
  const clients = byStatus.get('client') ?? 0;
  const conversion = sent ? ((clients / sent) * 100).toFixed(1) : '0.0';
  const perPayment = clients ? Math.round(sent / clients) : null;

  return (
    <div className="grid gap-8">
      <h1 className="text-[24px] font-semibold">Статистика</h1>
      <div className="grid grid-cols-2 gap-3 text-[14px] md:grid-cols-4">
        <Box label="Всего бизнесов" value={String(businesses?.length ?? 0)} />
        <Box label="Клиентов" value={String(clients)} />
        <Box label="MRR, ₽" value={mrr.toLocaleString('ru-RU')} />
        <Box label="Конверсия в оплату" value={`${conversion}%`} hint={perPayment ? `1 оплата на ${perPayment} писем` : undefined} />
      </div>

      <Table title="Воронка" rows={STATUSES.map((s) => [s, String(byStatus.get(s) ?? 0)])} />
      <Table title="Ниши" rows={[...byVertical.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)])} />
      <Table title="Города" rows={[...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, String(v)])} />
      <Table title="Каналы рассылки" rows={[...byChannel.entries()].map(([k, v]) => [k, String(v)])} />
      <section>
        <h2 className="text-[18px] font-semibold">Шаблоны</h2>
        <table className="mt-2 w-full max-w-[640px] text-left text-[14px]">
          <thead><tr className="border-b border-[#e5e5e5]"><th className="p-2">Шаблон</th><th className="p-2">Отправлено</th><th className="p-2">Открыто</th><th className="p-2">Клик</th></tr></thead>
          <tbody>
            {[...byTemplate.entries()].map(([name, t]) => (
              <tr key={name} className="border-b border-[#e5e5e5]"><td className="p-2">{name}</td><td className="p-2">{t.sent}</td><td className="p-2">{t.opened}</td><td className="p-2">{t.clicked}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <Table title="По дням (14 последних)" rows={days.map(([k, v]) => [k, String(v)])} />
    </div>
  );
}

function Box({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-[#e5e5e5] p-3">
      <div className="text-[#666666]">{label}</div>
      <div className="text-[20px] font-bold">{value}</div>
      {hint && <div className="text-[11px] text-[#666666]">{hint}</div>}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section>
      <h2 className="text-[18px] font-semibold">{title}</h2>
      <table className="mt-2 w-full max-w-[520px] text-left text-[14px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-[#e5e5e5]"><td className="p-2">{k}</td><td className="p-2 text-right">{v}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
