'use client';
// главная/SuperAdmin.tsx — супер-админка SaaS в дизайне «Детейленг» (тёмная студия).
// Переиспользует точный скомпилированный CSS public/assets/detailing-scoped.css (scoped под .detailing-root)
// и токены бренда (bg-brand-surface, text-brand-text-muted, btn-primary, .sheet, …).
// Данные — мок (для локального превью); реальный маршрут импортирует этот компонент из app/panel.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  type Icon,
  Bell,
  Buildings,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CaretDown,
  Check,
  ChatTeardropText,
  Clock,
  Copy,
  Prohibit,
  CreditCard,
  CurrencyRub,
  DotsThree,
  EnvelopeSimple,
  Eye,
  Gauge,
  Gear,
  Globe,
  Key,
  List,
  ListChecks,
  MagnifyingGlass,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Sparkle,
  SquaresFour,
  Stack,
  Headset,
  Sliders,
  Storefront,
  TelegramLogo,
  TrendDown,
  TrendUp,
  Trash,
  UserCircle,
  Users,
  WarningCircle,
  X,
  ArrowDown,
  ChartLineUp,
  Cloud,
  Database,
  MapPin,
  Megaphone,
  Pulse,
  Receipt,
  Star,
  Tag,
  UsersThree,
  Wrench,
  Plugs,
  UploadSimple,
  ArrowSquareOut,
  PaperPlaneTilt,
  Money,
  ChatCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { ALL_NICHE_THEMES } from '@/шаблоны/_shared/themes';

// ---------- типы и мок-данные ----------
type BusinessStatus = 'active' | 'pending' | 'suspended';
type Business = {
  id: string;
  name: string;
  city: string;
  template: string;
  status: BusinessStatus;
  owner: string;
  bookingsToday: number;
  revenueMonth: number;
  // Публичный адрес сайта бизнеса (появляется после генерации); без него ссылка «Сайт» недоступна.
  slug?: string;
  created: string;
};

const BUSINESSES: Business[] = [
  { id: 'b1', name: 'GlowDetailing', city: 'Москва', template: 'detailing', status: 'active', owner: 'Иван Петров', bookingsToday: 12, revenueMonth: 184000, created: '2025-02-14' },
  { id: 'b2', name: 'DriftWash', city: 'Санкт-Петербург', template: 'detailing', status: 'active', owner: 'Ольга Смирнова', bookingsToday: 8, revenueMonth: 96500, created: '2025-03-02' },
  { id: 'b3', name: 'Чистый Код', city: 'Казань', template: 'studio', status: 'pending', owner: 'Ринат Ахметов', bookingsToday: 0, revenueMonth: 0, created: '2025-10-21' },
  { id: 'b4', name: 'AutoSpa Premium', city: 'Москва', template: 'detailing', status: 'active', owner: 'Дмитрий Волков', bookingsToday: 21, revenueMonth: 312000, created: '2024-11-09' },
  { id: 'b5', name: 'Блеск & Лак', city: 'Новосибирск', template: 'detailing', status: 'suspended', owner: 'Анна Кузнецова', bookingsToday: 0, revenueMonth: 0, created: '2025-01-30' },
  { id: 'b6', name: 'ProDetail', city: 'Екатеринбург', template: 'studio', status: 'active', owner: 'Сергей Орлов', bookingsToday: 5, revenueMonth: 72000, created: '2025-04-18' },
  { id: 'b7', name: 'Мойка №1', city: 'Ростов-на-Дону', template: 'detailing', status: 'pending', owner: 'Павел Лебедев', bookingsToday: 0, revenueMonth: 0, created: '2025-10-25' },
  { id: 'b8', name: 'CeramicLab', city: 'Москва', template: 'detailing', status: 'active', owner: 'Мария Соколова', bookingsToday: 14, revenueMonth: 228000, created: '2024-12-01' },
  { id: 'b9', name: 'FreshAuto', city: 'Краснодар', template: 'detailing', status: 'active', owner: 'Никита Зайцев', bookingsToday: 6, revenueMonth: 88000, created: '2025-06-11' },
  { id: 'b10', name: 'Diamond Wax', city: 'Сочи', template: 'studio', status: 'pending', owner: 'Елена Морозова', bookingsToday: 0, revenueMonth: 0, created: '2025-10-28' },
];


const BOT_COMMANDS = ['/start', '/book', '/cancel', '/status', '/help', '/menu'];

// ---------- форматтеры ----------
const rub = (n: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
const num = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
const STATUS: Record<BusinessStatus, { label: string; dot: string; text: string }> = {
  active: { label: 'Активен', dot: 'bg-brand-success', text: 'text-brand-success' },
  pending: { label: 'На модерации', dot: 'bg-brand-accent', text: 'text-brand-accent' },
  suspended: { label: 'Приостановлен', dot: 'bg-brand-error', text: 'text-brand-error' },
};

// ---------- примитивы UI ----------
function StatusBadge({ status }: { status: BusinessStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-caption text-brand-text">
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      <span className={s.text}>{s.label}</span>
    </span>
  );
}

type ToastKind = 'success' | 'error' | 'info';
function ToastHost({ toasts }: { toasts: { id: number; message: string; kind: ToastKind }[] }) {
  const cls: Record<ToastKind, string> = {
    success: 'border-brand-success/40 text-brand-success',
    error: 'border-brand-error/40 text-brand-error',
    info: 'border-white/15 text-brand-text',
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-modal flex flex-col items-center gap-2 px-4" style={{ zIndex: 320 }} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-center gap-2 rounded-2xl border bg-[#0c0c0c]/95 px-4 py-2.5 text-body-sm shadow-xl backdrop-blur-xl ${cls[t.kind]}`}>
          {t.kind === 'success' && <Check size={16} weight="bold" aria-hidden="true" />}
          {t.kind === 'error' && <WarningCircle size={16} weight="bold" aria-hidden="true" />}
          {t.kind === 'info' && <Sparkle size={16} weight="bold" aria-hidden="true" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function Sheet({ open, onClose, busy, title, children }: { open: boolean; onClose: () => void; busy?: boolean; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center" role="presentation" style={{ zIndex: 300 }}>
      <div className="sheet-backdrop" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="sheet animate-scale-in max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0c0c0c]/95 px-5 py-4 backdrop-blur-xl">
          <h2 className="text-heading-sm">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть" className="grid size-9 place-items-center rounded-full text-brand-text-muted transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50">
            <X size={20} weight="bold" />
          </button>
        </div>
        <div className="p-5 md:p-6">{children}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Glyph, trend }: { label: string; value: string; sub: string; icon: Icon; trend?: { dir: 'up' | 'down'; pct: number; good?: boolean } }) {
  return (
    <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
      <div className="flex items-center gap-3">
        <Glyph size={20} weight="bold" className="text-white/85" aria-hidden="true" />
        <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{value}</div>
        {trend && (
          <span className={`ml-auto inline-flex items-center gap-0.5 text-caption ${trend.good === false ? 'text-brand-error' : 'text-brand-success'}`}>
            {trend.dir === 'up' ? <TrendUp size={14} weight="bold" /> : <TrendDown size={14} weight="bold" />}
            {trend.pct}%
          </span>
        )}
      </div>
      <div className="mt-3 text-[13px] text-brand-text-muted">{label}</div>
      <div className="mt-1 text-caption text-brand-text-subtle">{sub}</div>
    </div>
  );
}

function SectionHeader({ icon: Glyph, title, desc }: { icon: Icon; title: string; desc?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/85">
        <Glyph size={18} weight="bold" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-heading-md">{title}</h2>
        {desc && <p className="text-caption text-brand-text-muted">{desc}</p>}
      </div>
    </div>
  );
}

// Кнопка перезапроса данных: отметка времени ставится по факту выполнения запроса
function RefreshBtn({ push, label = 'Обновить', message = 'Данные обновлены', onRefresh }: { push: (m: string, k?: ToastKind) => void; label?: string; message?: string; onRefresh?: () => Promise<void> | void }) {
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-2">
      {at && <span className="text-caption text-brand-text-subtle">обновлено в {at}</span>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onRefresh?.();
            setAt(new Date().toLocaleTimeString('ru-RU'));
            push(message, 'success');
          } catch (e) {
            push(e instanceof Error ? e.message : 'Не удалось обновить', 'error');
          } finally {
            setBusy(false);
          }
        }}
        className="btn-ghost press text-caption"
      >
        {busy ? 'Обновление…' : label}
      </button>
    </div>
  );
}

// Отправка письма клиенту/владельцу: ставит письмо в реальную очередь доставки (email_queue).
function SendMailSheet({
  open, onClose, push, title, to, subject, businessId,
}: {
  open: boolean; onClose: () => void; push: (m: string, k?: ToastKind) => void;
  title: string; to: string; subject: string; businessId?: string | null;
}) {
  const [form, setForm] = useState({ to, subject, body: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ to, subject, body: '' }); }, [open, to, subject]);

  const send = async () => {
    setBusy(true);
    try {
      const r = await queuePlatformEmailAction({ ...form, businessId: businessId ?? null });
      if (r.ok) { push('Письмо поставлено в очередь отправки', 'success'); onClose(); }
      else push(r.error ?? 'Не удалось отправить письмо', 'error');
    } catch {
      push('Не удалось отправить письмо', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-caption text-brand-text-subtle">Email получателя</span>
          <input value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} placeholder="client@example.ru" className="input mt-1 w-full" />
        </label>
        <label className="block">
          <span className="text-caption text-brand-text-subtle">Тема</span>
          <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input mt-1 w-full" />
        </label>
        <label className="block">
          <span className="text-caption text-brand-text-subtle">Текст письма</span>
          <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={6} placeholder="Текст сообщения…" className="input mt-1 w-full resize-none" />
        </label>
        <p className="text-caption text-brand-text-subtle">
          Письмо попадёт в очередь доставки и уйдёт при ближайшем запуске рассыльщика. Отправка требует настроенного почтового ящика.
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary flex-1 text-body-sm" disabled={busy || !form.to.trim() || !form.subject.trim() || !form.body.trim()} onClick={() => { void send(); }}>
            {busy ? 'Ставим в очередь…' : 'Отправить'}
          </button>
          <button type="button" className="btn-ghost text-body-sm" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </Sheet>
  );
}

function ClockLabel() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t); }, []);
  return <>{now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</>;
}

// ---------- графики (чистый SVG, без зависимостей) ----------
function MiniBars({ data, color = '#4690ff' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: 188 }}>
      {data.map((d, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <span className="text-caption text-brand-text-subtle">{num(d.value)}</span>
          <div className="flex w-full flex-1 items-end">
            <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, background: color }} />
          </div>
          <span className="w-full truncate text-center text-caption text-brand-text-subtle" title={d.label}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ label, value, max, color = '#4690ff' }: { label: string; value: number; max: number; color?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-body-sm"><span className="truncate">{label}</span><span className="ml-2 shrink-0 text-brand-text-muted">{num(value)}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} /></div>
    </div>
  );
}



// ---------- Дашборд ----------
function Dashboard({ businesses, push, onOpenAudit }: { businesses: Business[]; push: (m: string, k?: ToastKind) => void; onOpenAudit?: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboardDataAction>> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await getDashboardDataAction()); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const b = data?.businesses ?? { total: 0, clients: 0, moderation: 0, suspended: 0 };
  const bk = data?.bookings ?? { today: 0, week: 0, pending: 0 };
  const money = data?.money ?? { monthRevenue: 0, paidCount: 0, partnersBalance: 0 };
  const partners = data?.partners ?? { total: 0, leads: 0 };

  const stats = [
    { label: 'Бизнесов в базе', value: num(b.total), icon: Storefront, sub: `${num(b.clients)} оплативших` },
    { label: 'На модерации', value: num(b.moderation), icon: ShieldCheck, sub: b.moderation > 0 ? 'требуют решения' : 'очередь пуста' },
    { label: 'Записей сегодня', value: num(bk.today), icon: CalendarBlank, sub: `${num(bk.week)} на 7 дней` },
    { label: 'Ждут подтверждения', value: num(bk.pending), icon: Clock, sub: 'по всем бизнесам' },
    { label: 'Выручка за месяц', value: rub(money.monthRevenue), icon: CurrencyRub, sub: `${num(money.paidCount)} платежей` },
    { label: 'Партнёры', value: num(partners.total), icon: UsersThree, sub: `${num(partners.leads)} лидов · баланс ${rub(money.partnersBalance)}` },
  ];

  // В топ попадают только те, у кого реально были оплаты: список из прочерков ничего не сообщает.
  const top = [...businesses].filter((x) => x.revenueMonth > 0).sort((a, c) => c.revenueMonth - a.revenueMonth).slice(0, 5);
  const recent = data?.recent ?? [];
  const cron = data?.cron ?? { errors24h: 0, lastMessage: '', lastAt: '', lastSource: '' };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Gauge} title="Сводка платформы" desc="Данные из базы в реальном времени" />
        <RefreshBtn push={push} label="Обновить" message="Сводка обновлена" onRefresh={load} />
      </div>

      {cron.errors24h > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.08] p-4">
          <div className="flex items-start gap-3">
            <WarningCircle size={20} weight="bold" className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium text-amber-200">
                Фоновые задачи падают: {num(cron.errors24h)} ошибок за сутки
              </div>
              <div className="mt-1 text-caption text-amber-200/80">
                {cron.lastSource ? `Источник: ${cron.lastSource}. ` : ''}
                {cron.lastMessage || 'Подробности — в журнале действий.'}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onOpenAudit?.()} className="btn-secondary px-3 py-1.5 text-caption">
                  Открыть журнал
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-caption"
                  onClick={() => {
                    // Готовый SQL для Supabase: подставляем текущий адрес, секрет вписывает оператор.
                    const origin = typeof window === 'undefined' ? '' : window.location.origin;
                    const sql = [
                      `alter database postgres set app.site_url = '${origin}';`,
                      "alter database postgres set app.cron_secret = '<ВСТАВЬТЕ_СЕКРЕТ_ПЛАНИРОВЩИКА_ИЗ_ОКРУЖЕНИЯ>';",
                      "select public.cron_setting('site_url'), public.cron_setting('cron_secret') is not null;",
                    ].join('\n');
                    navigator.clipboard?.writeText(sql).catch(() => {});
                    push('SQL скопирован — вставьте его в Supabase → SQL Editor', 'success');
                  }}
                >
                  Скопировать SQL-фикс
                </button>
                <span className="text-caption text-amber-200/70">
                  Частые задачи (pg_cron) требуют настроек app.site_url и app.cron_secret в базе.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 md:gap-4">
        {stats.map((st) => <StatCard key={st.label} {...st} />)}
      </section>

      {loading && <p className="text-caption text-brand-text-subtle">Считаем показатели…</p>}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-heading-sm">Последняя активность</h3>
            <button type="button" className="text-caption text-brand-accent transition-colors hover:text-white" onClick={() => onOpenAudit?.()}>Весь журнал →</button>
          </div>
          <ul className="mt-4 space-y-1">
            {recent.length === 0 && (
              <li className="rounded-2xl px-2 py-2.5 text-caption text-brand-text-subtle">
                {loading ? 'Загрузка…' : 'Событий пока нет — журнал наполняется действиями в платформе.'}
              </li>
            )}
            {recent.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-white/[0.04]">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/85"><ListChecks size={16} weight="bold" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm" title={a.action}>{a.label}</span>
                  <span className="block truncate text-caption text-brand-text-subtle">{a.entity || '—'}</span>
                </span>
                <span className="shrink-0 text-caption text-brand-text-subtle">{a.created_at ? new Date(a.created_at).toLocaleTimeString('ru-RU') : ''}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <h3 className="text-heading-sm">Топ по выручке за месяц</h3>
          <ul className="mt-3 space-y-1">
            {top.length === 0 && <li className="rounded-2xl px-2 py-2 text-caption text-brand-text-subtle">Оплат за этот месяц ещё не было</li>}
            {top.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 rounded-2xl px-2 py-2 hover:bg-white/[0.04]">
                <span className="truncate text-body-sm">{x.name}</span>
                <span className="shrink-0 text-body-sm text-brand-text-muted">{rub(x.revenueMonth)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.06] p-3 text-center">
              <div className="text-[20px] font-semibold">{num(b.suspended)}</div>
              <div className="text-caption text-brand-text-subtle">в архиве / отказ</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] p-3 text-center">
              <div className="text-[20px] font-semibold">{num(bk.week)}</div>
              <div className="text-caption text-brand-text-subtle">записей за 7 дней</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------- Бизнесы ----------
type FilterStatus = 'all' | BusinessStatus;
type SortKey = 'name' | 'revenue' | 'bookings';

function Checkbox({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${on ? 'border-brand-accent bg-brand-accent text-brand-accent-on' : 'border-white/25 hover:border-white/50'}`}
    >
      {on && <Check size={13} weight="bold" aria-hidden="true" />}
    </button>
  );
}

function Businesses({
  businesses, onOpen, query, push, onBulkStatus, onBulkDelete, onAdd,
}: {
  businesses: Business[]; onOpen: (id: string) => void; query: string; push: (m: string, k?: ToastKind) => void;
  onBulkStatus: (ids: string[], status: BusinessStatus) => void; onBulkDelete: (ids: string[]) => void;
  onAdd: (b: Business) => void;
}) {
  const [status, setStatus] = useState<FilterStatus>('all');
  const [template, setTemplate] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('revenue');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', city: '', template: 'detailing' });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return businesses
      .filter((b) => (status === 'all' ? true : b.status === status))
      .filter((b) => (template === 'all' ? true : b.template === template))
      .filter((b) => (q ? b.name.toLowerCase().includes(q) || b.city.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'bookings') return b.bookingsToday - a.bookingsToday;
        return b.revenueMonth - a.revenueMonth;
      });
  }, [businesses, status, template, query, sort]);

  const cities = useMemo(() => Array.from(new Set(businesses.map((b) => b.city))), [businesses]);

  const ids = filtered.map((b) => b.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(ids));
  const runBulk = (kind: BusinessStatus | 'delete') => {
    const list = [...selected];
    if (list.length === 0) return;
    if (kind === 'delete') onBulkDelete(list); else onBulkStatus(list, kind);
    push(kind === 'delete' ? `Удалено: ${list.length} бизнесов` : `Обновлено: ${list.length} бизнесов → ${STATUS[kind].label}`, kind === 'delete' ? 'info' : 'success');
    setSelected(new Set());
  };

  const chips = [
    { key: 'all' as const, label: `Все · ${businesses.length}` },
    { key: 'active' as const, label: `Активные · ${businesses.filter((b) => b.status === 'active').length}` },
    { key: 'pending' as const, label: `Модерация · ${businesses.filter((b) => b.status === 'pending').length}` },
    { key: 'suspended' as const, label: `Приостановлены · ${businesses.filter((b) => b.status === 'suspended').length}` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Storefront} title="Бизнесы" desc={`Все аренды платформы · ${cities.length} городов`} />
        <button type="button" className="btn-primary press text-body-sm" onClick={() => setAddOpen(true)}>
          <Plus size={16} weight="bold" aria-hidden="true" /> Добавить бизнес
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setStatus(c.key)}
            className={`rounded-full border px-3 py-1.5 text-caption transition-colors ${status === c.key ? 'border-brand-accent/40 bg-brand-accent/10 text-white' : 'border-white/10 text-brand-text-muted hover:text-white'}`}
          >
            {c.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/10" />
        <select value={template} onChange={(e) => setTemplate(e.target.value)} className="input !min-h-9 !w-auto !py-1.5 text-caption" aria-label="Ниша">
          <option value="all">Все ниши</option>
          {cities.length >= 0 && Array.from(new Set(businesses.map((b) => b.template))).filter((t) => t && t !== '—').map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input !min-h-9 !w-auto !py-1.5 text-caption" aria-label="Сортировка">
          <option value="revenue">По выручке</option>
          <option value="bookings">По записям</option>
          <option value="name">По названию</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <div className="hidden grid-cols-[1.6fr_1fr_1fr_0.9fr_0.9fr_0.9fr_40px] gap-3 px-5 py-3 text-caption uppercase tracking-wide text-brand-text-subtle md:grid">
          <div className="flex items-center gap-3"><Checkbox on={allSelected} onClick={toggleAll} label="Выбрать все" /><span>Название</span></div>
          <span>Город</span><span>Шаблон</span><span>Сегодня</span><span>Месяц, ₽</span><span>Статус</span><span />
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {filtered.map((b) => (
            <li key={b.id} className="grid grid-cols-2 gap-x-3 gap-y-2 px-5 py-3.5 transition-colors hover:bg-white/[0.03] has-[button[aria-pressed=true]]:bg-brand-accent/[0.04] md:grid-cols-[1.6fr_1fr_1fr_0.9fr_0.9fr_0.9fr_40px] md:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <Checkbox on={selected.has(b.id)} onClick={() => toggle(b.id)} label={`Выбрать ${b.name}`} />
                <button type="button" onClick={() => onOpen(b.id)} className="flex min-w-0 items-center gap-3 text-left">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/85">
                    <Buildings size={16} weight="bold" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium">{b.name}</span>
                    <span className="block truncate text-caption text-brand-text-subtle">{b.owner}</span>
                  </span>
                </button>
              </div>
              <span className="inline-flex items-center gap-1 text-body-sm text-brand-text-muted"><MapPin size={14} weight="bold" className="text-brand-accent" aria-hidden="true" />{b.city}</span>
              <span className="text-body-sm text-brand-text-muted">{b.template}</span>
              <span className="text-body-sm">{num(b.bookingsToday)}</span>
              <span className="text-body-sm">{b.revenueMonth > 0 ? rub(b.revenueMonth) : '—'}</span>
              <span><StatusBadge status={b.status} /></span>
              <button type="button" onClick={() => onOpen(b.id)} aria-label={`Открыть ${b.name}`} className="grid size-8 place-items-center rounded-full text-brand-text-subtle transition-colors hover:bg-white/[0.06] hover:text-white">
                <DotsThree size={18} weight="bold" aria-hidden="true" />
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Ничего не найдено.</li>}
        </ul>
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-accent/30 bg-brand-surface/95 p-3 shadow-2xl backdrop-blur">
          <span className="text-body-sm">Выбрано: <b className="text-white">{selected.size}</b></span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary press text-caption" onClick={() => runBulk('active')}><Play size={14} weight="bold" aria-hidden="true" /> Активировать</button>
            <button type="button" className="btn-ghost press text-caption" onClick={() => runBulk('suspended')}><Prohibit size={14} weight="bold" aria-hidden="true" /> Приостановить</button>
            <button type="button" className="btn-ghost press text-caption text-brand-error" onClick={() => runBulk('delete')}><Trash size={14} weight="bold" aria-hidden="true" /> Удалить</button>
            <button type="button" className="btn-ghost press text-caption" onClick={() => setSelected(new Set())}>Сбросить</button>
          </div>
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Добавить бизнес">
        <div className="space-y-3">
          <input className="input w-full" placeholder="Название" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input w-full" placeholder="Город" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
          <select className="input w-full" value={draft.template} onChange={(e) => setDraft({ ...draft, template: e.target.value })}>
            <option value="detailing">Детейленг</option>
            <option value="studio">Студия</option>
            <option value="clinic">Клиника</option>
          </select>
          <button type="button" className="btn-primary text-body-sm" onClick={() => {
            if (!draft.name.trim()) return;
            onAdd({ ...BUSINESSES[0], id: `b${Date.now()}`, name: draft.name.trim(), city: draft.city.trim() || '—', template: draft.template, status: 'pending', owner: '—', bookingsToday: 0, revenueMonth: 0 });
            setAddOpen(false);
            setDraft({ name: '', city: '', template: 'detailing' });
            push('Бизнес добавлен', 'success');
          }}>Создать</button>
        </div>
      </Sheet>
    </div>
  );
}

// ---------- Дровер бизнеса ----------
function BusinessDrawer({
  business, onClose, onStatus, onDelete, push,
}: {
  business: Business | null;
  onClose: () => void;
  onStatus: (id: string, status: BusinessStatus) => void;
  onDelete: (id: string) => void;
  push: (m: string, k?: ToastKind) => void;
}) {
  const [mailOpen, setMailOpen] = useState(false);
  if (!business) return null;
  const b = business;
  const services = [
    { name: 'Комплексная мойка', price: 1500, dur: 60 },
    { name: 'Химчистка салона', price: 6500, dur: 240 },
    { name: 'Керамическое покрытие', price: 28000, dur: 480 },
  ];
  return (
    <Sheet open={!!business} onClose={onClose} title={b.name}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge status={b.status} />
          <span className="text-caption text-brand-text-subtle">с {new Date(b.created).toLocaleDateString('ru-RU')}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/[0.06] p-3"><div className="text-caption text-brand-text-subtle">Город</div><div className="mt-0.5 text-body-sm">{b.city}</div></div>
          <div className="rounded-2xl border border-white/[0.06] p-3"><div className="text-caption text-brand-text-subtle">Шаблон</div><div className="mt-0.5 text-body-sm">{b.template}</div></div>
          <div className="rounded-2xl border border-white/[0.06] p-3"><div className="text-caption text-brand-text-subtle">Владелец</div><div className="mt-0.5 text-body-sm">{b.owner}</div></div>
          <div className="rounded-2xl border border-white/[0.06] p-3"><div className="text-caption text-brand-text-subtle">Записей сегодня</div><div className="mt-0.5 text-body-sm">{num(b.bookingsToday)}</div></div>
        </div>

        <div>
          <h3 className="mb-2 text-heading-sm">Услуги</h3>
          <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06]">
            {services.map((s) => (
              <li key={s.name} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-body-sm">{s.name}</span>
                <span className="text-body-sm text-brand-text-muted">{rub(s.price)} · {s.dur} мин</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          {b.slug ? (
            <a className="btn-secondary press text-body-sm" href={`/${b.slug}`} target="_blank" rel="noopener noreferrer">
              <Globe size={16} weight="bold" aria-hidden="true" /> Сайт
            </a>
          ) : (
            <button type="button" disabled title="У бизнеса ещё нет сгенерированного сайта" className="btn-secondary press text-body-sm opacity-50">
              <Globe size={16} weight="bold" aria-hidden="true" /> Сайт
            </button>
          )}
          <button type="button" className="btn-secondary press text-body-sm" onClick={() => setMailOpen(true)}>
            <Bell size={16} weight="bold" aria-hidden="true" /> Уведомить
          </button>
          {b.status !== 'active' ? (
            <button type="button" className="btn-primary press text-body-sm" onClick={() => { onStatus(b.id, 'active'); onClose(); }}>
              <Play size={16} weight="bold" aria-hidden="true" /> Активировать
            </button>
          ) : (
            <button type="button" className="btn-ghost press text-body-sm text-brand-error" onClick={() => { onStatus(b.id, 'suspended'); onClose(); }}>
              <Prohibit size={16} weight="bold" aria-hidden="true" /> Приостановить
            </button>
          )}
          <button type="button" className="btn-ghost press ml-auto text-body-sm text-brand-error" onClick={() => onDelete(b.id)}>
            <Trash size={16} weight="bold" aria-hidden="true" /> Удалить
          </button>
        </div>
      </div>

      <SendMailSheet
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        push={push}
        title="Уведомление владельцу бизнеса"
        to=""
        subject={`Уведомление по бизнесу «${b.name}»`}
      />
    </Sheet>
  );
}

// ---------- Шаблоны ----------
function Templates({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <SectionHeader icon={Stack} title="Шаблоны ниш" desc="10 готовых дизайнов — откройте любой и посмотрите целиком" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_NICHE_THEMES.map((t) => (
          <div key={t.key} className="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-surface p-5">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-25 blur-3xl" style={{ background: t.accent }} aria-hidden="true" />
            <div className="relative">
              <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: t.accent }} aria-hidden="true">
                <Stack size={20} weight="bold" />
              </span>
              <div className="mt-4 flex items-center justify-between gap-2">
                <h3 className="text-heading-sm">{t.tagline}</h3>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-caption text-brand-text-subtle">
                  {t.mode === 'light' ? 'светлая' : 'тёмная'}
                </span>
              </div>
              <p className="mt-1.5 text-caption text-brand-text-muted">/{t.prefix} · /{t.key}</p>
              <p className="mt-1 text-caption text-brand-text-subtle">{t.intro}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-secondary press text-caption" onClick={() => { setPreview(t.key); push(`Просмотр шаблона «${t.key}»`, 'info'); }}>
                  <Eye size={14} weight="bold" aria-hidden="true" /> Просмотреть
                </button>
                <a href={`/dev/templates/${t.key}`} target="_blank" rel="noreferrer" className="btn-ghost press text-caption">
                  <ArrowSquareOut size={14} weight="bold" aria-hidden="true" /> Новая вкладка
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
      {preview && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-black/85 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-body-sm text-white">Просмотр шаблона: {preview}</span>
            <div className="flex items-center gap-2">
              <a href={`/dev/templates/${preview}`} target="_blank" rel="noreferrer" className="btn-secondary text-caption">Открыть в новой вкладке</a>
              <button type="button" className="btn-ghost text-caption" onClick={() => setPreview(null)}>
                <X size={14} weight="bold" aria-hidden="true" /> Закрыть
              </button>
            </div>
          </div>
          <iframe src={`/dev/templates/${preview}`} title={`Шаблон ${preview}`} className="min-h-0 w-full flex-1 rounded-2xl border border-white/10 bg-black" />
        </div>
      )}
    </div>
  );
}

// ---------- Телеграм-бот ----------
function Bot({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [stats, setStats] = useState<{ subscribers: number; businesses: number; sentBroadcasts: number; lastBroadcast: string | null }>({ subscribers: 0, businesses: 0, sentBroadcasts: 0, lastBroadcast: null });
  const [botOn, setBotOn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [commands, setCommands] = useState<string[]>(BOT_COMMANDS);
  const [editorOpen, setEditorOpen] = useState(false);
  const [commandsDraft, setCommandsDraft] = useState(BOT_COMMANDS.join('\n'));
  const [botBusy, setBotBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [st, integrations] = await Promise.all([getBotStatsAction(), getIntegrationsStatusAction()]);
      setStats(st);
      setBotOn(integrations.find((i) => i.key === 'telegram')?.configured ?? false);
    } catch {
      setStats({ subscribers: 0, businesses: 0, sentBroadcasts: 0, lastBroadcast: null });
      setBotOn(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const sendBroadcast = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await sendPlatformBroadcastAction(text.trim());
      if (!r.ok) { push(r.error ?? 'Не удалось отправить рассылку', 'error'); return; }
      setText('');
      if (r.total === 0) push('Нет бизнесов с подключённым ботом — рассылка не ушла', 'error');
      else push(`Отправлено ${r.sent} из ${r.total}${r.failed ? `, ошибок ${r.failed}` : ''}`, r.failed ? 'error' : 'success');
      await load();
    } catch {
      push('Не удалось отправить рассылку', 'error');
    } finally {
      setSending(false);
    }
  };

  const statusRows = [
    { label: 'Токен бота', value: botOn === null ? 'не проверено' : botOn ? 'задан' : 'не задан', ok: Boolean(botOn) },
    { label: 'Бизнесов с ботом', value: `${num(stats.subscribers)} из ${num(stats.businesses)}`, ok: stats.subscribers > 0 },
    { label: 'Рассылок отправлено', value: num(stats.sentBroadcasts), ok: stats.sentBroadcasts > 0 },
    { label: 'Последняя рассылка', value: stats.lastBroadcast ? new Date(stats.lastBroadcast).toLocaleString('ru-RU') : '—', ok: Boolean(stats.lastBroadcast) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={TelegramLogo} title="Телеграм-бот" desc="Реальное состояние бота и рассылки владельцам" />
        <RefreshBtn push={push} label="Обновить" message="Состояние бота обновлено" onRefresh={load} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#229ED9] text-white"><TelegramLogo size={24} weight="bold" aria-hidden="true" /></span>
            <div>
              <div className="text-heading-sm">Платформенный бот</div>
              <div className={`mt-0.5 flex items-center gap-1.5 text-caption ${botOn ? 'text-brand-success' : 'text-brand-text-subtle'}`}>
                <Check size={13} weight="bold" aria-hidden="true" /> {loading ? 'проверяем…' : botOn ? 'токен задан' : 'токен не задан'}
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {statusRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-2xl border border-white/[0.06] px-4 py-3">
                <span className="text-body-sm text-brand-text-muted">{r.label}</span>
                <span className={`inline-flex items-center gap-1.5 text-body-sm ${r.ok ? 'text-brand-success' : 'text-brand-text-subtle'}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <h3 className="text-heading-sm">Рассылка владельцам</h3>
          <p className="mt-1 text-caption text-brand-text-muted">Уходит бизнесам, у которых подключён бот</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Введите текст рассылки…" className="input mt-3 w-full resize-none" />
          <button type="button" className="btn-primary press mt-3 w-full text-body-sm" disabled={!text.trim() || sending} onClick={() => { void sendBroadcast(); }}>
            <TelegramLogo size={16} weight="bold" aria-hidden="true" /> {sending ? 'Отправляем…' : 'Отправить рассылку'}
          </button>
          <p className="mt-2 text-caption text-brand-text-subtle">
            {stats.subscribers === 0
              ? 'Сейчас бот не подключён ни у одного бизнеса — рассылка не уйдёт.'
              : `Получателей: ${num(stats.subscribers)}.`}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
        <h3 className="text-heading-sm">Команды бота</h3>
        <p className="mt-1 text-caption text-brand-text-muted">Меню команд обновляется в самом Telegram</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {commands.map((c) => (
            <span key={c} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-caption text-brand-text-muted">{c}</span>
          ))}
          <button type="button" className="rounded-full border border-white/10 px-3 py-1.5 text-caption text-brand-accent transition-colors hover:text-white" onClick={() => { setCommandsDraft(commands.join('\n')); setEditorOpen(true); }}>
            <ListChecks size={14} weight="bold" className="inline" aria-hidden="true" /> Управлять
          </button>
        </div>
      </div>

      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title="Команды бота">
        <div className="space-y-3">
          <p className="text-caption text-brand-text-muted">Одна команда на строку. Латиница, цифры и подчёркивание — требование Telegram.</p>
          <textarea className="input min-h-40 w-full resize-none" value={commandsDraft} onChange={(e) => setCommandsDraft(e.target.value)} />
          <button
            type="button"
            className="btn-primary text-body-sm"
            disabled={botBusy}
            onClick={async () => {
              const list = commandsDraft.split('\n').map((v) => v.trim()).filter(Boolean);
              setBotBusy(true);
              try {
                const r = await setBotCommandsAction(list);
                if (r.ok) {
                  setCommands(list);
                  setEditorOpen(false);
                  push(`Команды обновлены в боте (${r.applied})`, 'success');
                } else {
                  push(r.error ?? 'Не удалось обновить команды', 'error');
                }
              } catch {
                push('Не удалось обновить команды', 'error');
              } finally {
                setBotBusy(false);
              }
            }}
          >{botBusy ? 'Отправляем в Telegram…' : 'Сохранить'}</button>
        </div>
      </Sheet>
    </div>
  );
}

// ---------- Настройки ----------
type Tab = 'platform' | 'billing' | 'security' | 'notifications' | 'api';
function Settings({ push, demoData, onToggleDemo }: { push: (m: string, k?: ToastKind) => void; demoData: boolean; onToggleDemo: () => void }) {
  const [tab, setTab] = useState<Tab>('platform');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  useEffect(() => {
    getPlatformApiKeyAction()
      .then((r) => setApiKey(r.key))
      .catch(() => setApiKey(null));
  }, []);
  const rotateKey = async () => {
    setKeyBusy(true);
    try {
      const r = await rotatePlatformApiKeyAction();
      if (r.ok && r.key) { setApiKey(r.key); push('Новый API-ключ создан', 'success'); }
      else push(r.error ?? 'Не удалось создать ключ', 'error');
    } catch {
      push('Не удалось создать ключ', 'error');
    } finally {
      setKeyBusy(false);
    }
  };
  const [notif, setNotif] = useState({ newBooking: true, payment: true, review: false });
  const [platform, setPlatform] = useState({ name: '', email: '', tz: '' });
  const [platformBusy, setPlatformBusy] = useState(false);
  useEffect(() => {
    getPlatformSettingsAction()
      .then((r) => { if (r.value) setPlatform(r.value); })
      .catch(() => {});
    getNotificationSettingsAction()
      .then((r) => { if (r.value) setNotif(r.value); })
      .catch(() => {});
  }, []);
  const savePlatform = async () => {
    setPlatformBusy(true);
    try {
      const r = await savePlatformSettingsAction(platform);
      if (r.ok) { setSavedAt(new Date().toLocaleTimeString('ru-RU')); push('Настройки платформы сохранены', 'success'); }
      else push(r.error ?? 'Не удалось сохранить', 'error');
    } catch {
      push('Не удалось сохранить', 'error');
    } finally {
      setPlatformBusy(false);
    }
  };
  const saveNotif = async () => {
    setPlatformBusy(true);
    try {
      const r = await saveNotificationSettingsAction(notif);
      if (r.ok) { setNotifSavedAt(new Date().toLocaleTimeString('ru-RU')); push('Настройки уведомлений сохранены', 'success'); }
      else push(r.error ?? 'Не удалось сохранить', 'error');
    } catch {
      push('Не удалось сохранить', 'error');
    } finally {
      setPlatformBusy(false);
    }
  };
  const [sec, setSec] = useState({ twofa: true, ip: false, audit: true });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notifSavedAt, setNotifSavedAt] = useState<string | null>(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState({ current: '', next: '', repeat: '' });
  const [pwdBusy, setPwdBusy] = useState(false);
  const submitPassword = async () => {
    setPwdBusy(true);
    try {
      const r = await changeAdminPasswordAction(pwd.current, pwd.next);
      if (r.ok) {
        setPwd({ current: '', next: '', repeat: '' });
        setPwdOpen(false);
        push('Пароль администратора обновлён', 'success');
      } else {
        push(r.error ?? 'Не удалось обновить пароль', 'error');
      }
    } catch {
      push('Не удалось обновить пароль', 'error');
    } finally {
      setPwdBusy(false);
    }
  };
  const TABS: { key: Tab; label: string; icon: Icon }[] = [
    { key: 'platform', label: 'Платформа', icon: Gear },
    { key: 'billing', label: 'Биллинг', icon: CreditCard },
    { key: 'security', label: 'Безопасность', icon: ShieldCheck },
    { key: 'notifications', label: 'Уведомления', icon: Bell },
    { key: 'api', label: 'API', icon: Key },
  ];
  const plans = [
    { key: 'pro', name: 'POL', price: '4 900 ₽ / мес', perks: ['Сайт-визитка с онлайн-записью', 'Все шаблоны ниш', 'Телеграм-бот + рассылки', 'Поддержка'], current: true },
  ];
  return (
    <div className="space-y-5">
      <SectionHeader icon={Gear} title="Настройки платформы" desc="Общие параметры супер-админки" />
      <div className="flex flex-wrap gap-1 border-b border-white/[0.06] pb-1">
        {TABS.map((t) => {
          const Glyph = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-body-sm transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-brand-text-muted hover:text-white'}`}
            >
              <Glyph size={16} weight="bold" aria-hidden="true" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
        {tab === 'platform' && (
          <div className="max-w-xl space-y-4">
            <div><label className="label" htmlFor="s-name">Название платформы</label><input id="s-name" type="text" className="input" value={platform.name} onChange={(e) => setPlatform((p) => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="label" htmlFor="s-email">Email поддержки</label><input id="s-email" type="email" className="input" value={platform.email} onChange={(e) => setPlatform((p) => ({ ...p, email: e.target.value }))} /></div>
            <div><label className="label" htmlFor="s-tz">Часовой пояс по умолчанию</label><input id="s-tz" type="text" className="input" value={platform.tz} onChange={(e) => setPlatform((p) => ({ ...p, tz: e.target.value }))} /></div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] px-4 py-3">
              <div className="min-w-0">
                <div className="text-body-sm">Демо-данные</div>
                <div className="text-caption text-brand-text-subtle">Показывать демонстрационные значения в «Здоровье системы» — для показа платформы заказчику. Выключено: только реальные замеры. Выбор запоминается в браузере.</div>
              </div>
              <button type="button" role="switch" aria-checked={demoData} onClick={onToggleDemo} className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${demoData ? 'bg-brand-accent' : 'bg-white/15'}`}>
                <span className={`size-5 rounded-full bg-white transition-transform ${demoData ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" disabled={platformBusy} className="btn-primary press text-body-sm" onClick={() => { void savePlatform(); }}>{platformBusy ? 'Сохраняем…' : 'Сохранить'}</button>
              {savedAt && <span className="text-caption text-brand-text-subtle">сохранено в {savedAt}</span>}
            </div>
          </div>
        )}
        {tab === 'billing' && (
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((p) => (
              <div key={p.key} className={`rounded-3xl border p-5 ${p.current ? 'border-brand-accent/40 bg-brand-accent/5' : 'border-white/[0.06]'}`}>
                <div className="flex items-center justify-between"><h3 className="text-heading-sm">{p.name}</h3>{p.current && <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-caption text-brand-accent">текущий</span>}</div>
                <div className="mt-2 text-[22px] font-semibold">{p.price}</div>
                <ul className="mt-3 space-y-1.5 text-caption text-brand-text-muted">
                  {p.perks.map((x) => <li key={x} className="flex items-center gap-2"><Check size={14} weight="bold" className="text-brand-success" aria-hidden="true" />{x}</li>)}
                </ul>
                <button type="button" disabled={p.current} className={`mt-4 w-full text-body-sm ${p.current ? 'btn-secondary opacity-60' : 'btn-primary press'}`} onClick={() => { if (!p.current) push(`Тариф «${p.name}» выбран`, 'success'); }}>
                  {p.current ? 'Текущий тариф' : 'Выбрать'}
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === 'security' && (
          <div className="max-w-xl space-y-3">
            {([
              { key: 'twofa', label: 'Двухфакторная аутентификация' },
              { key: 'ip', label: 'Ограничить вход по IP' },
              { key: 'audit', label: 'Логировать действия админов' },
            ] as const).map((r) => (
              <div key={r.key} className="flex items-center justify-between rounded-2xl border border-white/[0.06] px-4 py-3">
                <span className="text-body-sm">{r.label}</span>
                <button type="button" className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${sec[r.key] ? 'bg-brand-accent' : 'bg-white/15'}`} aria-pressed={sec[r.key]} onClick={() => { setSec((p) => ({ ...p, [r.key]: !p[r.key] })); push(`${r.label}: ${sec[r.key] ? 'выкл' : 'вкл'}`, 'info'); }}>
                  <span className={`size-5 rounded-full bg-white transition-transform ${sec[r.key] ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            ))}
            <button type="button" className="btn-primary press text-body-sm" onClick={() => setPwdOpen(true)}>Сменить пароль админа</button>
          </div>
        )}
        {tab === 'notifications' && (
          <div className="max-w-xl space-y-3">
            {([
              { key: 'newBooking', label: 'Новая запись у бизнеса' },
              { key: 'payment', label: 'Оплата тарифа' },
              { key: 'review', label: 'Отзыв клиента' },
            ] as const).map((n) => (
              <div key={n.key} className="flex items-center justify-between rounded-2xl border border-white/[0.06] px-4 py-3">
                <span className="text-body-sm">{n.label}</span>
                <button type="button" className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${notif[n.key] ? 'bg-brand-accent' : 'bg-white/15'}`} aria-pressed={notif[n.key]} onClick={() => setNotif((p) => ({ ...p, [n.key]: !p[n.key] }))}>
                  <span className={`size-5 rounded-full bg-white transition-transform ${notif[n.key] ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button type="button" disabled={platformBusy} className="btn-primary press text-body-sm" onClick={() => { void saveNotif(); }}>{platformBusy ? 'Сохраняем…' : 'Сохранить'}</button>
              {notifSavedAt && <span className="text-caption text-brand-text-subtle">сохранено в {notifSavedAt}</span>}
            </div>
          </div>
        )}
        {tab === 'api' && (
          <div className="max-w-xl space-y-4">
            <div>
              <label className="label">API-ключ</label>
              <div className="flex items-center gap-2">
                <input value={apiKey ?? ''} readOnly placeholder="ключ ещё не создан" className="input font-mono text-caption" />
                <button
                  type="button"
                  disabled={!apiKey}
                  className="btn-secondary press shrink-0 text-caption"
                  onClick={() => { if (apiKey) { navigator.clipboard?.writeText(apiKey).catch(() => {}); push('API-ключ скопирован', 'success'); } }}
                >
                  <Copy size={14} weight="bold" aria-hidden="true" /> Копировать
                </button>
                <button type="button" disabled={keyBusy} className="btn-ghost press shrink-0 text-caption" onClick={rotateKey}>
                  <Sparkle size={14} weight="bold" aria-hidden="true" /> {keyBusy ? 'Создаём…' : apiKey ? 'Перевыпустить' : 'Создать ключ'}
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] p-4 text-caption text-brand-text-muted">
              <EnvelopeSimple size={15} weight="bold" className="mr-1 inline" aria-hidden="true" /> Webhook: <span className="font-mono">https://api.pol-saas.ru/v1/webhook</span>
            </div>
          </div>
        )}
      </div>

      <Sheet open={pwdOpen} onClose={() => setPwdOpen(false)} title="Смена пароля администратора">
        <div className="space-y-3">
          <label className="block">
            <span className="text-caption text-brand-text-subtle">Текущий пароль</span>
            <input type="password" value={pwd.current} onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} className="input mt-1 w-full" autoComplete="current-password" />
          </label>
          <label className="block">
            <span className="text-caption text-brand-text-subtle">Новый пароль (мин. 8 символов)</span>
            <input type="password" value={pwd.next} onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} className="input mt-1 w-full" autoComplete="new-password" />
          </label>
          <label className="block">
            <span className="text-caption text-brand-text-subtle">Повторите новый пароль</span>
            <input type="password" value={pwd.repeat} onChange={(e) => setPwd((p) => ({ ...p, repeat: e.target.value }))} className="input mt-1 w-full" autoComplete="new-password" />
          </label>
          {pwd.next.length > 0 && pwd.next.length < 8 && <p className="text-caption text-brand-error">Пароль короче 8 символов</p>}
          {pwd.repeat.length > 0 && pwd.next !== pwd.repeat && <p className="text-caption text-brand-error">Пароли не совпадают</p>}
          <button
            type="button"
            className="btn-primary w-full text-body-sm"
            disabled={pwdBusy || !pwd.current || pwd.next.length < 8 || pwd.next !== pwd.repeat}
            onClick={() => { void submitPassword(); }}
          >{pwdBusy ? 'Обновляем…' : 'Обновить пароль'}</button>
        </div>
      </Sheet>
    </div>
  );
}

// ---------- Командная палитра (⌘K) ----------
type Cmd = { id: string; label: string; hint: string; icon: Icon; run: () => void; group: string };
function CommandPalette({
  open, onClose, onNavigate, push,
}: {
  open: boolean; onClose: () => void; onNavigate: (s: Section) => void; push: (m: string, k?: ToastKind) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const commands: Cmd[] = useMemo(() => {
    const nav: Cmd[] = NAV_GROUPS.flatMap((g) => g.items).map((n) => {
      const Glyph = n.icon;
      return { id: `nav-${n.key}`, label: `Открыть: ${n.label}`, hint: 'раздел', icon: Glyph, group: 'Навигация', run: () => { onNavigate(n.key); onClose(); } };
    });
    const actions: Cmd[] = [
      { id: 'add-biz', label: 'Добавить бизнес', hint: 'действие', icon: Plus, group: 'Действия', run: () => { push('Открыта форма создания бизнеса', 'info'); onClose(); } },
      { id: 'broadcast', label: 'Отправить рассылку', hint: 'бот', icon: TelegramLogo, group: 'Действия', run: () => { onNavigate('bot'); onClose(); } },
      { id: 'gen-key', label: 'Сгенерировать API-ключ', hint: 'настройки', icon: Sparkle, group: 'Действия', run: () => { onNavigate('settings'); push('Сгенерирован новый API-ключ', 'success'); onClose(); } },
      { id: 'templates', label: 'Включить/выключить шаблон', hint: 'дизайн', icon: Stack, group: 'Действия', run: () => { onNavigate('templates'); onClose(); } },
      { id: 'security', label: 'Сменить пароль админа', hint: 'безопасность', icon: ShieldCheck, group: 'Действия', run: () => { onNavigate('settings'); onClose(); } },
    ];
    return [...nav, ...actions];
  }, [onNavigate, onClose, push]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? commands.filter((c) => c.label.toLowerCase().includes(t) || c.group.toLowerCase().includes(t)) : commands;
  }, [commands, q]);

  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-modal flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Командная палитра" style={{ zIndex: 300 }}>
      <div
        className="w-full max-w-xl animate-scale-in overflow-hidden rounded-3xl border border-brand-border bg-brand-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <MagnifyingGlass size={18} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Перейти или выполнить действие…"
            className="w-full bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle"
            aria-label="Команда"
          />
          <kbd className="hidden rounded-md border border-white/15 px-1.5 py-0.5 text-caption text-brand-text-subtle sm:block">Esc</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-body-sm text-brand-text-muted">Ничего не найдено.</li>}
          {filtered.map((c, i) => {
            const Glyph = c.icon;
            const showGroup = c.group !== lastGroup; lastGroup = c.group;
            return (
              <li key={c.id}>
                {showGroup && <div className="px-3 pb-1 pt-2 text-caption uppercase tracking-wide text-brand-text-subtle">{c.group}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={c.run}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${i === active ? 'bg-white/[0.08] text-white' : 'text-brand-text-muted'}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/85"><Glyph size={17} weight="bold" aria-hidden="true" /></span>
                  <span className="flex-1 text-body-sm">{c.label}</span>
                  <span className="text-caption text-brand-text-subtle">{c.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ---------- Аналитика ----------
// Данные берём из /api/analytics/summary: для супер-админа он отдаёт общий отчёт по платформе.
type SummarySeries = { date: string; value: number }[];
type SummaryPayload = {
  ok?: boolean;
  totals?: { bookings?: number; revenue?: number; views?: number; clients?: number };
  series?: { bookings?: SummarySeries; revenue?: SummarySeries; views?: SummarySeries };
};

function Analytics({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 29 * 86_400_000);
      const qs = new URLSearchParams({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        group_by: 'day',
      });
      const res = await fetch(`/api/analytics/summary?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as SummaryPayload);
    } catch {
      setErr('Не удалось загрузить аналитику');
      setData(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const totals = data?.totals ?? {};
  const series = data?.series?.bookings ?? [];
  const max = Math.max(1, ...series.map((p) => p.value));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={ChartLineUp} title="Аналитика платформы" desc="Записи, просмотры и выручка за 30 дней" />
        <RefreshBtn push={push} label="Обновить" message="Аналитика обновлена" onRefresh={load} />
      </div>

      {err && <div className="rounded-xl border border-brand-error/40 bg-brand-error/10 px-4 py-2 text-body-sm text-brand-error">{err}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Записей" value={num(totals.bookings ?? 0)} sub="за 30 дней" icon={CalendarBlank} />
        <StatCard label="Просмотров" value={num(totals.views ?? 0)} sub="сайтов" icon={Eye} />
        <StatCard label="Клиентов" value={num(totals.clients ?? 0)} sub="уникальных" icon={Users} />
        <StatCard label="Выручка" value={rub(totals.revenue ?? 0)} sub="за период" icon={CurrencyRub} />
      </div>

      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
        <h3 className="text-heading-sm">Записи по дням</h3>
        <p className="mt-1 text-caption text-brand-text-muted">Последние 30 дней</p>
        {loading && <p className="mt-4 text-caption text-brand-text-subtle">Загрузка…</p>}
        {!loading && series.length === 0 && (
          <p className="mt-4 text-body-sm text-brand-text-muted">Данных пока нет — события появятся, когда сайты начнут принимать посетителей.</p>
        )}
        {series.length > 0 && (
          <div className="mt-6 flex h-44 items-end gap-1">
            {series.map((p) => (
              <div key={p.date} className="flex flex-1 flex-col items-center gap-1" title={`${p.date}: ${p.value}`}>
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-md bg-brand-accent/40" style={{ height: `${Math.round((p.value / max) * 100)}%` }} />
                </div>
                <span className="text-[10px] text-brand-text-subtle">{p.date.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Пользователи ----------


function UsersSection({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; email: string; name: string | null; role: string; source: 'super_admin' | 'admin_user'; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getPlatformUsersAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const ROLE_LABEL: Record<string, string> = { super_admin: 'Супер-админ', owner: 'Владелец', manager: 'Менеджер', support: 'Поддержка' };

  const filtered = rows.filter((u) => {
    const t = q.trim().toLowerCase();
    return !t || u.email.toLowerCase().includes(t) || (u.name ?? '').toLowerCase().includes(t);
  });
  const supers = rows.filter((u) => u.source === 'super_admin').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={UsersThree} title="Пользователи и доступы" desc="Супер-админы платформы и администраторы бизнесов" />
        <RefreshBtn push={push} label="Обновить" message="Пользователи обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Всего" value={num(rows.length)} sub="аккаунтов" icon={UsersThree} />
        <StatCard label="Супер-админы" value={num(supers)} sub="полный доступ" icon={ShieldCheck} />
        <StatCard label="Админы бизнесов" value={num(rows.length - supers)} sub="в кабинетах" icon={Buildings} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 max-w-md">
        <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: email или имя…" className="w-full bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle" aria-label="Поиск пользователей" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <div className="hidden grid-cols-[1.6fr_1fr_0.9fr_0.9fr] gap-3 px-5 py-3 text-caption uppercase tracking-wide text-brand-text-subtle md:grid">
          <span>Пользователь</span><span>Роль</span><span>Источник</span><span>Создан</span>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка пользователей…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Пользователей нет. Супер-админы задаются списком SUPERADMIN_EMAILS.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((u) => (
            <li key={`${u.source}-${u.id}`} className="grid grid-cols-2 gap-x-3 gap-y-1 px-5 py-3.5 md:grid-cols-[1.6fr_1fr_0.9fr_0.9fr] md:items-center">
              <span className="min-w-0">
                <span className="block truncate text-body-sm">{u.name || u.email}</span>
                <span className="block truncate text-caption text-brand-text-subtle">{u.email}</span>
              </span>
              <span className="text-body-sm text-brand-text-muted">{ROLE_LABEL[u.role] ?? u.role}</span>
              <span className="text-caption text-brand-text-subtle">{u.source === 'super_admin' ? 'super_admins' : 'admin_users'}</span>
              <span className="text-caption text-brand-text-subtle">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('ru-RU') : '—'}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-caption text-brand-text-subtle">
        Доступ супер-админа определяется списком SUPERADMIN_EMAILS в окружении: из интерфейса он не выдаётся.
      </p>
    </div>
  );
}

// ---------- Финансы ----------
function Finance({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; business: string; amount: number; type: string; paidAt: string | null; note: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getPaymentsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthRows = rows.filter((r) => r.paidAt && new Date(r.paidAt) >= monthStart);
  const monthTotal = monthRows.reduce((sum, r) => sum + r.amount, 0);
  const allTotal = rows.reduce((sum, r) => sum + r.amount, 0);

  const exportCsv = () => {
    const header = 'Дата;Бизнес;Сумма;Тип;Комментарий';
    const lines = rows.map((r) => [
      r.paidAt ? new Date(r.paidAt).toLocaleDateString('ru-RU') : '—',
      r.business,
      r.amount,
      r.type,
      (r.note ?? '').replace(/;/g, ','),
    ].join(';'));
    const blob = new Blob(['\ufeff' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance.csv';
    a.click();
    URL.revokeObjectURL(url);
    push('Выписка выгружена (CSV)', 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Receipt} title="Финансы" desc="Платежи бизнесов из таблицы payments" />
        <div className="flex items-center gap-2">
          <RefreshBtn push={push} label="Обновить" message="Платежи обновлены" onRefresh={load} />
          <button type="button" className="btn-secondary press text-caption" disabled={rows.length === 0} onClick={exportCsv}>
            <ArrowDown size={16} weight="bold" aria-hidden="true" /> Выгрузить
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Выручка за месяц" value={rub(monthTotal)} sub={`${monthRows.length} платежей`} icon={CurrencyRub} />
        <StatCard label="Всего получено" value={rub(allTotal)} sub={`${rows.length} платежей`} icon={Receipt} />
        <StatCard label="Средний платёж" value={rows.length ? rub(Math.round(allTotal / rows.length)) : '—'} sub="по всем" icon={TrendUp} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <div className="hidden grid-cols-[1fr_1.4fr_0.9fr_1fr_1.2fr] gap-3 px-5 py-3 text-caption uppercase tracking-wide text-brand-text-subtle md:grid">
          <span>Дата</span><span>Бизнес</span><span>Сумма</span><span>Тип</span><span>Комментарий</span>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка платежей…</li>}
          {!loading && rows.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              Платежей пока нет — они появятся после первой оплаты подписки.
            </li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-2 gap-x-3 gap-y-1 px-5 py-3.5 md:grid-cols-[1fr_1.4fr_0.9fr_1fr_1.2fr] md:items-center">
              <span className="text-body-sm">{r.paidAt ? new Date(r.paidAt).toLocaleDateString('ru-RU') : '—'}</span>
              <span className="truncate text-body-sm">{r.business}</span>
              <span className="text-body-sm font-medium">{rub(r.amount)}</span>
              <span className="text-caption text-brand-text-muted">{r.type}</span>
              <span className="truncate text-caption text-brand-text-subtle">{r.note ?? '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Отзывы ----------


// ---------- Модерация ----------
function Moderation({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [items, setItems] = useState<{ id: string; name: string; slug: string; city: string | null; status: string; createdAt: string; hasSite: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await getModerationQueueAction()); }
    catch { setItems([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const decide = async (id: string, status: 'approved' | 'refused') => {
    setBusy(id);
    try {
      const r = await setBusinessStatusAction(id, status);
      if (!r.ok) { push(r.error ?? 'Не удалось изменить статус', 'error'); return; }
      setItems((p) => p.filter((m) => m.id !== id));
      push(status === 'approved' ? 'Заявка одобрена, бизнес активирован' : 'Заявка отклонена', status === 'approved' ? 'success' : 'info');
    } catch {
      push('Не удалось изменить статус', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={ShieldCheck} title="Модерация заявок" desc="Бизнесы со статусом «новая заявка» в базе" />
        <RefreshBtn push={push} label="Обновить" message="Очередь обновлена" onRefresh={load} />
      </div>

      {loading && <p className="text-caption text-brand-text-subtle">Загрузка очереди…</p>}

      {!loading && items.length === 0 && (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-10 text-center">
          <p className="text-body-sm text-brand-text-muted">Очередь пуста — все заявки обработаны.</p>
          <p className="mt-1 text-caption text-brand-text-subtle">Сюда попадают бизнесы со статусами «new» и «in_progress».</p>
        </div>
      )}

      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.id} className="rounded-3xl border border-brand-border bg-brand-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/85"><Buildings size={18} weight="bold" aria-hidden="true" /></span>
                <div>
                  <div className="text-body-sm font-medium">{m.name}</div>
                  <div className="text-caption text-brand-text-subtle">
                    {m.city ?? 'город не указан'} · /{m.slug} · {m.hasSite ? 'сайт готов' : 'сайта нет'}
                  </div>
                </div>
              </div>
              <span className="rounded-full border border-brand-accent/30 px-2 py-0.5 text-caption text-brand-accent">{m.status === 'new' ? 'новая' : 'в работе'}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary press text-body-sm" disabled={busy === m.id} onClick={() => { void decide(m.id, 'approved'); }}>
                <Check size={16} weight="bold" aria-hidden="true" /> Одобрить
              </button>
              <button type="button" className="btn-ghost press text-body-sm text-brand-error" disabled={busy === m.id} onClick={() => { void decide(m.id, 'refused'); }}>
                <Prohibit size={16} weight="bold" aria-hidden="true" /> Отклонить
              </button>
              <a className="btn-ghost press text-body-sm" href={`/preview/${m.slug}`} target="_blank" rel="noopener noreferrer">
                <Eye size={16} weight="bold" aria-hidden="true" /> Посмотреть сайт
              </a>
              <span className="ml-auto self-center text-caption text-brand-text-subtle">
                подано {m.createdAt ? new Date(m.createdAt).toLocaleString('ru-RU') : '—'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Журнал действий ----------
function Audit({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; action: string; entity: string; entityId: string | null; createdAt: string; payload: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getAuditLogAction(300)); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  // Тип события выводим из имени действия: ошибки/отказы — критично, отмены/блокировки — внимание.
  const kindOf = (action: string): 'ok' | 'warn' | 'danger' => {
    const a = action.toLowerCase();
    if (a.includes('error') || a.includes('failed') || a.includes('denied') || a.includes('violation')) return 'danger';
    if (a.includes('reject') || a.includes('block') || a.includes('refus') || a.includes('cancel') || a.includes('unsubscribe')) return 'warn';
    return 'ok';
  };
  const typeBadge = (t: 'ok' | 'warn' | 'danger') => t === 'ok' ? 'text-brand-success' : t === 'warn' ? 'text-brand-accent' : 'text-brand-error';
  const typeLabel = (t: 'ok' | 'warn' | 'danger') => t === 'ok' ? 'штатно' : t === 'warn' ? 'внимание' : 'критично';

  const filtered = rows.filter((a) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return a.action.toLowerCase().includes(t) || auditActionLabel(a.action).toLowerCase().includes(t)
      || a.entity.toLowerCase().includes(t) || (a.entityId ?? '').toLowerCase().includes(t);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={ListChecks} title="Журнал действий" desc="Реальные события из audit_log" />
        <RefreshBtn push={push} label="Обновить" message="Журнал обновлён" onRefresh={load} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-caption text-brand-text-muted">Всего записей: {rows.length}</span>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
          <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по действию, объекту или id…" className="w-64 bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle" aria-label="Поиск по журналу" />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <div className="hidden grid-cols-[1.6fr_1.1fr_1.2fr_0.7fr] gap-3 px-5 py-3 text-caption uppercase tracking-wide text-brand-text-subtle md:grid">
          <span>Действие</span><span>Объект</span><span>ID объекта</span><span>Когда</span>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка журнала…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Записей пока нет — журнал наполняется при действиях в платформе.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((a) => {
            const kind = kindOf(a.action);
            return (
              <li key={a.id} className="grid grid-cols-2 gap-x-3 gap-y-1 px-5 py-3.5 md:grid-cols-[1.6fr_1.1fr_1.2fr_0.7fr] md:items-center">
                <span className="min-w-0">
                  <span className="block truncate text-body-sm">{auditActionLabel(a.action)}</span>
                  <span className={`block truncate text-caption ${typeBadge(kind)}`}>
                    {typeLabel(kind)} · <span className="font-mono text-brand-text-subtle">{a.action}</span>
                  </span>
                </span>
                <span className="truncate text-body-sm text-brand-text-muted">{a.entity || '—'}</span>
                <span className="truncate font-mono text-caption text-brand-text-subtle" title={a.entityId ?? ''}>{a.entityId ? `${a.entityId.slice(0, 8)}…` : '—'}</span>
                <span className="text-caption text-brand-text-subtle">{a.createdAt ? new Date(a.createdAt).toLocaleString('ru-RU') : '—'}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ---------- География ----------
function Coverage({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ city: string; businesses: number; clients: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getCitiesAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const max = Math.max(1, ...rows.map((c) => c.businesses));
  const totalBiz = rows.reduce((sum, c) => sum + c.businesses, 0);
  const totalClients = rows.reduce((sum, c) => sum + c.clients, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={MapPin} title="География и покрытие" desc="Города присутствия по данным бизнесов" />
        <RefreshBtn push={push} label="Обновить" message="География обновлена" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Городов" value={String(rows.length)} sub="с бизнесами" icon={MapPin} />
        <StatCard label="Бизнесов" value={String(totalBiz)} sub="всего в базе" icon={Storefront} />
        <StatCard label="Клиентов" value={String(totalClients)} sub="оплативших" icon={Check} />
      </div>

      {loading && <p className="text-caption text-brand-text-subtle">Считаем города…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
          <p className="text-body-sm text-brand-text-muted">Пока нет бизнесов с указанным городом.</p>
          <p className="mt-1 text-caption text-brand-text-subtle">Город заполняется при создании бизнеса или импорте из парсера.</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((c) => (
          <div key={c.city} className="rounded-3xl border border-brand-border bg-brand-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><MapPin size={18} weight="bold" className="text-white/85" aria-hidden="true" /><span className="text-heading-sm">{c.city}</span></div>
              <span className="text-caption text-brand-text-muted">{c.clients} клиентов</span>
            </div>
            <div className="mt-4"><HBar label="Бизнесов" value={c.businesses} max={max} color="#4690ff" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Здоровье системы ----------
const HEALTH: { name: string; status: 'ok' | 'warn' | 'down'; uptime: string; detail: string; icon: Icon }[] = [
  { name: 'API (Next.js)', status: 'ok', uptime: '99.98%', detail: 'p95 120 мс', icon: Globe },
  { name: 'База данных', status: 'ok', uptime: '99.99%', detail: '8 мс', icon: Database },
  { name: 'Телеграм-бот', status: 'warn', uptime: '99.2%', detail: 'webhook задержка', icon: TelegramLogo },
  { name: 'Cron-задачи', status: 'ok', uptime: '100%', detail: 'запуск 2 мин назад', icon: CalendarBlank },
  { name: 'Хранилище файлов', status: 'down', uptime: '97.1%', detail: 'недоступно 4 мин', icon: Cloud },
];
type LiveHealth = { status: string; db: string; latency: number; version: string; uptime: number };

function Health({ push, demoData = true }: { push: (m: string, k?: ToastKind) => void; demoData?: boolean }) {
  const [live, setLive] = useState<LiveHealth | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Реальная проверка: опрашиваем собственный /api/health (он пингует БД).
  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const json = (await res.json()) as { status?: string; uptime_s?: number; version?: string; checks?: { db?: string; db_latency_ms?: number } };
      setLive({
        status: json.status ?? 'unknown',
        db: json.checks?.db ?? 'unknown',
        latency: Number(json.checks?.db_latency_ms ?? 0),
        version: json.version ?? '—',
        uptime: Number(json.uptime_s ?? 0),
      });
      setLastUpdated(new Date().toLocaleTimeString('ru-RU'));
      push(json.status === 'ok' ? 'Все проверки пройдены' : `Деградация: БД ${json.checks?.db ?? 'неизвестно'}`, json.status === 'ok' ? 'success' : 'error');
    } catch {
      setLive(null);
      push('Не удалось получить статус платформы', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { if (!demoData) void refresh(); }, [demoData]);

  // В реальном режиме показываем только то, что действительно проверено.
  const services: typeof HEALTH = demoData ? HEALTH : [
    { name: 'API (Next.js)', status: live ? (live.status === 'ok' ? 'ok' : 'warn') : 'warn', uptime: live ? (live.status === 'ok' ? 'доступен' : 'деградация') : 'не проверено', detail: live ? `версия ${live.version}` : 'нажмите «Обновить»', icon: Globe },
    { name: 'База данных', status: live ? (live.db === 'ok' ? 'ok' : live.db === 'timeout' ? 'warn' : 'down') : 'warn', uptime: live ? `${live.latency} мс` : 'не проверено', detail: live ? live.db : 'нажмите «Обновить»', icon: Database },
    { name: 'Телеграм-бот', status: 'warn', uptime: 'нет проверки', detail: 'нужен токен бота', icon: TelegramLogo },
    { name: 'Cron-задачи', status: 'warn', uptime: 'нет проверки', detail: 'смотрите журнал запусков', icon: CalendarBlank },
    { name: 'Хранилище файлов', status: 'warn', uptime: 'нет проверки', detail: 'внешний сервис', icon: Cloud },
  ];
  const errSeries = demoData ? [1, 0, 2, 1, 3, 2, 1, 0, 1, 2, 1, 0] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const dot = (s: 'ok' | 'warn' | 'down') => s === 'ok' ? 'bg-brand-success' : s === 'warn' ? 'bg-brand-accent' : 'bg-brand-error';
  const cls = (s: 'ok' | 'warn' | 'down') => s === 'ok' ? 'text-brand-success' : s === 'warn' ? 'text-brand-accent' : 'text-brand-error';
  const cards = [
    { label: 'Аптайм процесса', value: demoData ? '99.9%' : live ? `${Math.floor(live.uptime / 60)} мин` : '—', icon: Pulse, sub: demoData ? 'цель 99.5%' : 'с последнего старта' },
    { label: 'Статус платформы', value: demoData ? 'OK' : live ? (live.status === 'ok' ? 'OK' : 'DEGRADED') : '—', icon: WarningCircle, sub: demoData ? '−40% к неделе' : 'по /api/health' },
    { label: 'Задержка БД', value: demoData ? '120 мс' : live ? `${live.latency} мс` : '—', icon: Gauge, sub: demoData ? 'p95' : 'реальный замер' },
    { label: 'Активные бизнесы', value: demoData ? num(9862) : '—', icon: Buildings, sub: demoData ? 'по всей сети' : 'нет источника' },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Pulse} title="Здоровье системы" desc={`Статус сервисов и метрики${lastUpdated ? ` · обновлено ${lastUpdated}` : ''}`} />
        <button type="button" className="btn-secondary press text-body-sm" disabled={refreshing} onClick={() => { void refresh(); }}><ArrowDown size={16} weight="bold" aria-hidden="true" /> {refreshing ? 'Проверка…' : 'Обновить'}</button>
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {cards.map((c) => <StatCard key={c.label} {...c} />)}
      </section>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <h3 className="text-heading-sm">Ошибки в минуту (12 ч)</h3>
          <div className="mt-4"><MiniBars data={errSeries.map((v) => ({ label: '', value: v }))} color="#f59e0b" /></div>
        </div>
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <h3 className="text-heading-sm">Сервисы</h3>
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {!demoData && <li className="py-3 text-caption text-brand-text-subtle">Нет данных</li>}
            {services.map((s) => {
              const Glyph = s.icon;
              return (
                <li key={s.name} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3"><span className={`size-2.5 shrink-0 rounded-full ${dot(s.status)}`} /><Glyph size={18} weight="bold" className="text-white/85" aria-hidden="true" /><span className="text-body-sm">{s.name}</span></span>
                  <span className="text-right"><span className={`text-body-sm ${cls(s.status)}`}>{s.uptime}</span><span className="block text-caption text-brand-text-subtle">{s.detail}</span></span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

// ---------- Рассылки ----------
function Broadcasts({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; createdAt: string; sent: number; failed: number; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setHistory(await getBroadcastHistoryAction()); }
    catch { setHistory([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const totalSent = history.reduce((sum, b) => sum + b.sent, 0);

  // Реальная отправка: сообщение уходит владельцам бизнесов, подключившим бота.
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await sendPlatformBroadcastAction(text.trim());
      if (!r.ok) { push(r.error ?? 'Не удалось отправить рассылку', 'error'); return; }
      setText('');
      await load();
      if (r.total === 0) push('Нет бизнесов с подключённым ботом — рассылка не ушла', 'error');
      else push(`Отправлено ${r.sent} из ${r.total}${r.failed ? `, ошибок ${r.failed}` : ''}`, r.failed ? 'error' : 'success');
    } catch {
      push('Не удалось отправить рассылку', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <SectionHeader icon={Megaphone} title="Рассылки" desc="Рассылки предпринимателям (арендаторам) через Телеграм-бот" />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <h3 className="text-heading-sm">Новая рассылка</h3>
          <p className="mt-1 text-caption text-brand-text-muted">Отправка всем арендаторам платформы</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Введите текст рассылки…" className="input mt-3 w-full resize-none" />
          <button type="button" className="btn-primary press mt-3 w-full text-body-sm" disabled={!text.trim() || busy} onClick={() => { void send(); }}>
            <Megaphone size={16} weight="bold" aria-hidden="true" /> {busy ? 'Отправляем…' : 'Отправить рассылку'}
          </button>
          <p className="mt-2 text-caption text-brand-text-subtle">
            Получатели — владельцы бизнесов с подключённым Телеграм-ботом. Если бот не подключён ни у кого, рассылка не уйдёт.
          </p>
        </div>
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
          <div className="flex items-center justify-between"><h3 className="text-heading-sm">История рассылок</h3><span className="text-caption text-brand-text-subtle">всего отправлено: {num(totalSent)}</span></div>
          {loading && <p className="mt-3 text-caption text-brand-text-subtle">Загрузка истории…</p>}
          {!loading && history.length === 0 && (
            <p className="mt-3 text-caption text-brand-text-subtle">Рассылок ещё не было. Каждая отправка попадёт сюда из журнала.</p>
          )}
          <ul className="mt-3 space-y-3">
            {history.map((b) => (
              <li key={b.id} className="rounded-2xl border border-white/[0.06] p-3">
                <div className="text-body-sm">Рассылка от {b.createdAt ? new Date(b.createdAt).toLocaleString('ru-RU') : '—'}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption text-brand-text-muted">
                  <span>получателей {num(b.total)}</span>
                  <span>отправлено {num(b.sent)}</span>
                  {b.failed > 0 && <span className="text-brand-error">ошибок {num(b.failed)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

// ---------- Услуги ----------
// ---------- Тарифы ----------
// Тарифы читаются и пишутся в settings.tariffs — та же запись, по которой панель выставляет счёт.
type TariffRow = { key: string; name: string; price: number; perks: string[] };

function Plans({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<TariffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TariffRow | null>(null);
  const [draft, setDraft] = useState({ name: '', price: '', perks: '' });

  useEffect(() => {
    getTariffsAction()
      .then((r) => setRows(Object.entries(r.tariffs).map(([key, v]) => ({ key, ...v }))))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const saveAll = async () => {
    setBusy(true);
    try {
      const payload: Record<string, { name: string; price: number; perks: string[] }> = {};
      for (const r of rows) payload[r.key] = { name: r.name, price: r.price, perks: r.perks };
      const res = await saveTariffsAction(payload);
      if (res.ok) push('Тарифы сохранены', 'success');
      else push(res.error ?? 'Не удалось сохранить тарифы', 'error');
    } catch {
      push('Не удалось сохранить тарифы', 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyEdit = () => {
    if (!editing) return;
    const price = Number(draft.price.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(price) || price < 0) { push('Некорректная цена', 'error'); return; }
    setRows((prev) => prev.map((x) => x.key === editing.key ? {
      ...x,
      name: draft.name.trim() || x.name,
      price: Math.round(price),
      perks: draft.perks.split('\n').map((v) => v.trim()).filter(Boolean),
    } : x));
    setEditing(null);
    push('Тариф обновлён — не забудьте сохранить', 'info');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={CreditCard} title="Тарифы и биллинг" desc="Планы подписки, которые видит предприниматель" />
        <button type="button" className="btn-primary press text-body-sm" disabled={busy || loading} onClick={() => { void saveAll(); }}>
          {busy ? 'Сохраняем…' : 'Сохранить тарифы'}
        </button>
      </div>

      {loading && <p className="text-caption text-brand-text-subtle">Загрузка тарифов…</p>}
      {!loading && rows.length === 0 && <p className="text-body-sm text-brand-text-muted">Тарифы не заданы.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <div key={p.key} className="rounded-3xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-heading-sm">{p.name}</h3>
              <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-caption text-brand-text-subtle">{p.key}</span>
            </div>
            <div className="mt-2 text-[22px] font-semibold">{rub(p.price)}<span className="text-body-sm font-normal text-brand-text-muted"> / мес</span></div>
            <ul className="mt-3 space-y-1.5 text-caption text-brand-text-muted">
              {p.perks.map((x) => <li key={x} className="flex items-center gap-2"><Check size={14} weight="bold" className="text-brand-success" aria-hidden="true" />{x}</li>)}
              {p.perks.length === 0 && <li className="text-brand-text-subtle">Привилегии не указаны</li>}
            </ul>
            <button
              type="button"
              className="btn-ghost press mt-4 w-full text-caption"
              onClick={() => { setEditing(p); setDraft({ name: p.name, price: String(p.price), perks: p.perks.join('\n') }); }}
            ><Pencil size={14} weight="bold" aria-hidden="true" /> Редактировать</button>
          </div>
        ))}
      </div>

      <p className="text-caption text-brand-text-subtle">
        Цена отсюда используется при выставлении счёта предпринимателю. Изменения применяются после «Сохранить тарифы».
      </p>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Редактировать тариф">
        {editing && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-caption text-brand-text-subtle">Название</span>
              <input className="input mt-1 w-full" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-caption text-brand-text-subtle">Цена, ₽ / мес</span>
              <input className="input mt-1 w-full" inputMode="numeric" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-caption text-brand-text-subtle">Привилегии (одна на строку)</span>
              <textarea className="input mt-1 min-h-32 w-full resize-none" value={draft.perks} onChange={(e) => setDraft({ ...draft, perks: e.target.value })} />
            </label>
            <button type="button" className="btn-primary text-body-sm" onClick={applyEdit}>Применить</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------- Интеграции ----------
// Показываем только то, что реально проверяется по окружению и БД: без «включено» из воздуха.
const INTEGRATION_ICONS: Record<string, Icon> = {
  telegram: TelegramLogo,
  yookassa: CreditCard,
  email: EnvelopeSimple,
  vercel: Cloud,
  cron: CalendarBlank,
};

function Integrations({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ key: string; name: string; configured: boolean; detail: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getIntegrationsStatusAction();
      setRows(r);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const on = rows.filter((r) => r.configured).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Plugs} title="Интеграции" desc="Что реально настроено в окружении платформы" />
        <RefreshBtn push={push} label="Проверить" message="Статусы интеграций обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Подключено" value={`${on} из ${rows.length || 0}`} sub="проверено по env" icon={Plugs} />
        <StatCard label="Не настроено" value={String(Math.max(0, rows.length - on))} sub="нужны ключи" icon={WarningCircle} />
        <StatCard label="Проверка" value={loading ? 'идёт' : 'готово'} sub="без кеша" icon={Pulse} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {loading && <p className="text-caption text-brand-text-subtle">Проверяем интеграции…</p>}
        {!loading && rows.length === 0 && <p className="text-body-sm text-brand-text-muted">Нет данных: проверка недоступна.</p>}
        {rows.map((it) => {
          const Glyph = INTEGRATION_ICONS[it.key] ?? Plugs;
          return (
            <div key={it.key} className="flex items-center justify-between gap-3 rounded-3xl border border-brand-border bg-brand-surface p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/85"><Glyph size={20} weight="bold" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <div className="truncate text-body-sm font-medium">{it.name}</div>
                  <div className="truncate text-caption text-brand-text-subtle">{it.detail}</div>
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-caption ${it.configured ? 'border-brand-success/30 text-brand-success' : 'border-brand-error/30 text-brand-error'}`}>
                {it.configured ? 'подключено' : 'не настроено'}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-caption text-brand-text-subtle">
        Статус берётся из переменных окружения и таблицы почтовых ящиков. Ключи задаются в env на сервере, из интерфейса не меняются.
      </p>
    </div>
  );
}

// ---------- Уведомления ----------
function Notifications({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; channel: string; name: string; subject: string; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; subject: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await getNotifTemplatesAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (id: string, active: boolean) => {
    setRows((p) => p.map((t) => (t.id === id ? { ...t, active } : t)));
    const r = await toggleNotifTemplateAction(id, active);
    if (!r.ok) {
      setRows((p) => p.map((t) => (t.id === id ? { ...t, active: !active } : t)));
      push(r.error ?? 'Не удалось переключить шаблон', 'error');
    }
  };

  const saveTpl = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const r = await saveNotifTemplateAction(editing);
      if (r.ok) {
        setRows((p) => p.map((t) => (t.id === editing.id ? { ...t, name: editing.name, subject: editing.subject } : t)));
        setEditing(null);
        push('Шаблон сохранён', 'success');
      } else {
        push(r.error ?? 'Не удалось сохранить шаблон', 'error');
      }
    } catch {
      push('Не удалось сохранить шаблон', 'error');
    } finally {
      setBusy(false);
    }
  };

  const chLabel = (c: string) => c === 'email' ? 'Email' : c === 'sms' ? 'SMS' : c === 'telegram' ? 'Telegram' : c;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Bell} title="Шаблоны уведомлений" desc="Шаблоны из базы платформы: email, SMS, Telegram" />
        <RefreshBtn push={push} label="Обновить" message="Шаблоны обновлены" onRefresh={load} />
      </div>

      {loading && <p className="text-caption text-brand-text-subtle">Загрузка шаблонов…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
          <p className="text-body-sm text-brand-text-muted">В таблице шаблонов пока нет записей.</p>
          <p className="mt-1 text-caption text-brand-text-subtle">Шаблоны создаются миграцией или при подключении почтового ящика.</p>
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-brand-border bg-brand-surface p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-white/85"><Bell size={18} weight="bold" aria-hidden="true" /></span>
              <div><div className="text-body-sm font-medium">{t.name || 'Без названия'}</div><div className="text-caption text-brand-text-subtle">{t.subject || '—'}</div></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-caption text-brand-text-muted">{chLabel(t.channel)}</span>
              <button type="button" className="btn-ghost press text-caption" onClick={() => { void toggle(t.id, !t.active); }}>{t.active ? 'Вкл' : 'Выкл'}</button>
              <button type="button" className="btn-secondary press text-caption" onClick={() => setEditing({ id: t.id, name: t.name, subject: t.subject })}>
                <Pencil size={14} weight="bold" aria-hidden="true" /> Изменить
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Шаблон уведомления">
        {editing && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-caption text-brand-text-subtle">Название</span>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input mt-1 w-full" />
            </label>
            <label className="block">
              <span className="text-caption text-brand-text-subtle">Тема / заголовок</span>
              <input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} className="input mt-1 w-full" />
            </label>
            <button type="button" className="btn-primary w-full text-body-sm" disabled={busy || !editing.name.trim()} onClick={() => { void saveTpl(); }}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------- Бронирования ----------

function Bookings({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; business: string; client: string; phone: string | null; scheduledAt: string; status: string; service: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getBookingsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    new: { label: 'Новая', cls: 'border-brand-accent/30 text-brand-accent' },
    confirmed: { label: 'Подтверждена', cls: 'border-brand-success/30 text-brand-success' },
    cancelled: { label: 'Отменена', cls: 'border-brand-error/30 text-brand-error' },
    done: { label: 'Выполнена', cls: 'border-white/15 text-brand-text-muted' },
    no_show: { label: 'Не пришёл', cls: 'border-brand-error/30 text-brand-error' },
  };

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    return !t || r.business.toLowerCase().includes(t) || r.client.toLowerCase().includes(t) || r.service.toLowerCase().includes(t);
  });
  const today = new Date().toDateString();
  const todayCount = rows.filter((r) => new Date(r.scheduledAt).toDateString() === today).length;
  const pending = rows.filter((r) => r.status === 'new').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={CalendarBlank} title="Трафик записей" desc="Записи клиентов по всем бизнесам платформы" />
        <RefreshBtn push={push} label="Обновить" message="Записи обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Всего записей" value={String(rows.length)} sub="последние 300" icon={CalendarBlank} />
        <StatCard label="Сегодня" value={String(todayCount)} sub="по расписанию" icon={Clock} />
        <StatCard label="Ждут подтверждения" value={String(pending)} sub="статус «новая»" icon={WarningCircle} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 max-w-md">
        <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: бизнес, клиент, услуга…" className="w-full bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle" aria-label="Поиск записей" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <div className="hidden grid-cols-[1.2fr_1.1fr_1.3fr_0.9fr_0.8fr] gap-3 px-5 py-3 text-caption uppercase tracking-wide text-brand-text-subtle md:grid">
          <span>Когда</span><span>Бизнес</span><span>Клиент</span><span>Услуга</span><span>Статус</span>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка записей…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Записей пока нет — они появятся, когда клиенты начнут записываться.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((r) => {
            const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'border-white/15 text-brand-text-muted' };
            return (
              <li key={r.id} className="grid grid-cols-2 gap-x-3 gap-y-1 px-5 py-3.5 md:grid-cols-[1.2fr_1.1fr_1.3fr_0.9fr_0.8fr] md:items-center">
                <span className="text-body-sm">{r.scheduledAt ? new Date(r.scheduledAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span className="truncate text-body-sm text-brand-text-muted">{r.business}</span>
                <span className="min-w-0"><span className="block truncate text-body-sm">{r.client}</span><span className="block text-caption text-brand-text-subtle">{r.phone ?? 'без телефона'}</span></span>
                <span className="truncate text-body-sm text-brand-text-muted">{r.service}</span>
                <span><span className={`rounded-full border px-2 py-0.5 text-caption ${st.cls}`}>{st.label}</span></span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}


// ---------- Клиенты ----------

function Leads({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; name: string; phone: string | null; email: string | null; message: string | null; status: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getLeadsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    new: { label: 'Новый', cls: 'border-sky-400/30 text-sky-300' },
    contacted: { label: 'В работе', cls: 'border-amber-400/30 text-amber-300' },
    converted: { label: 'Конвертирован', cls: 'border-emerald-400/30 text-emerald-300' },
    refused: { label: 'Отказ', cls: 'border-rose-400/30 text-rose-300' },
  };

  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    return !t || r.name.toLowerCase().includes(t) || (r.phone ?? '').includes(t) || (r.email ?? '').toLowerCase().includes(t);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Sparkle} title="Лиды" desc="Входящие заявки с сайта и партнёрской программы" />
        <RefreshBtn push={push} label="Обновить" message="Лиды обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Всего" value={String(rows.length)} sub="заявок" icon={Sparkle} />
        <StatCard label="Новые" value={String(rows.filter((r) => r.status === 'new').length)} sub="не обработаны" icon={WarningCircle} />
        <StatCard label="В работе" value={String(rows.filter((r) => r.status === 'contacted').length)} sub="взяты в работу" icon={Clock} />
        <StatCard label="Конвертировано" value={String(rows.filter((r) => r.status === 'converted').length)} sub="стали клиентами" icon={Check} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 max-w-md">
        <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: имя, телефон, email…" className="w-full bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle" aria-label="Поиск лидов" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка лидов…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Лидов пока нет — заявки появятся с сайта и от партнёров.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((l) => {
            const st = STATUS_LABEL[l.status] ?? { label: l.status, cls: 'border-white/15 text-brand-text-muted' };
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium">{l.name}</span>
                  <span className="block truncate text-caption text-brand-text-subtle">{[l.phone, l.email].filter(Boolean).join(' · ') || 'нет контактов'}</span>
                  {l.message && <span className="mt-1 block truncate text-caption text-brand-text-muted">{l.message}</span>}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption ${st.cls}`}>{st.label}</span>
                <span className="shrink-0 text-caption text-brand-text-subtle">{l.createdAt ? new Date(l.createdAt).toLocaleDateString('ru-RU') : ''}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}


// ---------- Поддержка ----------
function Support({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; email: string | null; subject: string; message: string; status: string; priority: string; assignedTo: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | 'open' | 'in_progress' | 'done' | 'rejected'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getTicketsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    open: { label: 'Открыт', cls: 'border-sky-400/30 bg-sky-400/10 text-sky-300' },
    in_progress: { label: 'В работе', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
    done: { label: 'Решён', cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
    rejected: { label: 'Отклонён', cls: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300' },
  };

  const open = rows.find((t) => t.id === openId) ?? null;
  const filtered = rows.filter((t) => status === 'all' || t.status === status);

  const setStatusOf = async (id: string, next: string) => {
    const prev = rows;
    setRows((p) => p.map((t) => (t.id === id ? { ...t, status: next } : t)));
    const r = await setTicketStatusAction(id, next);
    if (!r.ok) { setRows(prev); push(r.error ?? 'Не удалось обновить тикет', 'error'); return; }
    push(`Тикет → ${STATUS_LABEL[next]?.label ?? next}`, 'success');
  };

  const sendReply = async () => {
    if (!open || !replyText.trim()) return;
    const r = await queuePlatformEmailAction({ to: open.email ?? '', subject: `Re: ${open.subject}`, body: replyText.trim() });
    if (!r.ok) { push(r.error ?? 'Не удалось отправить ответ', 'error'); return; }
    setReplyText('');
    setReplyOpen(false);
    push('Ответ поставлен в очередь отправки', 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={ChatTeardropText} title="Поддержка" desc="Обращения из таблицы support_tickets" />
        <RefreshBtn push={push} label="Обновить" message="Тикеты обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Всего тикетов" value={num(rows.length)} sub="за всё время" icon={ChatTeardropText} />
        <StatCard label="Открытые" value={num(rows.filter((t) => t.status === 'open').length)} sub="ждут ответа" icon={EnvelopeSimple} />
        <StatCard label="В работе" value={num(rows.filter((t) => t.status === 'in_progress').length)} sub="у агентов" icon={UsersThree} />
      </div>

      <div className="flex flex-wrap gap-2">
        {([['all', 'Все'], ['open', 'Открытые'], ['in_progress', 'В работе'], ['done', 'Решённые'], ['rejected', 'Отклонённые']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1.5 text-caption transition-colors ${status === k ? 'border-brand-accent/40 bg-brand-accent/10 text-white' : 'border-white/10 text-brand-text-muted hover:text-white'}`}>{label}</button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка тикетов…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Обращений нет — тикеты появляются из формы поддержки и почты.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((t) => {
            const st = STATUS_LABEL[t.status] ?? { label: t.status, cls: 'border-white/15 text-brand-text-muted' };
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <button type="button" onClick={() => { setOpenId(t.id); setReplyOpen(false); }} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-body-sm font-medium">{t.subject}</span>
                  <span className="block truncate text-caption text-brand-text-subtle">{t.email ?? 'без email'} · {t.createdAt ? new Date(t.createdAt).toLocaleString('ru-RU') : '—'}</span>
                </button>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption ${st.cls}`}>{st.label}</span>
                <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-caption" onClick={() => { setOpenId(t.id); setReplyOpen(false); }}>Открыть</button>
              </li>
            );
          })}
        </ul>
      </div>

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.subject ?? 'Тикет'}>
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-caption ${(STATUS_LABEL[open.status] ?? { cls: 'border-white/15 text-brand-text-muted' }).cls}`}>{(STATUS_LABEL[open.status] ?? { label: open.status }).label}</span>
              <span className="text-caption text-brand-text-subtle">{open.email ?? 'без email'} · {open.createdAt ? new Date(open.createdAt).toLocaleString('ru-RU') : '—'}</span>
            </div>
            <p className="rounded-2xl border border-brand-border bg-white/[0.02] p-3 text-body-sm text-brand-text-muted">{open.message || 'Текст обращения не заполнен.'}</p>
            {replyOpen && (
              <div className="space-y-2">
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} placeholder="Текст ответа клиенту…" className="input w-full resize-none" />
                <div className="flex gap-2">
                  <button type="button" className="btn-primary text-caption" disabled={!replyText.trim() || !open.email} onClick={() => { void sendReply(); }}>Отправить</button>
                  <button type="button" className="btn-ghost text-caption" onClick={() => { setReplyOpen(false); setReplyText(''); }}>Отмена</button>
                </div>
                {!open.email && <p className="text-caption text-brand-error">У обращения нет email — ответить некуда.</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => { void setStatusOf(open.id, 'in_progress'); }}><Play size={16} weight="bold" aria-hidden="true" /> Взять в работу</button>
              <button type="button" className="btn-secondary" onClick={() => { void setStatusOf(open.id, 'done'); }}><Check size={16} weight="bold" aria-hidden="true" /> Закрыть</button>
              <button type="button" className="btn-ghost" onClick={() => setReplyOpen(true)}><ChatTeardropText size={16} weight="bold" aria-hidden="true" /> Ответить</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------- Мастера / Сотрудники ----------


// ---------- Чат с предпринимателями (реальная переписка через Телеграм-бота) ----------
function chatWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Chat({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setThreads(await getChatThreadsAction()); } catch { setThreads([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openThread = useCallback(async (id: string) => {
    setSelected(id);
    setLoadingMessages(true);
    try { setMessages(await getChatMessagesAction(id)); } catch { setMessages([]); } finally { setLoadingMessages(false); }
  }, []);

  useEffect(() => {
    if (threads.length === 0) { setSelected(null); setMessages([]); return; }
    if (!selected || !threads.some((t) => t.id === selected)) void openThread(threads[0].id);
  }, [threads, selected, openThread]);

  const active = threads.find((t) => t.id === selected) ?? null;
  const filtered = threads.filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));
  const awaiting = threads.filter((t) => t.awaiting).length;
  const total = threads.reduce((s, t) => s + t.messages, 0);

  const send = async () => {
    const text = draft.trim();
    if (!text || !active || sending) return;
    setSending(true);
    const r = await sendChatMessageAction(active.id, text);
    setSending(false);
    if (!r.ok) { push(r.error ?? 'Не удалось отправить сообщение', 'error'); return; }
    setDraft('');
    push('Сообщение отправлено в Телеграм арендатора', 'success');
    await openThread(active.id);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={ChatTeardropText} title="Чат с предпринимателями" desc="Переписка из Телеграм-бота платформы: история сообщений и ответы арендаторам" />
        <RefreshBtn push={push} label="Обновить" message="Диалоги обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Диалогов" value={num(threads.length)} sub="с подключённым ботом" icon={ChatTeardropText} />
        <StatCard label="Ждут ответа" value={num(awaiting)} sub="последнее слово за арендатором" icon={EnvelopeSimple} />
        <StatCard label="Сообщений" value={num(total)} sub="в истории" icon={Users} />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/[0.06] bg-brand-surface p-10 text-center text-body-sm text-brand-text-muted">Загружаем диалоги…</div>
      ) : threads.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-brand-surface p-10 text-center">
          <div className="text-body-sm text-brand-text-muted">Диалогов пока нет</div>
          <div className="mt-1 text-caption text-brand-text-subtle">Переписка появляется, когда арендатор подключает Телеграм в кабинете и пишет боту.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-brand-surface">
            <div className="border-b border-white/[0.06] p-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} className="input w-full" placeholder="Поиск по диалогам…" aria-label="Поиск диалогов" />
            </div>
            <ul className="max-h-[420px] overflow-y-auto">
              {filtered.length === 0 && <li className="p-4 text-caption text-brand-text-subtle">Ничего не найдено</li>}
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => { void openThread(t.id); }}
                    className={`flex w-full items-center gap-3 border-b border-white/[0.04] p-3 text-left transition-colors ${selected === t.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                  >
                    <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.08] text-caption font-semibold text-brand-text">
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-body-sm font-medium">{t.name}</span>
                        <span className="shrink-0 text-caption text-brand-text-muted">{chatWhen(t.lastAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-caption ${t.awaiting ? 'text-brand-text' : 'text-brand-text-muted'}`}>{t.lastText || 'без текста'}</span>
                        {t.awaiting && <span className="shrink-0 rounded-full bg-brand-accent-solid px-1.5 text-[10px] font-semibold text-brand-accent-on">!</span>}
                      </span>
                      <span className="mt-1 inline-block rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-brand-text-muted">
                        {t.messages} сообщ. · {t.canReply ? 'бот подключён' : 'чат не привязан'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-brand-surface">
            {active ? (
              <>
                <div className="flex items-center justify-between border-b border-white/[0.06] p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-white/[0.08] text-caption font-semibold">{active.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <div className="text-body-sm font-medium">{active.name}</div>
                      <div className="text-caption text-brand-text-muted">
                        {active.chatId ? `Telegram · ${active.chatId}` : 'Telegram не привязан'}
                        {active.slug ? ` · /${active.slug}` : ''}
                      </div>
                    </div>
                  </div>
                  {active.slug && (
                    <a href={`/d/${active.slug}`} target="_blank" rel="noreferrer" className="btn-ghost text-caption">
                      <Eye size={14} weight="bold" aria-hidden="true" /> Сайт
                    </a>
                  )}
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {loadingMessages && <div className="text-center text-caption text-brand-text-subtle">Загружаем сообщения…</div>}
                  {!loadingMessages && messages.length === 0 && <div className="text-center text-caption text-brand-text-subtle">Сообщений нет</div>}
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-body-sm ${m.direction === 'out' ? 'bg-brand-accent-solid text-brand-accent-on' : 'bg-white/[0.06] text-brand-text'}`}>
                        <div>{m.text || '—'}</div>
                        <div className={`mt-1 text-[10px] ${m.direction === 'out' ? 'text-brand-accent-on/70' : 'text-brand-text-muted'}`}>{chatWhen(m.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t border-white/[0.06] p-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    className="input flex-1"
                    placeholder={active.canReply ? 'Написать сообщение…' : 'Телеграм арендатора не подключён'}
                    aria-label="Сообщение"
                    disabled={!active.canReply || sending}
                    maxLength={3500}
                  />
                  <button type="button" onClick={() => { void send(); }} disabled={!active.canReply || sending || !draft.trim()} className="btn-primary px-4 py-2 disabled:opacity-50">
                    {sending ? 'Отправляем…' : 'Отправить'}
                  </button>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-10 text-body-sm text-brand-text-muted">Выберите диалог</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Транзакции (детальная лента платежей) ----------


// ---------- Промокоды (реальные) ----------
function PromosLive({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; code: string; type: string; value: number; maxUses: number; used: number; validUntil: string | null; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getPromoCodesAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = rows.filter((r) => !q.trim() || r.code.toLowerCase().includes(q.trim().toLowerCase()));
  const typeLabel = (t: string, v: number) => t === 'percent' ? `−${v}%` : t === 'fixed' ? `−${rub(v)}` : t;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Tag} title="Промокоды" desc="Коды из таблицы promo_codes" />
        <RefreshBtn push={push} label="Обновить" message="Промокоды обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Всего кодов" value={num(rows.length)} sub="в базе" icon={Tag} />
        <StatCard label="Активные" value={num(rows.filter((r) => r.active).length)} sub="принимаются" icon={Check} />
        <StatCard label="Использований" value={num(rows.reduce((sum, r) => sum + r.used, 0))} sub="всего" icon={Receipt} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 max-w-sm">
        <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по коду…" className="w-full bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle" aria-label="Поиск промокодов" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка промокодов…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Промокодов нет — они создаются в базе и используются при оплате.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="rounded-xl border border-brand-accent/30 bg-brand-accent/10 px-2.5 py-1 font-mono text-body-sm font-semibold text-brand-accent">{r.code}</span>
              <span className="text-body-sm text-brand-text-muted">{typeLabel(r.type, r.value)}</span>
              <span className="text-caption text-brand-text-subtle">использовано {r.used}{r.maxUses > 0 ? ` из ${r.maxUses}` : ''}</span>
              <span className="text-caption text-brand-text-subtle">до {r.validUntil ? new Date(r.validUntil).toLocaleDateString('ru-RU') : 'бессрочно'}</span>
              <span className={`ml-auto rounded-full border px-2 py-0.5 text-caption ${r.active ? 'border-brand-success/30 text-brand-success' : 'border-white/15 text-brand-text-subtle'}`}>{r.active ? 'активен' : 'выключен'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Вебхуки: входящие события ----------
function WebhooksLive({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; source: string; eventId: string | null; processedAt: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getWebhookEventsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const unprocessed = rows.filter((r) => !r.processedAt).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Plugs} title="Вебхуки" desc="Входящие события из таблицы webhook_events" />
        <RefreshBtn push={push} label="Обновить" message="События обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Событий" value={num(rows.length)} sub="последние 200" icon={Plugs} />
        <StatCard label="Не обработано" value={num(unprocessed)} sub="в очереди" icon={WarningCircle} />
        <StatCard label="Обработано" value={num(rows.length - unprocessed)} sub="успешно" icon={Check} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка событий…</li>}
          {!loading && rows.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              Событий нет — они появляются при вызовах вебхуков (оплата, письма, бот).
            </li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-caption text-brand-text-muted">{r.source}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-caption text-brand-text-subtle">{r.eventId ?? '—'}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption ${r.processedAt ? 'border-brand-success/30 text-brand-success' : 'border-brand-accent/30 text-brand-accent'}`}>{r.processedAt ? 'обработано' : 'в очереди'}</span>
              <span className="shrink-0 text-caption text-brand-text-subtle">{r.createdAt ? new Date(r.createdAt).toLocaleString('ru-RU') : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Транзакции: детальная лента платежей ----------
function TransactionsLive({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; business: string; amount: number; type: string; paidAt: string | null; note: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getPaymentsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Receipt} title="Транзакции" desc="Лента платежей из таблицы payments" />
        <RefreshBtn push={push} label="Обновить" message="Транзакции обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Транзакций" value={num(rows.length)} sub="последние 300" icon={Receipt} />
        <StatCard label="Сумма" value={rub(total)} sub="по ленте" icon={CurrencyRub} />
        <StatCard label="Средний чек" value={rows.length ? rub(Math.round(total / rows.length)) : '—'} sub="на транзакцию" icon={TrendUp} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка транзакций…</li>}
          {!loading && rows.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Транзакций нет — они появятся после первой оплаты.</li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1 truncate text-body-sm">{r.business}</span>
              <span className="text-caption text-brand-text-muted">{r.type}</span>
              <span className="text-body-sm font-medium">{rub(r.amount)}</span>
              <span className="text-caption text-brand-text-subtle">{r.paidAt ? new Date(r.paidAt).toLocaleString('ru-RU') : 'не оплачено'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Галерея: фотографии бизнесов ----------
function GalleryLive({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; business: string; url: string; alt: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getPhotosAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Eye} title="Галерея" desc="Фотографии из таблицы photos" />
        <RefreshBtn push={push} label="Обновить" message="Галерея обновлена" onRefresh={load} />
      </div>

      {loading && <p className="text-caption text-brand-text-subtle">Загрузка фотографий…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
          <p className="text-body-sm text-brand-text-muted">Фотографий пока нет.</p>
          <p className="mt-1 text-caption text-brand-text-subtle">Они загружаются предпринимателями в кабинете бизнеса.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((ph) => (
          <figure key={ph.id} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-brand-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph.url} alt={ph.alt ?? ph.business} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            <figcaption className="truncate px-3 py-2 text-caption text-brand-text-subtle">{ph.business}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ---------- Каталог услуг платформы ----------
function ServicesLive({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; business: string; name: string; price: number; duration: number; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getAllServicesAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()) || r.business.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={Wrench} title="Каталог услуг" desc="Все услуги бизнесов из таблицы services" />
        <RefreshBtn push={push} label="Обновить" message="Услуги обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Услуг" value={num(rows.length)} sub="в каталогах" icon={Wrench} />
        <StatCard label="Активных" value={num(rows.filter((r) => r.active).length)} sub="показываются" icon={Check} />
        <StatCard label="Бизнесов" value={num(new Set(rows.map((r) => r.business)).size)} sub="с услугами" icon={Storefront} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 max-w-md">
        <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: услуга или бизнес…" className="w-full bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle" aria-label="Поиск услуг" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Загрузка услуг…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Услуг пока нет — их добавляют предприниматели в кабинете.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1 truncate text-body-sm">{r.name}</span>
              <span className="truncate text-caption text-brand-text-muted">{r.business}</span>
              <span className="text-body-sm">{rub(r.price)}</span>
              <span className="text-caption text-brand-text-subtle">{r.duration} мин</span>
              <span className={`rounded-full border px-2 py-0.5 text-caption ${r.active ? 'border-brand-success/30 text-brand-success' : 'border-white/15 text-brand-text-subtle'}`}>{r.active ? 'активна' : 'скрыта'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Клиенты: агрегат по записям ----------
function ClientsLive({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ key: string; name: string; phone: string | null; email: string | null; bookings: number; lastVisit: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRows(await getClientsFromBookingsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()) || (r.phone ?? '').includes(q.trim()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={UserCircle} title="Клиенты" desc="Собраны по записям: отдельной таблицы клиентов нет" />
        <RefreshBtn push={push} label="Обновить" message="Клиенты обновлены" onRefresh={load} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Клиентов" value={num(rows.length)} sub="уникальных" icon={UserCircle} />
        <StatCard label="С записями" value={num(rows.filter((r) => r.bookings > 1).length)} sub="приходили повторно" icon={CalendarBlank} />
        <StatCard label="С контактами" value={num(rows.filter((r) => r.phone || r.email).length)} sub="телефон или email" icon={EnvelopeSimple} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 max-w-md">
        <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: имя или телефон…" className="w-full bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle" aria-label="Поиск клиентов" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">Собираем клиентов…</li>}
          {!loading && filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-body-sm text-brand-text-muted">
              {rows.length === 0 ? 'Клиентов нет — они появятся после первых записей.' : 'Ничего не найдено.'}
            </li>
          )}
          {filtered.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm">{r.name}</span>
                <span className="block truncate text-caption text-brand-text-subtle">{[r.phone, r.email].filter(Boolean).join(' · ') || 'нет контактов'}</span>
              </span>
              <span className="text-caption text-brand-text-muted">записей: {r.bookings}</span>
              <span className="text-caption text-brand-text-subtle">{r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('ru-RU') : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Локации: адреса бизнесов ----------
function LocationsLive({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; business: string; address: string; city: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getLocationsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader icon={MapPin} title="Локации" desc="Адреса бизнесов из таблицы businesses" />
        <RefreshBtn push={push} label="Обновить" message="Локации обновлены" onRefresh={load} />
      </div>

      {loading && <p className="text-caption text-brand-text-subtle">Загрузка адресов…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
          <p className="text-body-sm text-brand-text-muted">Адреса не заполнены.</p>
          <p className="mt-1 text-caption text-brand-text-subtle">Адрес указывается в кабинете бизнеса или при импорте из парсера.</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-3xl border border-brand-border bg-brand-surface p-4">
            <div className="text-body-sm font-medium">{r.business}</div>
            <div className="mt-1 text-caption text-brand-text-muted">{r.address}</div>
            {r.city && <div className="text-caption text-brand-text-subtle">{r.city}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Мастера и отзывы: таблиц в базе нет ----------
function EmptyByDesign({ title, desc, why }: { title: string; desc: string; why: string }) {
  return (
    <div className="space-y-5">
      <SectionHeader icon={UsersThree} title={title} desc={desc} />
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
        <p className="text-body-sm text-brand-text-muted">Раздел не подключён к базе.</p>
        <p className="mx-auto mt-2 max-w-xl text-caption text-brand-text-subtle">{why}</p>
      </div>
    </div>
  );
}

// ---------- корневой компонент ----------
type Section = 'dashboard' | 'businesses' | 'bookings' | 'clients' | 'chat' | 'leads' | 'masters' | 'locations' | 'promos' | 'support' | 'webhooks' | 'gallery' | 'analytics' | 'users' | 'finance' | 'transactions' | 'reviews' | 'templates' | 'bot' | 'settings' | 'moderation' | 'audit' | 'coverage' | 'health' | 'broadcasts' | 'services' | 'plans' | 'integrations' | 'notifications' | 'growth' | 'reliability' | 'misc' | 'partners' | 'ready' | 'preview';
// Скрытые разделы (временно вне навигации; код сохранён для быстрого возврата): Promos, WebhooksPanel, Transactions, Gallery, BookingDrawer, Clients, Services.

// ===================== НОВЫЕ РАЗДЕЛЫ (идеи из обсуждения) =====================
function Onboarding({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [data, setData] = useState<{ funnel: { total: number; inProgress: number; approved: number; clients: number; refused: number } } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await getGrowthStatsAction()); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const f = data?.funnel ?? { total: 0, inProgress: 0, approved: 0, clients: 0, refused: 0 };
  const steps = [
    { label: 'Всего бизнесов', value: f.total },
    { label: 'В работе', value: f.inProgress },
    { label: 'Одобрены', value: f.approved },
    { label: 'Стали клиентами', value: f.clients },
    { label: 'Отказ / архив', value: f.refused },
  ];
  const max = Math.max(1, ...steps.map((x) => x.value));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={ArrowDown} title="Онбординг предпринимателей" desc="Воронка по статусам бизнесов в базе" />
        <RefreshBtn push={push} onRefresh={load} />
      </div>
      {loading && <p className="text-caption text-brand-text-subtle">Считаем воронку…</p>}
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        {steps.map((st) => (
          <div key={st.label} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between text-body-sm"><span>{st.label}</span><span className="text-brand-text-muted">{num(st.value)}</span></div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-brand-accent" style={{ width: `${Math.round((st.value / max) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Subscriptions({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [data, setData] = useState<{ subs: { active: number; expiring7: number; expired: number }; money: { monthTotal: number; monthCount: number; avg: number } } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await getGrowthStatsAction()); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const subs = data?.subs ?? { active: 0, expiring7: 0, expired: 0 };
  const money = data?.money ?? { monthTotal: 0, monthCount: 0, avg: 0 };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={CurrencyRub} title="Подписки и выручка" desc="Реальные платежи и сроки подписок" />
        <RefreshBtn push={push} onRefresh={load} />
      </div>
      {loading && <p className="text-caption text-brand-text-subtle">Считаем подписки…</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Активных подписок" value={num(subs.active)} sub="subscription_active" icon={Check} />
        <StatCard label="Истекают за 7 дней" value={num(subs.expiring7)} sub="нужно продление" icon={WarningCircle} />
        <StatCard label="Просрочены" value={num(subs.expired)} sub="срок прошёл" icon={TrendDown} />
        <StatCard label="Выручка за месяц" value={rub(money.monthTotal)} sub={`${num(money.monthCount)} платежей`} icon={CurrencyRub} />
        <StatCard label="Средний платёж" value={money.avg ? rub(money.avg) : '—'} sub="за месяц" icon={TrendUp} />
        <StatCard label="Всего бизнесов" value={num(subs.active + subs.expired)} sub="с подпиской в базе" icon={Storefront} />
      </div>
    </div>
  );
}

function GeoPlan({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ city: string; businesses: number; clients: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getCitiesAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const max = Math.max(1, ...rows.map((c) => c.businesses));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={Globe} title="Гео-план расширения" desc="Где уже есть бизнесы — по данным базы" />
        <RefreshBtn push={push} onRefresh={load} />
      </div>
      {loading && <p className="text-caption text-brand-text-subtle">Считаем города…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
          <p className="text-body-sm text-brand-text-muted">Городов пока нет — они появятся вместе с бизнесами.</p>
        </div>
      )}
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        <h3 className="mb-4 text-heading-sm">Бизнесы по городам</h3>
        <div className="space-y-3">
          {rows.map((c) => <HBar key={c.city} label={c.city} value={c.businesses} max={max} color="#4690ff" />)}
        </div>
      </div>
    </div>
  );
}

function Incidents() {
  return (
    <div className="space-y-5">
      <SectionHeader icon={WarningCircle} title="Инциденты и SLA" desc="Отдельного журнала инцидентов в базе нет" />
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
        <p className="text-body-sm text-brand-text-muted">Инциденты не ведутся в отдельной таблице.</p>
        <p className="mx-auto mt-2 max-w-xl text-caption text-brand-text-subtle">
          Фактические сбои видны в «Журнале действий» (события с ошибками) и в «Здоровье системы». Раздел появится, если заведём таблицу инцидентов.
        </p>
      </div>
    </div>
  );
}

function IntHealth({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ key: string; name: string; configured: boolean; detail: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getIntegrationsStatusAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const on = rows.filter((r) => r.configured).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={Pulse} title="Здоровье интеграций" desc="Статус внешних сервисов по окружению" />
        <RefreshBtn push={push} label="Проверить" onRefresh={load} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Подключено" value={`${on} из ${rows.length}`} sub="проверено" icon={Check} />
        <StatCard label="Не настроено" value={String(Math.max(0, rows.length - on))} sub="нужны ключи" icon={WarningCircle} />
        <StatCard label="Проверка" value={loading ? 'идёт' : 'готово'} sub="без кеша" icon={Pulse} />
      </div>
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        <ul className="divide-y divide-white/[0.06]">
          {loading && <li className="py-3 text-caption text-brand-text-subtle">Проверяем…</li>}
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-body-sm">{r.name}</span>
              <span className="text-caption text-brand-text-subtle">{r.detail}</span>
              <span className={`rounded-full border px-2 py-0.5 text-caption ${r.configured ? 'border-brand-success/30 text-brand-success' : 'border-brand-error/30 text-brand-error'}`}>{r.configured ? 'ок' : 'нет'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Domains({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ id: string; business: string; domain: string; subscriptionUntil: string | null; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await getDomainsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={Cloud} title="Кастом-домены" desc="Домены из карточек бизнесов" />
        <RefreshBtn push={push} onRefresh={load} />
      </div>
      {loading && <p className="text-caption text-brand-text-subtle">Загрузка доменов…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
          <p className="text-body-sm text-brand-text-muted">Кастомных доменов пока нет.</p>
          <p className="mt-1 text-caption text-brand-text-subtle">Домен подключается в кабинете бизнеса (поле custom_domain).</p>
        </div>
      )}
      <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
        <ul className="divide-y divide-white/[0.06]">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1 truncate text-body-sm">{d.business}</span>
              <span className="truncate font-mono text-caption text-brand-text-muted">{d.domain}</span>
              <span className="text-caption text-brand-text-subtle">до {d.subscriptionUntil ? new Date(d.subscriptionUntil).toLocaleDateString('ru-RU') : '—'}</span>
              <span className={`rounded-full border px-2 py-0.5 text-caption ${d.active ? 'border-brand-success/30 text-brand-success' : 'border-brand-error/30 text-brand-error'}`}>{d.active ? 'активен' : 'не оплачен'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Abuse() {
  return (
    <div className="space-y-5">
      <SectionHeader icon={Prohibit} title="Модерация контента" desc="Жалоб на сайты в базе нет" />
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-8 text-center">
        <p className="text-body-sm text-brand-text-muted">Таблицы жалоб в схеме нет.</p>
        <p className="mx-auto mt-2 max-w-xl text-caption text-brand-text-subtle">
          Обращения по контенту приходят в «Поддержку» и попадают в support_tickets — там их можно закрыть или отклонить. Отдельный раздел жалоб появится вместе с таблицей.
        </p>
      </div>
    </div>
  );
}

function FeatureFlags({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [flags, setFlags] = useState<{ key: string; name: string; on: boolean; roll: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getFeatureFlagsAction()
      .then((r) => setFlags(r))
      .catch(() => setFlags([]))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: string, patch: Partial<{ on: boolean; roll: number }>) => {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await saveFeatureFlagsAction(flags);
      if (r.ok) { setDirty(false); push(`Флаги сохранены (${flags.filter((f) => f.on).length} активных)`, 'success'); }
      else push(r.error ?? 'Не удалось сохранить флаги', 'error');
    } catch {
      push('Не удалось сохранить флаги', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={Wrench} title="Фича-флаги" desc="Включение функций по долям бизнесов" />
        <button type="button" disabled={!dirty || busy} onClick={() => { void save(); }} className="btn-primary press text-caption">
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        {loading && <p className="text-caption text-brand-text-subtle">Загрузка флагов…</p>}
        <ul className="divide-y divide-white/[0.06]">
          {flags.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-body-sm">{f.name}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={f.roll}
                disabled={!f.on}
                onChange={(e) => update(f.key, { roll: Number(e.target.value) })}
                aria-label={`Раскат ${f.name}`}
                className="h-1 w-28 accent-brand-accent disabled:opacity-40"
              />
              <span className="w-12 text-right text-caption text-brand-text-muted">{f.roll}%</span>
              <button
                type="button"
                role="switch"
                aria-checked={f.on}
                aria-label={`${f.name}: ${f.on ? 'включён' : 'выключен'}`}
                onClick={() => update(f.key, { on: !f.on, roll: f.on ? 0 : Math.max(f.roll, 10) })}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${f.on ? 'border-brand-accent bg-brand-accent/30' : 'border-white/15 bg-white/[0.06]'}`}
              >
                <span className={`absolute top-0.5 size-5 rounded-full transition-all ${f.on ? 'left-[22px] bg-brand-accent' : 'left-0.5 bg-white/40'}`} />
              </button>
              <span className={`w-10 text-right text-caption ${f.on ? 'text-brand-success' : 'text-brand-text-subtle'}`}>{f.on ? 'ВКЛ' : 'ВЫКЛ'}</span>
            </li>
          ))}
        </ul>
        {dirty && <p className="mt-3 text-caption text-brand-accent">Есть несохранённые изменения</p>}
      </div>
    </div>
  );
}

// ---------- Система: реальные данные процесса и БД ----------
function SystemInfo({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [health, setHealth] = useState<{ status: string; db: string; latency: number; version: string; uptime: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const j = (await res.json()) as { status?: string; uptime_s?: number; version?: string; checks?: { db?: string; db_latency_ms?: number } };
      setHealth({
        status: j.status ?? 'unknown',
        db: j.checks?.db ?? 'unknown',
        latency: Number(j.checks?.db_latency_ms ?? 0),
        version: j.version ?? '—',
        uptime: Number(j.uptime_s ?? 0),
      });
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const rows = health ? [
    ['Статус платформы', health.status === 'ok' ? 'OK' : 'DEGRADED'],
    ['Версия сборки', health.version],
    ['База данных', health.db === 'ok' ? `отвечает, ${health.latency} мс` : health.db],
    ['Аптайм процесса', `${Math.floor(health.uptime / 60)} мин`],
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={Pulse} title="Состояние системы" desc="Реальные данные процесса и базы" />
        <RefreshBtn push={push} label="Проверить" message="Состояние обновлено" onRefresh={load} />
      </div>
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        {loading && <p className="text-caption text-brand-text-subtle">Проверяем…</p>}
        {!loading && !health && <p className="text-body-sm text-brand-text-muted">Не удалось получить состояние платформы.</p>}
        <ul className="divide-y divide-white/[0.06]">
          {rows.map(([label, value]) => (
            <li key={label} className="flex items-center justify-between gap-3 py-3">
              <span className="text-body-sm text-brand-text-muted">{label}</span>
              <span className="text-body-sm">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Бэкапы: реальные файлы из хранилища ----------
function Backups({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<{ name: string; size: number; updated: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await listBackupsAction()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const sizeLabel = (bytes: number) => bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} МБ` : bytes >= 1024 ? `${Math.round(bytes / 1024)} КБ` : `${bytes} Б`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader icon={Database} title="Резервные копии" desc="Файлы в хранилище платформы" />
        <RefreshBtn push={push} label="Обновить" message="Список бэкапов обновлён" onRefresh={load} />
      </div>
      <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        {loading && <p className="text-caption text-brand-text-subtle">Загрузка списка…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-body-sm text-brand-text-muted">Бэкапов нет. Они создаются ночной cron-задачей и складываются в хранилище.</p>
        )}
        <ul className="divide-y divide-white/[0.06]">
          {rows.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 flex-1 truncate font-mono text-body-sm">{b.name}</span>
              <span className="text-caption text-brand-text-muted">{sizeLabel(b.size)}</span>
              <span className="text-caption text-brand-text-subtle">{b.updated ? new Date(b.updated).toLocaleString('ru-RU') : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- составные разделы: тонкие блоки собраны в плотные вкладки ----------
function PanelNav({ items, onJump }: { items: { id: string; label: string }[]; onJump: (id: string) => void }) {
  return (
    <div className="sticky top-16 z-sticky -mx-1 flex flex-wrap gap-2 rounded-2xl border border-white/[0.06] bg-black/70 px-3 py-2 backdrop-blur-xl">
      {items.map((s) => (
        <button key={s.id} type="button" onClick={() => onJump(s.id)} className="btn-ghost press text-caption">{s.label}</button>
      ))}
    </div>
  );
}

function GrowthPanel({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const items = [
    { id: 'g-onb', label: 'Онбординг' },
    { id: 'g-sub', label: 'Подписки' },
    { id: 'g-par', label: 'Партнёры' },
    { id: 'g-geo', label: 'Гео-план' },
  ];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="space-y-8">
      <PanelNav items={items} onJump={jump} />
      <section id="g-onb" className="scroll-mt-28"><Onboarding push={push} /></section>
      <section id="g-sub" className="scroll-mt-28"><Subscriptions push={push} /></section>
      <section id="g-par" className="scroll-mt-28"><Partners push={push} /></section>
      <section id="g-geo" className="scroll-mt-28"><GeoPlan push={push} /></section>
    </div>
  );
}

function ReliabilityPanel({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const items = [
    { id: 'r-inc', label: 'Инциденты' },
    { id: 'r-int', label: 'Интеграции' },
    { id: 'r-dom', label: 'Домены' },
    { id: 'r-abus', label: 'Жалобы' },
  ];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="space-y-8">
      <PanelNav items={items} onJump={jump} />
      <section id="r-inc" className="scroll-mt-28"><Incidents /></section>
      <section id="r-int" className="scroll-mt-28"><IntHealth push={push} /></section>
      <section id="r-dom" className="scroll-mt-28"><Domains push={push} /></section>
      <section id="r-abus" className="scroll-mt-28"><Abuse /></section>
    </div>
  );
}

// ---------- Предпросмотр интерфейсов (партнёр и предприниматель) ----------
const PREVIEW_TABS = [
  { key: 'partner', label: 'Кабинет партнёра', src: '/partner/demo', hint: 'Демо-макет: 8 разделов, таблица готовых сервисов, текст и фото, начисления, рефералка, материалы. Данные не сохраняются.' },
  { key: 'tenant', label: 'Кабинет предпринимателя', src: '/admin/preview/tenant', hint: 'Демо-макет: сводка с выручкой, записи за сегодня/неделю, ручное добавление, платежи и отдельный раздел «Оформление» со стилями. Данные не сохраняются.' },
] as const;

function PreviewPanel() {
  const [tab, setTab] = useState<(typeof PREVIEW_TABS)[number]['key']>('partner');
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [nonce, setNonce] = useState(0);
  const active = PREVIEW_TABS.find((t) => t.key === tab) ?? PREVIEW_TABS[0];

  return (
    <div className="space-y-5">
      <SectionHeader icon={Eye} title="Предпросмотр интерфейсов" desc="Как выглядят кабинет партнёра и кабинет предпринимателя. Это статичные макеты: кнопки не сохраняют данные — боевые кабинеты работают по адресам /partner и /{prefix}/{slug}/panel" />

      <div className="flex flex-wrap items-center gap-2">
        {PREVIEW_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`rounded-full px-3 py-2 text-body-sm transition-colors ${tab === t.key ? 'bg-white/[0.10] text-white' : 'text-brand-text-muted hover:text-white'}`}
          >{t.label}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="btn-ghost press text-caption" onClick={() => setWidth('desktop')} aria-pressed={width === 'desktop'}>Компьютер</button>
          <button type="button" className="btn-ghost press text-caption" onClick={() => setWidth('mobile')} aria-pressed={width === 'mobile'}>Телефон</button>
          <button type="button" className="btn-ghost press text-caption" onClick={() => setNonce((n) => n + 1)}><ArrowsClockwise size={14} weight="bold" aria-hidden="true" /> Обновить</button>
          <a className="btn-secondary press text-caption" href={active.src} target="_blank" rel="noopener noreferrer">Открыть в новой вкладке</a>
        </div>
      </div>

      <p className="text-caption text-brand-text-subtle">{active.hint}</p>

      <div className="flex justify-center rounded-3xl border border-brand-border bg-brand-surface p-3">
        <iframe
          key={`${active.key}-${width}-${nonce}`}
          src={active.src}
          title={active.label}
          className={`h-[720px] rounded-2xl border border-white/10 bg-white transition-[width] ${width === 'mobile' ? 'w-[390px]' : 'w-full'}`}
        />
      </div>
    </div>
  );
}

function PlatformMiscPanel({ push, onNavigate }: { push: (m: string, k?: ToastKind) => void; onNavigate: (s: Section) => void }) {
  const items = [
    { id: 'm-sys', label: 'Система' },
    { id: 'm-flags', label: 'Фича-флаги' },
    { id: 'm-backup', label: 'Бэкапы' },
  ];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="space-y-8">
      <PanelNav items={items} onJump={jump} />
      <section id="m-sys" className="scroll-mt-28"><SystemInfo push={push} /></section>
      <section id="m-flags" className="scroll-mt-28"><FeatureFlags push={push} /></section>
      <section id="m-backup" className="scroll-mt-28"><Backups push={push} /></section>
      <section className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-heading-sm">Журнал действий</div>
            <p className="mt-1 text-caption text-brand-text-muted">Все изменения в платформе пишутся в audit_log и доступны в разделе «Журнал».</p>
          </div>
          <button type="button" className="btn-secondary press text-body-sm" onClick={() => onNavigate('audit')}>Открыть журнал</button>
        </div>
      </section>
    </div>
  );
}

// ---------- Партнёры (сводка платформы для супер-админа) ----------
import {
  getReadyServicesAction,
  getReadyNichesAction,
  deleteReadyServicesAction,
  deleteReadyServicesByFilterAction,
  getNicheDefaultsAction,
  saveNicheDefaultsAction,
  saveReadyServicesAction,
  setReadyCoverAction,
  ingestReadyUploadAction,
  setReadyStatusAction,
  generateSitesAction,
  getPartnerAccountsAction,
  updatePartnerNameAction,
  banPartnerAction,
  adjustPartnerMoneyAction,
  messagePartnerAction,
  getPartnerMessagesAction,
} from '@/app/partner/admin-actions';
import {
  getPlatformApiKeyAction,
  rotatePlatformApiKeyAction,
  queuePlatformEmailAction,
  sendPlatformBroadcastAction,
  getPlatformSettingsAction,
  savePlatformSettingsAction,
  getNotificationSettingsAction,
  saveNotificationSettingsAction,
  changeAdminPasswordAction,
  setBotCommandsAction,
  getTariffsAction,
  saveTariffsAction,
  getIntegrationsStatusAction,
  getNotifTemplatesAction,
  saveNotifTemplateAction,
  toggleNotifTemplateAction,
  listBackupsAction,
  getFeatureFlagsAction,
  saveFeatureFlagsAction,
} from '@/app/admin/platform-actions';
import {
  getDashboardDataAction,
  getBusinessesAction,
  setBusinessStatusAction,
  getModerationQueueAction,
  getBookingsAction,
  getPlatformUsersAction,
  getPaymentsAction,
  getAuditLogAction,
  getLeadsAction,
  getTicketsAction,
  setTicketStatusAction,
  getPromoCodesAction,
  getWebhookEventsAction,
  getPhotosAction,
  getAllServicesAction,
  getCitiesAction,
  getClientsFromBookingsAction,
  getLocationsAction,
  createBusinessAction,
  getBotStatsAction,
  getBroadcastHistoryAction,
  getGrowthStatsAction,
  getDomainsAction,
} from '@/app/admin/data-actions';
import {
  getChatThreadsAction,
  getChatMessagesAction,
  sendChatMessageAction,
  type ChatThread,
  type ChatMessage,
} from '@/app/admin/chat-actions';
import { auditActionLabel } from '@/app/admin/audit-labels';
import { PartnerProgramPanel } from '@/app/admin/PartnerProgramPanel';
import type { ReadyService, ReadyCategory, PartnerAccountRow } from '@/lib/ready-services';

const READY_CAT_LABEL: Record<string, string> = {
  full: 'Шаблон + данные + фото',
  no_photos: 'Шаблон + данные, без фото',
  no_services: 'Шаблон без услуг',
  no_template: 'Нет шаблона ниши',
  new: 'Новая',
};

function ServicesEditor({
  value,
  onChange,
}: {
  value: { name: string; price: number; duration: number }[];
  onChange: (next: { name: string; price: number; duration: number }[]) => void;
}) {
  return (
    <div className="space-y-2">
      {value.map((service, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <input
            className="input min-w-0 flex-1"
            value={service.name}
            placeholder="Услуга"
            onChange={(e) => onChange(value.map((x, j) => (j === index ? { ...x, name: e.target.value } : x)))}
          />
          <input
            className="input w-24"
            type="number"
            value={service.price}
            placeholder="₽"
            onChange={(e) => onChange(value.map((x, j) => (j === index ? { ...x, price: Number(e.target.value) } : x)))}
          />
          <input
            className="input w-20"
            type="number"
            value={service.duration}
            placeholder="мин"
            onChange={(e) => onChange(value.map((x, j) => (j === index ? { ...x, duration: Number(e.target.value) } : x)))}
          />
          <button type="button" className="btn-ghost text-caption" onClick={() => onChange(value.filter((_, j) => j !== index))}>
            <Trash size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary text-caption" onClick={() => onChange([...value, { name: '', price: 0, duration: 60 }])}>
        <Plus size={14} weight="bold" aria-hidden="true" /> Добавить услугу
      </button>
    </div>
  );
}

function ServiceDetail({
  r,
  onClose,
  onStatus,
  onSaveServices,
  onCover,
  onSaved,
}: {
  r: ReadyService;
  onClose: () => void;
  onStatus: (status: 'approved' | 'rejected' | 'draft') => void;
  onSaveServices: (services: { name: string; price: number; duration_minutes: number }[]) => Promise<{ ok: boolean; error?: string }>;
  onCover: (useCover: boolean) => Promise<{ ok: boolean; error?: string }>;
  onSaved: () => void;
}) {
  const p = (r.payload ?? {}) as Record<string, unknown>;
  const raw = (p.raw && typeof p.raw === 'object' ? (p.raw as Record<string, unknown>) : p);
  const photo = typeof p.photo_url === 'string' ? p.photo_url : '';
  const photoList = Array.isArray(p.photo_urls) ? (p.photo_urls as string[]).filter(Boolean) : (photo ? [photo] : []);
  const mapUrl = typeof p.map_url === 'string' ? p.map_url : '';
  const site = typeof p.site === 'string' ? p.site : '';
  const entries = Object.entries(raw).filter(
    ([key, value]) => key !== 'raw' && key !== 'services' && value !== null && value !== undefined && String(value).trim() !== '',
  );
  const [editServices, setEditServices] = useState<{ name: string; price: number; duration_minutes: number }[]>(
    Array.isArray(p.services)
      ? (p.services as { name?: string; price?: number | null; duration_minutes?: number | null }[]).map((s) => ({
          name: String(s.name ?? ''),
          price: Number(s.price ?? 0) || 0,
          duration_minutes: Number(s.duration_minutes ?? 60) || 60,
        }))
      : [],
  );
  const [cardErr, setCardErr] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  // Если в данных услуг нет — показываем прайс ниши, чтобы было что поправить и сохранить.
  useEffect(() => {
    if (Array.isArray(p.services) && (p.services as unknown[]).length > 0) return;
    let alive = true;
    getNicheDefaultsAction(r.niche)
      .then((list) => {
        if (alive) setEditServices(list.map((s) => ({ name: s.name, price: s.price, duration_minutes: s.duration })));
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const info = (label: string, value: string | null | undefined, href?: string) => {
    if (!value) return null;
    return (
      <div className="rounded-xl border border-brand-border p-3">
        <div className="text-caption text-brand-text-subtle">{label}</div>
        {href ? (
          <a className="break-all text-body-sm text-brand-accent" href={href} target="_blank" rel="noreferrer">{value}</a>
        ) : (
          <div className="break-all text-body-sm text-brand-text">{value}</div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-brand-border bg-brand-surface p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-heading-md">{r.name}</h3>
            <p className="mt-1 text-caption text-brand-text-muted">
              {r.niche} · {READY_CAT_LABEL[r.category] ?? r.category} · {r.status}
            </p>
          </div>
          <button type="button" className="btn-ghost text-caption" onClick={onClose}>
            <X size={14} weight="bold" aria-hidden="true" /> Закрыть
          </button>
        </div>

        <div className="mt-4">
          {photoList.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {photoList.slice(0, 6).map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={src} alt={`${r.name} ${index + 1}`} className="h-28 w-full rounded-xl border border-brand-border object-cover" />
              ))}
            </div>
          ) : (
            <div className="grid h-40 place-items-center rounded-2xl border border-brand-border bg-brand-bg text-caption text-brand-text-subtle">Нет фото</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            <span className={`rounded-full border px-2 py-0.5 ${p.photo_bad === true ? 'border-brand-error/40 text-brand-error' : photoList.length > 0 ? 'border-brand-success/30 text-brand-success' : 'border-white/15 text-brand-text-subtle'}`}>
              {p.use_cover === true ? 'обложка ниши' : p.photo_bad === true ? 'фото маленькое' : photoList.length > 0 ? `фото ок (${photoList.length})` : 'нет фото'}
            </span>
            <button type="button" disabled={cardBusy} className="btn-ghost text-caption" onClick={async () => { setCardBusy(true); const res = await onCover(true); setCardBusy(false); if (res.ok) onSaved(); else setCardErr(res.error ?? 'Ошибка'); }}>
              На шаблон
            </button>
            <button type="button" disabled={cardBusy || photoList.length === 0} className="btn-ghost text-caption" onClick={async () => { setCardBusy(true); const res = await onCover(false); setCardBusy(false); if (res.ok) onSaved(); else setCardErr(res.error ?? 'Ошибка'); }}>
              Вернуть фото
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {info('Телефон', r.phone, r.phone ? `tel:${r.phone.replace(/\s/g, '')}` : undefined)}
          {info('Email', r.email, r.email ? `mailto:${r.email}` : undefined)}
          {info('Сайт', site, site || undefined)}
          {info('Карта', mapUrl ? 'Открыть на карте' : '', mapUrl || undefined)}
          {info('Город', r.city)}
          {info('Адрес', r.address)}
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-body-sm font-medium text-brand-text">Услуги</div>
            <button type="button" className="btn-ghost text-caption" onClick={async () => {
              const list = await getNicheDefaultsAction(r.niche);
              setEditServices(list.map((s) => ({ name: s.name, price: s.price, duration_minutes: s.duration })));
            }}>
              Взять прайс ниши
            </button>
          </div>
          {!(Array.isArray(p.services) && (p.services as unknown[]).length > 0) && (
            <p className="mt-1 text-caption text-brand-text-subtle">Подставлен прайс ниши — можно поправить и сохранить.</p>
          )}
          <div className="mt-2">
            <ServicesEditor
              value={editServices.map((s) => ({ name: s.name, price: s.price, duration: s.duration_minutes }))}
              onChange={(list) => setEditServices(list.map((s) => ({ name: s.name, price: s.price, duration_minutes: s.duration })))}
            />
          </div>
        </div>

        {entries.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-body-sm text-brand-text-muted">Все данные ({entries.length})</summary>
            <div className="mt-2 overflow-x-auto rounded-xl border border-brand-border">
              <table className="w-full text-left text-caption">
                <tbody>
                  {entries.map(([key, value]) => (
                    <tr key={key} className="border-t border-brand-border/60">
                      <td className="w-1/3 px-3 py-1.5 align-top text-brand-text-subtle">{key}</td>
                      <td className="break-all px-3 py-1.5 text-brand-text">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {cardErr && <div className="mt-3 rounded-lg border border-brand-error/40 bg-brand-error/10 px-3 py-2 text-caption text-brand-error">{cardErr}</div>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={cardBusy} className="btn-primary text-caption" onClick={async () => { setCardBusy(true); const res = await onSaveServices(editServices); setCardBusy(false); if (res.ok) onSaved(); else setCardErr(res.error ?? 'Ошибка'); }}>
            <Check size={14} weight="bold" aria-hidden="true" /> Сохранить услуги
          </button>
          {r.business_id && (
            <a href={`/${r.niche}/${r.slug}`} target="_blank" rel="noreferrer" className="btn-secondary text-caption">
              <ArrowSquareOut size={14} weight="bold" aria-hidden="true" /> Открыть сайт
            </a>
          )}
          {r.status !== 'approved' && (
            <button type="button" className="btn-primary text-caption" onClick={() => { onStatus('approved'); onClose(); }}>
              <Check size={14} weight="bold" aria-hidden="true" /> Одобрить
            </button>
          )}
          {r.status !== 'rejected' && (
            <button type="button" className="btn-ghost text-caption" onClick={() => { onStatus('rejected'); onClose(); }}>
              <X size={14} weight="bold" aria-hidden="true" /> Отклонить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadyServices({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<ReadyService[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [genNiche, setGenNiche] = useState(ALL_NICHE_THEMES[0]?.key ?? 'detailing');
  const [filterNiche, setFilterNiche] = useState<string>('');
  const [filterCat, setFilterCat] = useState<ReadyCategory | 'all'>('all');
  const [status, setStatus] = useState<'all' | 'draft' | 'approved' | 'rejected'>('all');
  const [genCat, setGenCat] = useState<ReadyCategory | 'all'>('all');
  const [detail, setDetail] = useState<ReadyService | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [alsoDeleteSites, setAlsoDeleteSites] = useState(false);
  const [niches, setNiches] = useState<{ niche: string; count: number }[]>([]);
  const [defaultsNiche, setDefaultsNiche] = useState(ALL_NICHE_THEMES[0]?.key ?? 'detailing');
  const [defaults, setDefaults] = useState<{ name: string; price: number; duration: number }[]>([]);
  const [defaultsBusy, setDefaultsBusy] = useState(false);

  const loadNiches = () => {
    getReadyNichesAction().then((list) => setNiches(list)).catch(() => setNiches([]));
  };

  const load = () => {
    setErr(null);
    getReadyServicesAction({
      niche: filterNiche || undefined,
      status: status === 'all' ? undefined : status,
      category: filterCat === 'all' ? undefined : filterCat,
    })
      .then((r) => setRows(r))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    loadNiches();
  };
  useEffect(load, [filterNiche, status, filterCat]);

  useEffect(() => {
    if (niches.length > 0 && !niches.some((n) => n.niche === genNiche)) setGenNiche(niches[0].niche);
  }, [niches, genNiche]);

  useEffect(() => {
    setDefaultsBusy(true);
    getNicheDefaultsAction(defaultsNiche)
      .then((list) => setDefaults(list))
      .catch(() => setDefaults([]))
      .finally(() => setDefaultsBusy(false));
  }, [defaultsNiche]);

  const onUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setErr(null);
    const res = await ingestReadyUploadAction(fd);
    setBusy(false);
    if (res.ok) {
      const breakdown = Object.entries(res.byNiche ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      const photos = res.photos ? ` · фото: ${res.photos.matched}${res.photos.unmatched ? ` (без пары ${res.photos.unmatched})` : ''}` : '';
      push(`Загружено: ${res.inserted}${res.skipped ? ` (пропущено ${res.skipped})` : ''}${breakdown ? ` · ${breakdown}` : ''}${photos}`, 'success');
      form.reset();
      load();
    } else setErr(res.error);
  };

  const onGenerate = async () => {
    setBusy(true); setErr(null);
    const res = await generateSitesAction(genNiche, genCat);
    setBusy(false);
    if (res.ok) {
      push(`Сгенерировано: ${res.generated}${res.failed ? ` · ошибок: ${res.failed}` : ''}`, res.failed ? 'info' : 'success');
      load();
    } else setErr(res.error);
  };

  const setStatusRow = async (id: string, st: 'approved' | 'rejected' | 'draft') => {
    await setReadyStatusAction(id, st);
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, status: st } : r)) : prev));
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const allSelected = Boolean(rows && rows.length > 0 && rows.every((r) => selected.has(r.id)));
  const toggleAll = () => {
    if (!rows) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Удалить ${selected.size} сервисов? Это необратимо.`)) return;
    const res = await deleteReadyServicesAction([...selected], alsoDeleteSites);
    if (res.ok) { push(`Удалено: ${res.deleted}`, 'success'); setSelected(new Set()); load(); }
    else setErr(res.error);
  };

  const deleteFiltered = async () => {
    const count = rows?.length ?? 0;
    const word = window.prompt(`Удалить ВСЕ ${count} сервисов по текущему фильтру? Введите УДАЛИТЬ для подтверждения.`);
    if (word !== 'УДАЛИТЬ') return;
    const res = await deleteReadyServicesByFilterAction(
      { niche: filterNiche || undefined, status: status === 'all' ? undefined : status, category: filterCat === 'all' ? undefined : filterCat },
      alsoDeleteSites,
    );
    if (res.ok) { push(`Удалено: ${res.deleted}`, 'success'); setSelected(new Set()); load(); }
    else setErr(res.error);
  };

  const saveDefaults = async () => {
    setDefaultsBusy(true);
    const res = await saveNicheDefaultsAction(defaultsNiche, defaults);
    setDefaultsBusy(false);
    if (res.ok) push('Прайс ниши сохранён', 'success');
    else setErr(res.error);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { full: 0, no_photos: 0, no_services: 0, no_template: 0 };
    for (const r of rows ?? []) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-5">
      <SectionHeader icon={ListChecks} title="Готовые сервисы" desc="Загрузка выгрузки парсера, генерация сайтов и одобрение для партнёров" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
          <h3 className="text-heading-sm">Загрузить выгрузку парсера</h3>
          <p className="mt-1 text-caption text-brand-text-muted">.json / .jsonl / .csv / .xlsx — например leads.json или outreach.csv</p>
          <form className="mt-3 space-y-3" onSubmit={onUpload}>
            <p className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-caption text-brand-text-muted">
              Ниша определяется автоматически по каждой строке. Фото — из <code>photo_url</code> или из ZIP-архива (сопоставляются по имени файла / префиксу «источник_id»).
            </p>
            <label className="block text-caption text-brand-text-muted">Таблица
              <input type="file" name="file" accept=".json,.jsonl,.ndjson,.csv,.xlsx,.xls" required className="mt-1 block w-full text-caption text-brand-text-muted" />
            </label>
            <label className="block text-caption text-brand-text-muted">Архив с фото (ZIP, необязательно)
              <input type="file" name="photos" accept=".zip" className="mt-1 block w-full text-caption text-brand-text-muted" />
            </label>
            <button type="submit" disabled={busy} className="btn-primary w-full text-body-sm">
              <UploadSimple size={16} weight="bold" aria-hidden="true" /> {busy ? 'Загрузка…' : 'Загрузить и разобрать'}
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
          <h3 className="text-heading-sm">Сгенерировать сайты</h3>
          <p className="mt-1 text-caption text-brand-text-muted">Подставит данные из таблицы в шаблон ниши → /{genNiche}/{'{slug}'}</p>
          <div className="mt-3 space-y-3">
            <label className="block text-caption text-brand-text-muted">Ниша
              <select className="input mt-1 w-full" value={genNiche} onChange={(e) => setGenNiche(e.target.value)}>
                {(niches.length > 0
                  ? niches.map((n) => <option key={n.niche} value={n.niche}>{n.niche} ({n.count})</option>)
                  : ALL_NICHE_THEMES.map((t) => <option key={t.key} value={t.key}>{t.tagline}</option>))}
              </select>
            </label>
            <label className="block text-caption text-brand-text-muted">Категория
              <select className="input mt-1 w-full" value={genCat} onChange={(e) => setGenCat(e.target.value as ReadyCategory | 'all')}>
                <option value="all">Все категории</option>
                <option value="full">Шаблон + данные + фото</option>
                <option value="no_photos">Шаблон + данные, без фото</option>
                <option value="no_services">Шаблон без услуг</option>
              </select>
            </label>
            <button type="button" disabled={busy} onClick={onGenerate} className="btn-primary w-full text-body-sm">
              <ArrowsClockwise size={16} weight="bold" aria-hidden="true" /> {busy ? 'Генерация…' : 'Сгенерировать'}
            </button>
          </div>
        </div>
      </div>

      <details className="rounded-3xl border border-brand-border bg-brand-surface p-5">
        <summary className="cursor-pointer text-heading-sm">Прайс по нишам (по умолчанию для генерации)</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-caption text-brand-text-muted">Ниша
            <select className="input mt-1 w-full" value={defaultsNiche} onChange={(e) => setDefaultsNiche(e.target.value)}>
              {ALL_NICHE_THEMES.map((t) => <option key={t.key} value={t.key}>{t.tagline} ({t.key})</option>)}
            </select>
          </label>
          <ServicesEditor value={defaults} onChange={setDefaults} />
          <button type="button" disabled={defaultsBusy} onClick={saveDefaults} className="btn-primary text-body-sm">
            <Check size={16} weight="bold" aria-hidden="true" /> {defaultsBusy ? 'Сохранение…' : 'Сохранить прайс ниши'}
          </button>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input text-body-sm" value={filterNiche} onChange={(e) => setFilterNiche(e.target.value)}>
          <option value="">Все ниши</option>
          {(niches.length > 0 ? niches.map((n) => <option key={n.niche} value={n.niche}>{n.niche} ({n.count})</option>) : ALL_NICHE_THEMES.map((t) => <option key={t.key} value={t.key}>{t.tagline}</option>))}
          <option value="unknown">Ниша не определена</option>
        </select>
        <select className="input text-body-sm" value={filterCat} onChange={(e) => setFilterCat(e.target.value as ReadyCategory | 'all')}>
          <option value="all">Все категории</option>
          <option value="full">Шаблон + данные + фото</option>
          <option value="no_photos">Без фото</option>
          <option value="no_services">Без услуг</option>
          <option value="no_template">Нет шаблона</option>
        </select>
        <select className="input text-body-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Все статусы</option>
          <option value="draft">Черновики</option>
          <option value="approved">Одобрены</option>
          <option value="rejected">Отклонены</option>
        </select>
        <button type="button" className="btn-secondary text-caption" onClick={load}>Обновить</button>
        <span className="text-caption text-brand-text-subtle">
          Всего: {rows?.length ?? '…'} · полные {counts.full} · без фото {counts.no_photos} · без услуг {counts.no_services}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-border bg-brand-surface px-3 py-2">
        <label className="flex items-center gap-2 text-caption text-brand-text-muted">
          <input type="checkbox" checked={alsoDeleteSites} onChange={(e) => setAlsoDeleteSites(e.target.checked)} />
          также удалить сгенерированные сайты
        </label>
        <button type="button" className="btn-ghost text-caption text-brand-error" disabled={selected.size === 0} onClick={deleteSelected}>
          <Trash size={14} weight="bold" aria-hidden="true" /> Удалить выбранные ({selected.size})
        </button>
        <button type="button" className="btn-ghost text-caption text-brand-error" disabled={!rows || rows.length === 0} onClick={deleteFiltered}>
          <Trash size={14} weight="bold" aria-hidden="true" /> Удалить все по фильтру ({rows?.length ?? 0})
        </button>
      </div>

      {err && <div className="rounded-xl border border-brand-error/40 bg-brand-error/10 px-4 py-2 text-body-sm text-brand-error">{err}</div>}

      <div className="overflow-x-auto rounded-3xl border border-brand-border bg-brand-surface">
        <table className="w-full text-left text-body-sm">
          <thead className="text-brand-text-subtle">
            <tr>
              <th className="px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Выбрать все" />
              </th>
              <th className="px-4 py-3">Сервис</th>
              <th className="px-4 py-3">Ниша</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Сайт</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {!rows && <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-text-subtle">Загрузка…</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-text-subtle">Пока пусто — загрузите выгрузку парсера.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-brand-border/60">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => toggleOne(r.id, e.target.checked)} aria-label={`Выбрать ${r.name}`} />
                </td>
                <td className="px-4 py-3">
                  <div className="text-brand-text">{r.name}</div>
                  <div className="text-caption text-brand-text-subtle">{r.city ?? '—'} · {r.phone ?? 'нет телефона'}</div>
                </td>
                <td className="px-4 py-3 text-brand-text-muted">{r.niche === 'unknown' ? 'не определена' : r.niche}</td>
                <td className="px-4 py-3 text-brand-text-muted">{READY_CAT_LABEL[r.category] ?? r.category}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-caption ${r.status === 'approved' ? 'border-brand-success/30 text-brand-success' : r.status === 'rejected' ? 'border-brand-error/30 text-brand-error' : 'border-white/15 text-brand-text-subtle'}`}>
                    {r.status === 'approved' ? 'одобрен' : r.status === 'rejected' ? 'отклонён' : 'черновик'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.business_id
                    ? <a href={`/${r.niche}/${r.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-accent"><ArrowSquareOut size={14} weight="bold" aria-hidden="true" /> открыть</a>
                    : <span className="text-caption text-brand-text-subtle">не сгенерирован</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="btn-ghost text-caption" onClick={() => setDetail(r)}><Eye size={13} weight="bold" aria-hidden="true" /> Просмотреть</button>
                    {r.status !== 'approved' && <button type="button" className="btn-ghost text-caption" onClick={() => setStatusRow(r.id, 'approved')}><Check size={13} weight="bold" aria-hidden="true" /> Одобрить</button>}
                    {r.status !== 'rejected' && <button type="button" className="btn-ghost text-caption" onClick={() => setStatusRow(r.id, 'rejected')}><X size={13} weight="bold" aria-hidden="true" /> Отклонить</button>}
                    {r.status !== 'draft' && <button type="button" className="btn-ghost text-caption" onClick={() => setStatusRow(r.id, 'draft')}><ArrowsClockwise size={13} weight="bold" aria-hidden="true" /> В черновик</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <ServiceDetail
          r={detail}
          onClose={() => setDetail(null)}
          onStatus={(status) => { if (detail) setStatusRow(detail.id, status); }}
          onSaveServices={(services) => (detail ? saveReadyServicesAction(detail.id, services) : Promise.resolve({ ok: false }))}
          onCover={(useCover) => (detail ? setReadyCoverAction(detail.id, useCover) : Promise.resolve({ ok: false }))}
          onSaved={() => { setDetail(null); load(); }}
        />
      )}
    </div>
  );
}

function Partners({ push }: { push: (m: string, k?: ToastKind) => void }) {
  const [rows, setRows] = useState<PartnerAccountRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<PartnerAccountRow | null>(null);
  const [messages, setMessages] = useState<{ id: string; body: string; created_at: string }[]>([]);

  const load = () => {
    setErr(null);
    getPartnerAccountsAction()
      .then((r) => setRows(r))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  useEffect(() => {
    if (!selected || !rows) return;
    const updated = rows.find((r) => r.id === selected.id);
    if (updated) setSelected(updated);
  }, [rows]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let alive = true;
    getPartnerMessagesAction(selected.id)
      .then((m) => { if (alive) setMessages(m); })
      .catch(() => { if (alive) setMessages([]); });
    return () => { alive = false; };
  }, [selected?.id]);

  const totalBalance = (rows ?? []).reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const totalInProcess = (rows ?? []).reduce((s, r) => s + Number(r.inProcess ?? 0), 0);

  // Действие над партнёром выполняется прямо в его плашке — без нативных prompt/alert
  const [action, setAction] = useState<{ kind: 'rename' | 'bonus' | 'payout' | 'message'; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const openAction = (kind: 'rename' | 'bonus' | 'payout' | 'message', r: PartnerAccountRow) => {
    setSelected(r);
    setAction({
      kind,
      value: kind === 'rename' ? (r.name ?? '')
        : kind === 'bonus' ? '500'
        : kind === 'payout' ? String(Math.max(0, Math.round(Number(r.balance ?? 0))))
        : '',
    });
  };

  const toggleBan = async (r: PartnerAccountRow) => {
    const next = r.status !== 'blocked';
    await banPartnerAction(r.id, next);
    push(next ? 'Партнёр заблокирован' : 'Партнёр разблокирован', 'success');
    load();
  };

  const submitAction = async () => {
    if (!action || !selected) return;
    const r = selected;
    const value = action.value.trim();
    if (action.kind === 'message' ? !value : !value) return;
    setBusy(true);
    try {
      if (action.kind === 'rename') {
        await updatePartnerNameAction(r.id, value);
        push('Имя обновлено', 'success');
      } else if (action.kind === 'bonus') {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) { push('Сумма должна быть больше нуля', 'error'); setBusy(false); return; }
        await adjustPartnerMoneyAction(r.id, amount, 'bonus', 'Бонус от админа');
        push(`Начислено ${amount.toLocaleString('ru-RU')} ₽`, 'success');
      } else if (action.kind === 'payout') {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) { push('Сумма должна быть больше нуля', 'error'); setBusy(false); return; }
        await adjustPartnerMoneyAction(r.id, -Math.abs(amount), 'payout', 'Выплата');
        push(`Выплачено ${amount.toLocaleString('ru-RU')} ₽`, 'success');
      } else {
        await messagePartnerAction(r.id, value);
        push('Сообщение отправлено', 'success');
      }
      setAction(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Не удалось выполнить действие', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader icon={UsersThree} title="Партнёры" desc="Аккаунты партнёров: имена, блокировка, баланс, выплаты, сообщения" />
      <PartnerProgramPanel push={push} />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-3">
          <p className="text-caption text-brand-text-subtle">Партнёров</p>
          <p className="text-[20px] font-semibold text-brand-text">{rows ? rows.length : '…'}</p>
        </div>
        <div className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-3">
          <p className="text-caption text-brand-text-subtle">В процессе</p>
          <p className="text-[20px] font-semibold text-brand-text">{totalInProcess}</p>
        </div>
        <div className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-3">
          <p className="text-caption text-brand-text-subtle">Баланс партнёров</p>
          <p className="text-[20px] font-semibold text-brand-success">{totalBalance.toLocaleString('ru-RU')} ₽</p>
        </div>
      </div>

      {err && <div className="rounded-xl border border-brand-error/40 bg-brand-error/10 px-4 py-2 text-body-sm text-brand-error">Не удалось загрузить партнёров: {err}</div>}

      <div className="overflow-x-auto rounded-3xl border border-brand-border bg-brand-surface">
        <table className="w-full text-left text-body-sm">
          <thead className="text-brand-text-subtle">
            <tr>
              <th className="px-4 py-3">Партнёр</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Лиды</th>
              <th className="px-4 py-3">В процессе</th>
              <th className="px-4 py-3">Баланс</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {!rows && <tr><td colSpan={6} className="px-4 py-6 text-center text-brand-text-subtle">Загрузка…</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-brand-text-subtle">Партнёров пока нет.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-brand-border/60">
                <td className="px-4 py-3">
                  <div className="text-brand-text">{r.name ?? '—'}</div>
                  <div className="text-caption text-brand-text-subtle">{r.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-caption ${r.status === 'blocked' ? 'border-brand-error/30 text-brand-error' : 'border-brand-success/30 text-brand-success'}`}>
                    {r.status === 'blocked' ? 'заблокирован' : 'активен'}
                  </span>
                </td>
                <td className="px-4 py-3 text-brand-text-muted">{r.leadsCount}</td>
                <td className="px-4 py-3 text-brand-text-muted">{r.inProcess}</td>
                <td className="px-4 py-3 text-brand-text">{Number(r.balance ?? 0).toLocaleString('ru-RU')} ₽</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="btn-ghost text-caption" onClick={() => { setAction(null); setSelected(r); }}><Eye size={13} weight="bold" aria-hidden="true" /> Открыть</button>
                    <button type="button" className="btn-ghost text-caption" onClick={() => openAction('rename', r)}><Pencil size={13} weight="bold" aria-hidden="true" /> Имя</button>
                    <button type="button" className="btn-ghost text-caption" onClick={() => openAction('bonus', r)}><Plus size={13} weight="bold" aria-hidden="true" /> Начислить</button>
                    <button type="button" className="btn-ghost text-caption" onClick={() => openAction('payout', r)}><Money size={13} weight="bold" aria-hidden="true" /> Выплатить</button>
                    <button type="button" className="btn-ghost text-caption" onClick={() => openAction('message', r)}><PaperPlaneTilt size={13} weight="bold" aria-hidden="true" /> Написать</button>
                    <button type="button" className="btn-ghost text-caption" onClick={() => { setAction(null); setSelected(r); }}><ChatCircle size={13} weight="bold" aria-hidden="true" /> {r.messages}</button>
                    <button type="button" className="btn-ghost text-caption" onClick={() => toggleBan(r)}><Prohibit size={13} weight="bold" aria-hidden="true" /> {r.status === 'blocked' ? 'Разбан' : 'Бан'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-brand-text-subtle">
        Баланс = начисленные вознаграждения + бонусы − выплаты. «Начислить» добавляет бонус, «Выплатить» списывает сумму.
      </p>

      <Sheet open={!!selected} onClose={() => { setSelected(null); setAction(null); }} title="Партнёр">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-heading-sm">{selected.name ?? 'Без имени'}</div>
                <div className="text-caption text-brand-text-subtle">{selected.email}</div>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-caption ${selected.status === 'blocked' ? 'border-brand-error/30 text-brand-error' : 'border-brand-success/30 text-brand-success'}`}>
                {selected.status === 'blocked' ? 'заблокирован' : 'активен'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {([
                ['Код', selected.referral_code],
                ['Регистрация', selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('ru-RU') : '—'],
                ['Лидов', String(selected.leadsCount)],
                ['Счетов', String(selected.checkoutsCount)],
                ['Оплачено', String(selected.paidCount)],
                ['В процессе', String(selected.inProcess)],
                ['Начислено', `${Number(selected.earningsAccrued).toLocaleString('ru-RU')} ₽`],
                ['Баланс', `${Number(selected.balance).toLocaleString('ru-RU')} ₽`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-brand-border p-3">
                  <div className="text-caption text-brand-text-subtle">{label}</div>
                  <div className="mt-0.5 text-body-sm text-brand-text">{value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-caption" onClick={() => openAction('rename', selected)}><Pencil size={14} weight="bold" aria-hidden="true" /> Переименовать</button>
              <button type="button" className="btn-secondary text-caption" onClick={() => openAction('bonus', selected)}><Plus size={14} weight="bold" aria-hidden="true" /> Начислить</button>
              <button type="button" className="btn-secondary text-caption" onClick={() => openAction('payout', selected)}><Money size={14} weight="bold" aria-hidden="true" /> Выплатить</button>
              <button type="button" className="btn-secondary text-caption" onClick={() => openAction('message', selected)}><PaperPlaneTilt size={14} weight="bold" aria-hidden="true" /> Написать</button>
              <button type="button" className="btn-ghost text-caption" onClick={() => toggleBan(selected)}><Prohibit size={14} weight="bold" aria-hidden="true" /> {selected.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}</button>
            </div>

            {action && (
              <div className="rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-3">
                <div className="text-caption text-brand-accent">
                  {action.kind === 'rename' ? 'Новое имя партнёра'
                    : action.kind === 'bonus' ? 'Сумма бонуса, ₽'
                    : action.kind === 'payout' ? 'Сумма выплаты, ₽'
                    : 'Сообщение партнёру'}
                </div>
                {action.kind === 'message' ? (
                  <textarea
                    value={action.value}
                    onChange={(e) => setAction({ ...action, value: e.target.value })}
                    rows={3}
                    placeholder="Текст сообщения…"
                    className="input mt-1 w-full resize-none text-body-sm"
                  />
                ) : (
                  <input
                    value={action.value}
                    onChange={(e) => setAction({ ...action, value: e.target.value })}
                    type={action.kind === 'rename' ? 'text' : 'number'}
                    min={action.kind === 'rename' ? undefined : 0}
                    className="input mt-1 w-full text-body-sm"
                  />
                )}
                <div className="mt-2 flex gap-2">
                  <button type="button" className="btn-primary text-caption" disabled={busy || !action.value.trim()} onClick={submitAction}>
                    {busy ? 'Отправка…' : action.kind === 'message' ? 'Отправить' : 'Применить'}
                  </button>
                  <button type="button" className="btn-ghost text-caption" onClick={() => setAction(null)}>Отмена</button>
                </div>
              </div>
            )}

            <div>
              <div className="text-body-sm font-medium text-brand-text">Сообщения</div>
              <ul className="mt-2 space-y-1">
                {messages.length === 0 && <li className="text-caption text-brand-text-subtle">Сообщений нет</li>}
                {messages.map((m) => (
                  <li key={m.id} className="rounded-lg border border-brand-border px-3 py-2 text-caption text-brand-text-muted">
                    <span className="text-brand-text-subtle">{new Date(m.created_at).toLocaleString('ru-RU')}: </span>{m.body}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

type NavItem = { key: Section; label: string; icon: Icon };
const NAV_GROUPS: { key: string; label: string; icon: Icon; items: NavItem[] }[] = [
  {
    key: 'overview', label: 'Обзор', icon: SquaresFour,
    items: [
      { key: 'dashboard', label: 'Дашборд', icon: Gauge },
      { key: 'businesses', label: 'Бизнесы', icon: Storefront },
      { key: 'bookings', label: 'Трафик', icon: CalendarBlank },
      { key: 'coverage', label: 'География', icon: MapPin },
      { key: 'preview', label: 'Предпросмотр', icon: Eye },
    ],
  },
  {
    key: 'engagement', label: 'Взаимодействие', icon: Headset,
    items: [
      { key: 'chat', label: 'Чат', icon: ChatTeardropText },
      { key: 'leads', label: 'Лиды', icon: Sparkle },
      { key: 'support', label: 'Поддержка', icon: EnvelopeSimple },
      { key: 'broadcasts', label: 'Рассылки', icon: Megaphone },
      { key: 'bot', label: 'Телеграм-бот', icon: TelegramLogo },
    ],
  },
  {
    key: 'control', label: 'Контроль и аналитика', icon: Database,
    items: [
      { key: 'analytics', label: 'Аналитика', icon: ChartLineUp },
      { key: 'users', label: 'Пользователи', icon: UsersThree },
      { key: 'finance', label: 'Финансы', icon: Receipt },
      { key: 'moderation', label: 'Модерация', icon: ShieldCheck },
      { key: 'audit', label: 'Журнал', icon: ListChecks },
      { key: 'health', label: 'Система', icon: Pulse },
    ],
  },
  {
    key: 'growth', label: 'Рост', icon: TrendUp,
    items: [
      { key: 'growth', label: 'Рост и монетизация', icon: TrendUp },
    ],
  },
  {
    key: 'system', label: 'Надёжность', icon: Cloud,
    items: [
      { key: 'reliability', label: 'Надёжность', icon: ShieldCheck },
    ],
  },
  {
    key: 'extra', label: 'Дополнительно', icon: Stack,
    items: [
      { key: 'clients', label: 'Клиенты', icon: UserCircle },
      { key: 'promos', label: 'Промокоды', icon: Tag },
      { key: 'transactions', label: 'Транзакции', icon: Receipt },
      { key: 'webhooks', label: 'Вебхуки', icon: Plugs },
      { key: 'gallery', label: 'Галерея', icon: Eye },
      { key: 'services', label: 'Каталог услуг', icon: Wrench },
      { key: 'locations', label: 'Локации', icon: MapPin },
      { key: 'masters', label: 'Мастера', icon: UsersThree },
      { key: 'reviews', label: 'Отзывы', icon: Star },
    ],
  },
  {
    key: 'platform', label: 'Платформа', icon: Sliders,
    items: [
      { key: 'plans', label: 'Тарифы', icon: CreditCard },
      { key: 'integrations', label: 'Интеграции', icon: Plugs },
      { key: 'notifications', label: 'Уведомления', icon: Bell },
      { key: 'templates', label: 'Шаблоны', icon: Stack },
      { key: 'settings', label: 'Настройки', icon: Gear },
      { key: 'misc', label: 'Прочее платформы', icon: Sliders },
      { key: 'partners', label: 'Партнёры', icon: UsersThree },
      { key: 'ready', label: 'Готовые сервисы', icon: ListChecks },
    ],
  },
];


/** Ключ localStorage: помнит, включён ли демо-режим в «Здоровье системы». */
const DEMO_KEY = 'saas_admin_demo';

const TITLES: Record<Section, string> = {  dashboard: 'Дашборд', businesses: 'Бизнесы', bookings: 'Трафик', clients: 'Клиенты',
  chat: 'Чат', leads: 'Лиды', masters: 'Мастера', locations: 'Локации', promos: 'Промокоды',
  support: 'Поддержка', webhooks: 'Вебхуки', gallery: 'Галерея', analytics: 'Аналитика',
  users: 'Пользователи', finance: 'Финансы', transactions: 'Транзакции', reviews: 'Отзывы',
  templates: 'Шаблоны', bot: 'Телеграм-бот', settings: 'Настройки', moderation: 'Модерация',
  audit: 'Журнал действий', coverage: 'География', health: 'Здоровье системы',
  broadcasts: 'Рассылки', services: 'Каталог услуг', plans: 'Тарифы', integrations: 'Интеграции',
  notifications: 'Уведомления', growth: 'Рост и монетизация', reliability: 'Надёжность',
  misc: 'Прочее платформы', partners: 'Партнёры', ready: 'Готовые сервисы', preview: 'Предпросмотр интерфейсов',
};

export function SuperAdmin() {
  const [section, setSection] = useState<Section>('dashboard');
  // Демо-режим выключен по умолчанию: админка показывает только реальные данные.
  // Выбор пользователя запоминается в браузере (см. эффект ниже).
  const [demoData, setDemoData] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(NAV_GROUPS.map((g) => g.key)));
  const [query, setQuery] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // Демо-режим переживает перезагрузку: читаем выбор один раз после монтирования
  // (в SSR localStorage нет, поэтому не в инициализаторе useState — иначе рассинхрон гидратации).
  useEffect(() => {
    try { setDemoData(window.localStorage.getItem(DEMO_KEY) === '1'); } catch { /* приватный режим — остаёмся на «выключено» */ }
  }, []);

  const toggleDemo = useCallback(() => {
    setDemoData((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(DEMO_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      push(next ? 'Демо-данные включены' : 'Демо-данные выключены', 'info');
      return next;
    });
  }, [push]);

  const toUiStatus = (raw: string): BusinessStatus =>
    raw === 'new' || raw === 'in_progress' ? 'pending'
      : raw === 'refused' || raw === 'archived' || raw === 'transferred_out' || raw === 'pending_deletion' || raw === 'deleted' ? 'suspended'
        : 'active';
  const fromUiStatus = (ui: BusinessStatus): string => ui === 'pending' ? 'new' : ui === 'suspended' ? 'refused' : 'client';

  const loadBusinesses = useCallback(async () => {
    try {
      const r = await getBusinessesAction();
      setBusinesses(r.rows.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        city: b.city ?? '—',
        template: b.category ?? '—',
        status: toUiStatus(b.status),
        owner: b.telegram ? 'бот подключён' : '—',
        bookingsToday: b.bookingsToday,
        revenueMonth: b.revenueMonth,
        created: b.createdAt,
      })));
    } catch {
      setBusinesses([]);
    }
  }, []);

  useEffect(() => { void loadBusinesses(); }, [loadBusinesses]);

  // ⌘K / Ctrl+K — командная палитра
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeStatus = async (id: string, status: BusinessStatus) => {
    const prev = businesses;
    setBusinesses((p) => p.map((b) => (b.id === id ? { ...b, status } : b)));
    const r = await setBusinessStatusAction(id, fromUiStatus(status));
    if (!r.ok) { setBusinesses(prev); push(r.error ?? 'Не удалось изменить статус', 'error'); return; }
    push(`Статус изменён: ${STATUS[status].label}`, 'success');
  };

  const removeBiz = async (id: string) => {
    const name = businesses.find((b) => b.id === id)?.name ?? '';
    const prev = businesses;
    setBusinesses((p) => p.filter((b) => b.id !== id));
    setDrawerId(null);
    const r = await setBusinessStatusAction(id, 'archived');
    if (!r.ok) { setBusinesses(prev); push(r.error ?? 'Не удалось перенести в архив', 'error'); return; }
    push(`Бизнес «${name}» перемещён в архив`, 'info');
  };

  const bulkStatus = async (ids: string[], status: BusinessStatus) => {
    const prev = businesses;
    setBusinesses((p) => p.map((b) => (ids.includes(b.id) ? { ...b, status } : b)));
    const results = await Promise.all(ids.map((id) => setBusinessStatusAction(id, fromUiStatus(status))));
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) { setBusinesses(prev); push(`Не удалось обновить: ${failed} из ${ids.length}`, 'error'); }
  };

  const bulkDelete = async (ids: string[]) => {
    const prev = businesses;
    setBusinesses((p) => p.filter((b) => !ids.includes(b.id)));
    const results = await Promise.all(ids.map((id) => setBusinessStatusAction(id, 'archived')));
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) { setBusinesses(prev); push(`Не удалось перенести в архив: ${failed} из ${ids.length}`, 'error'); }
  };

  const drawerBiz = businesses.find((b) => b.id === drawerId) ?? null;
  const toggleGroup = (key: string) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const go = (key: Section) => { setSection(key); setMobileNavOpen(false); };

  const navList = (
    <nav className="mt-4 flex flex-col gap-3" aria-label="Разделы" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {NAV_GROUPS.map((g) => {
        const GroupIcon = g.icon;
        const isOpen = openGroups.has(g.key);
        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-caption font-semibold uppercase tracking-wide text-brand-text-muted"
            >
              <GroupIcon size={15} weight="bold" className="shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">{g.label}</span>
              {isOpen ? <CaretDown size={14} weight="bold" aria-hidden="true" /> : <CaretRight size={14} weight="bold" aria-hidden="true" />}
            </button>
            {isOpen && g.items.map((n) => {
              const Glyph = n.icon;
              const active = section === n.key;
              return (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => go(n.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-body-sm transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-brand-text-muted hover:bg-white/[0.04] hover:text-white'}`}
                >
                  <Glyph size={19} weight={active ? 'bold' : 'regular'} aria-hidden="true" /> {n.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="detailing-root min-h-screen">
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <div className="flex min-h-screen flex-row max-lg:flex-col">
        <aside className={`${collapsed ? 'w-[76px]' : 'w-[264px]'} hidden shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-3 lg:flex`} style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div className={`flex items-center gap-2 rounded-full px-2 py-2 ${collapsed ? 'flex-col items-center' : ''}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-accent-solid text-[15px] font-semibold text-brand-accent-on">S</span>
            {!collapsed && <span className="flex-1 text-[15px] font-semibold tracking-[-0.01em]">Супер-админка</span>}
            <button type="button" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} aria-expanded={!collapsed} className="grid size-8 shrink-0 place-items-center rounded-lg text-brand-text-muted transition-colors hover:bg-white/[0.06] hover:text-white">
              {collapsed ? <CaretRight size={16} weight="bold" aria-hidden="true" /> : <CaretLeft size={16} weight="bold" aria-hidden="true" />}
            </button>
          </div>

          {!collapsed && navList}

          <div className="mt-auto rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2.5">
              <UserCircle size={22} weight="bold" className="text-white/85" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-body-sm">Администратор</div>
                <div className="truncate text-caption text-brand-text-subtle">супер-админ</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-sticky flex items-center justify-between gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-3 backdrop-blur-xl md:px-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Открыть меню" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-brand-text-muted transition-colors hover:text-white lg:hidden"><List size={20} weight="bold" aria-hidden="true" /></button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-heading-md">{TITLES[section]}</h1>
                  {demoData && (
                    <span className="rounded-full border border-brand-accent/40 bg-brand-accent/10 px-2 py-0.5 text-caption text-brand-accent" title="В «Здоровье системы» показываются демонстрационные значения. Выключите в «Настройках» → «Платформа».">
                      демо-данные
                    </span>
                  )}
                </div>
                <p className="text-caption text-brand-text-subtle"><ClockLabel /></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 md:flex">
                <MagnifyingGlass size={16} weight="bold" className="text-brand-text-subtle" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); if (section !== 'businesses') setSection('businesses'); }}
                  placeholder="Поиск бизнесов…"
                  className="w-44 bg-transparent text-body-sm outline-none placeholder:text-brand-text-subtle"
                  aria-label="Поиск бизнесов"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Очистить" className="text-brand-text-subtle hover:text-white"><X size={14} weight="bold" aria-hidden="true" /></button>
                )}
              </label>
              <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Командная палитра" className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-2 text-caption text-brand-text-subtle transition-colors hover:text-white sm:flex">
                <span className="text-[13px]">⌘</span><span>K</span>
              </button>
              <span className="grid size-9 place-items-center rounded-full border border-white/10 text-brand-text-muted"><UserCircle size={20} weight="bold" aria-hidden="true" /></span>
            </div>
          </header>

          {mobileNavOpen && (
            <div className="fixed inset-0 z-modal" style={{ zIndex: 300 }}>
              <button type="button" aria-label="Закрыть меню" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <aside className="absolute left-0 top-0 flex h-full w-[280px] max-w-[82%] flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-3" style={{ overflowY: 'auto' }}>
                <div className="flex items-center justify-between px-2 py-2">
                  <span className="text-[15px] font-semibold">Супер-админка</span>
                  <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Закрыть меню" className="grid size-8 place-items-center rounded-lg text-brand-text-muted hover:bg-white/[0.06] hover:text-white"><X size={18} weight="bold" aria-hidden="true" /></button>
                </div>
                {navList}
              </aside>
            </div>
          )}

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
            <div key={String(demoData)}>
              {section === 'dashboard' && <Dashboard businesses={businesses} push={push} onOpenAudit={() => setSection('audit')} />}
              {section === 'businesses' && <Businesses businesses={businesses} onOpen={setDrawerId} query={query} push={push} onBulkStatus={bulkStatus} onBulkDelete={bulkDelete} onAdd={async (b) => {
                const r = await createBusinessAction({ name: b.name, city: b.city });
                if (!r.ok) { push(r.error ?? 'Не удалось создать бизнес', 'error'); return; }
                push(`Бизнес «${b.name}» создан`, 'success');
                await loadBusinesses();
              }} />}
              {section === 'bookings' && <Bookings push={push} />}
              {section === 'chat' && <Chat push={push} />}
              {section === 'leads' && <Leads push={push} />}
              {section === 'support' && <Support push={push} />}
              {section === 'analytics' && <Analytics push={push} />}
              {section === 'users' && <UsersSection push={push} />}
              {section === 'finance' && <Finance push={push} />}
              {section === 'moderation' && <Moderation push={push} />}
              {section === 'audit' && <Audit push={push} />}
              {section === 'coverage' && <Coverage push={push} />}
              {section === 'health' && <Health push={push} demoData={demoData} />}
              {section === 'broadcasts' && <Broadcasts push={push} />}
              {section === 'plans' && <Plans push={push} />}
              {section === 'integrations' && <Integrations push={push} />}
              {section === 'notifications' && <Notifications push={push} />}
              {section === 'templates' && <Templates push={push} />}
              {section === 'bot' && <Bot push={push} />}
              {section === 'settings' && <Settings push={push} demoData={demoData} onToggleDemo={toggleDemo} />}
              {section === 'growth' && <GrowthPanel push={push} />}
              {section === 'reliability' && <ReliabilityPanel push={push} />}
              {section === 'misc' && <PlatformMiscPanel push={push} onNavigate={setSection} />}
              {section === 'partners' && <Partners push={push} />}
              {section === 'ready' && <ReadyServices push={push} />}
              {section === 'preview' && <PreviewPanel />}
              {section === 'clients' && <ClientsLive push={push} />}
              {section === 'locations' && <LocationsLive push={push} />}
              {section === 'promos' && <PromosLive push={push} />}
              {section === 'webhooks' && <WebhooksLive push={push} />}
              {section === 'gallery' && <GalleryLive push={push} />}
              {section === 'transactions' && <TransactionsLive push={push} />}
              {section === 'services' && <ServicesLive push={push} />}
              {section === 'masters' && <EmptyByDesign title="Мастера и сотрудники" desc="Сотрудники бизнесов" why="В схеме базы нет таблицы сотрудников: мастера ведутся внутри кабинета конкретного бизнеса. Платформенный раздел появится, если заведём общую таблицу." />}
              {section === 'reviews' && <EmptyByDesign title="Отзывы" desc="Оценки бизнесов" why="Отдельной таблицы отзывов нет: рейтинг и число отзывов хранятся в карточке бизнеса (поля rating и reviews_count) и приходят из карт. Отдельный раздел появится вместе с таблицей отзывов." />}
            </div>
          </main>
        </div>
      </div>

      <BusinessDrawer business={drawerBiz} onClose={() => setDrawerId(null)} onStatus={changeStatus} onDelete={removeBiz} push={push} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={setSection} push={push} />
      <ToastHost toasts={toasts} />
    </div>
  );
}
