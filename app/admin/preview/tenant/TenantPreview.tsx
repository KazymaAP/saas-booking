'use client';

// app/admin/preview/tenant/TenantPreview.tsx — интерактивный предпросмотр кабинета предпринимателя.
// Только отображение: ни одного server action, данные демонстрационные.
// Выбор стиля работает локально и показывает ровно то, что увидит арендатор в настройках.
import { useState } from 'react';
import { APPEARANCES, AUTO_KEY, appearanceVars, resolveAppearance } from '@/lib/appearance';

// Та же сводка, что на боевом дашборде: записи, выполненные и выручка.
const STATS = [
  { label: 'Записей сегодня', value: '6' },
  { label: 'Завершено сегодня', value: '2' },
  { label: 'Выручка сегодня', value: '9 500 ₽' },
  { label: 'Выручка за неделю', value: '48 000 ₽', accent: true },
  { label: 'На 7 дней', value: '34' },
  { label: 'Ждут подтверждения', value: '2', accent: true },
];

const PAYMENTS = [
  { label: 'Подписка · ноябрь', date: '01.11.2026', amount: '2 500 ₽' },
  { label: 'Первый платёж', date: '15.10.2026', amount: '5 000 ₽' },
];

const SERVICES = ['Комплексная мойка · 2 500 ₽', 'Химчистка салона · 5 000 ₽', 'Керамическое покрытие · 12 000 ₽'];

const BOOKINGS = [
  { time: '10:00', client: 'Иван Петров', service: 'Комплексная мойка', phone: '+7 900 111-22-33', status: 'Ждёт подтверждения' },
  { time: '12:30', client: 'Светлана Ветрова', service: 'Химчистка салона', phone: '+7 900 222-33-44', status: 'Ждёт подтверждения' },
  { time: '15:00', client: 'Дмитрий Козлов', service: 'Керамическое покрытие', phone: '+7 900 333-44-55', status: 'Подтверждена' },
];

const CHECKLIST = [
  { label: 'Добавить услуги и цены', done: true },
  { label: 'Загрузить фотографии работ', done: true },
  { label: 'Указать адрес и часы работы', done: false },
  { label: 'Подключить Телеграм-бота', done: false },
];

// Полный список разделов боевого кабинета владельца.
const SECTIONS = ['Главная', 'Брони', 'Услуги', 'Фото', 'Тексты', 'Уведомления', 'Настройки', 'Оформление', 'Подписка', 'Команда', 'Данные'];

const DEMO_NICHE = 'detailing';

export function TenantPreview() {
  const done = CHECKLIST.filter((c) => c.done).length;
  const percent = Math.round((done / CHECKLIST.length) * 100);
  const [panelStyle, setPanelStyle] = useState<string>(AUTO_KEY);
  const [siteStyle, setSiteStyle] = useState<string>(AUTO_KEY);
  const [view, setView] = useState<'today' | 'week'>('today');
  const [manualNote, setManualNote] = useState<string | null>(null);
  const [active, setActive] = useState<string>('Главная');
  const theme = resolveAppearance(panelStyle, DEMO_NICHE);
  const siteTheme = resolveAppearance(siteStyle, DEMO_NICHE);

  return (
    <div className="panel-shell min-h-screen" style={appearanceVars(theme)} data-mode={theme.mode}>
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="mb-5 rounded-lg border border-[var(--line)] bg-[var(--soft)] px-4 py-3 text-[13px] text-[var(--muted)]">
          <b className="text-[var(--ink)]">Это статичный макет для показа интерфейса.</b> Кнопки здесь намеренно
          не работают и данные не сохраняются. Боевой кабинет со всеми действиями —{' '}
          <a className="text-[var(--brand-color)] underline" href="/m/lyubava/panel">/m/lyubava/panel</a>{' '}
          (нужен вход владельцем).
          <br />Меню кликабельно: «Оформление» — отдельный раздел со стилями, остальные пункты показывают главную. Выбор стиля работает локально.
        </div>

        <nav aria-label="Разделы кабинета" className="mb-6 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActive(s)}
              aria-current={active === s ? 'page' : undefined}
              className={`inline-flex min-h-[36px] items-center rounded-lg border px-3 text-[14px] ${active === s ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-[var(--on-accent)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}
            >
              {s}
            </button>
          ))}
        </nav>

        {active === 'Оформление' && (
          <div className="grid gap-4">
            <p className="m-0 text-[13px] text-[var(--muted)]">
              Раздел «Оформление» — отдельный пункт меню. Демо: выбор стиля работает, данные не сохраняются.
            </p>
        {/* Отдельный раздел «Оформление»: тот же выбор стилей, что в боевом кабинете, но локальный */}
        <section aria-label="Оформление" className="mb-6 grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div>
            <h2 className="m-0 text-[18px] font-semibold">Оформление</h2>
            <p className="mt-1 text-[13px] text-[var(--muted)]">Стиль кабинета и сайта выбираются отдельно. По умолчанию — оформление вашей ниши.</p>
          </div>
          {([['Кабинет', panelStyle, setPanelStyle], ['Сайт-визитка', siteStyle, setSiteStyle]] as const).map(([title, current, set]) => (
            <div key={title} className="grid gap-2">
              <h3 className="m-0 text-[15px] font-medium">{title}</h3>
              <div className="flex flex-wrap gap-2">
                {[null, ...APPEARANCES].map((a) => {
                  const key = a?.key ?? AUTO_KEY;
                  const active = current === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set(key)}
                      aria-pressed={active}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[12px] transition-colors ${active ? 'border-[var(--brand-color)] bg-[var(--soft)]' : 'border-[var(--line)] hover:bg-[var(--soft)]'}`}
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-6 shrink-0 place-items-center rounded-md border border-[var(--line)]"
                        style={{ background: a?.bg ?? 'linear-gradient(135deg,#f3f3f3 50%,#dcdcdc 50%)' }}
                      >
                        {a && <span className="size-2 rounded-full" style={{ background: a.accent }} />}
                      </span>
                      <span>{a?.label ?? 'Как сайт'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="m-0 text-[12px] text-[var(--muted)]">
            Сейчас кабинет: <b>{panelStyle === AUTO_KEY ? 'как сайт' : theme.label}</b> · сайт: <b>{siteStyle === AUTO_KEY ? 'как ниша' : siteTheme.label}</b>
          </p>
        </section>
          </div>
        )}

        {active !== 'Оформление' && (<div className="grid gap-8">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-[14px] text-[var(--muted)]">Панель владельца · gljanec</p>
              <h1 className="m-0 text-[28px] font-semibold leading-tight">Детейлинг «Глянец»</h1>
            </div>
            <span className="inline-flex min-h-[40px] items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[14px]">Открыть сайт ↗</span>
          </header>

          <section aria-label="Сводка" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="text-[13px] text-[var(--muted)]">{s.label}</div>
                <div className={`mt-1 text-[24px] font-semibold ${s.accent ? 'text-[var(--brand-color)]' : ''}`}>{s.value}</div>
              </div>
            ))}
          </section>

          <section aria-labelledby="pending-title" className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="pending-title" className="m-0 text-[20px] font-semibold">Записи</h2>
              <div className="flex gap-2">
                {([['today', 'Сегодня'], ['week', 'Неделя']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    aria-pressed={view === key}
                    className={`min-h-9 rounded-lg border px-3 text-[13px] ${view === key ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-[var(--on-accent)]' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}
                  >{label}</button>
                ))}
              </div>
            </div>
            {view === 'week' && <p className="m-0 text-[13px] text-[var(--muted)]">За неделю: 34 записи, из них 2 ждут подтверждения.</p>}
            <ul className="grid gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {BOOKINGS.map((b) => (
                <li key={`${b.time}-${b.client}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <span className="w-14 shrink-0 text-[15px] font-semibold">{b.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{b.client}</span>
                    <span className="block text-[13px] text-[var(--muted)]">{b.service} · {b.phone}</span>
                  </span>
                  <span className="rounded-full border border-[var(--line)] bg-[var(--soft)] px-2.5 py-1 text-[12px]">{b.status}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Ручное добавление записи — та же форма, что в боевом кабинете, но локальная */}
          <section aria-labelledby="manual-title" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 id="manual-title" className="m-0 text-[20px] font-semibold">Добавить запись вручную</h2>
            <p className="mt-1 text-[13px] text-[var(--muted)]">Для клиентов, которые записались по телефону. Запись сразу подтверждена.</p>
            {manualNote && <p className="mt-2 rounded-lg border border-[var(--brand-color)] bg-[var(--soft)] px-3 py-2 text-[13px]">{manualNote}</p>}
            <form
              className="mt-3 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => { e.preventDefault(); setManualNote('Демо: запись не сохраняется. В боевом кабинете она появится в «Бронях».'); }}
            >
              <label className="grid gap-1 text-[13px] text-[var(--muted)]">Услуга<select defaultValue={SERVICES[0]}>{SERVICES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="grid gap-1 text-[13px] text-[var(--muted)]">Дата<input type="date" defaultValue="2026-11-05" /></label>
              <label className="grid gap-1 text-[13px] text-[var(--muted)]">Время<input type="time" defaultValue="10:00" /></label>
              <label className="grid gap-1 text-[13px] text-[var(--muted)]">Клиент<input type="text" placeholder="Имя" /></label>
              <label className="grid gap-1 text-[13px] text-[var(--muted)]">Телефон<input type="tel" placeholder="+7 999 123-45-67" /></label>
              <label className="grid gap-1 text-[13px] text-[var(--muted)]">Email (необязательно)<input type="email" placeholder="client@example.ru" /></label>
              <div className="sm:col-span-2"><button type="submit" className="btn-primary">Добавить запись</button></div>
            </form>
          </section>

          {/* Платежи платформе: в боевом кабинете — реальные строки из payments */}
          <section aria-labelledby="payments-title" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 id="payments-title" className="m-0 text-[20px] font-semibold">Платежи платформе</h2>
            <p className="mt-1 text-[13px] text-[var(--muted)]">Оплата подписки и услуг платформы. Выручка по визитам — в сводке выше.</p>
            <ul className="mt-3 grid gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {PAYMENTS.map((p) => (
                <li key={p.label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-[14px]">
                  <span>{p.label}</span><span className="flex gap-3"><span className="text-[13px] text-[var(--muted)]">{p.date}</span><b>{p.amount}</b></span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="onboarding-title" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 id="onboarding-title" className="m-0 text-[20px] font-semibold">Готовность сайта: {percent}%</h2>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--soft)]">
              <div className="h-2 rounded-full bg-[var(--brand-color)]" style={{ width: `${percent}%` }} />
            </div>
            <ol className="mt-4 grid gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {CHECKLIST.map((c) => (
                <li key={c.label} className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 ${c.done ? 'border-[var(--brand-color)] bg-[var(--soft)]' : 'border-[var(--line)]'}`}>
                  <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full text-[12px] ${c.done ? 'bg-[var(--brand-color)] text-[var(--on-accent)]' : 'border border-[var(--line)] text-transparent'}`}>✓</span>
                  <span className={`text-[15px] ${c.done ? 'text-[var(--muted)] line-through' : 'font-medium'}`}>{c.label}</span>
                  <span className="ml-auto shrink-0 text-[13px] text-[var(--muted)]">{c.done ? 'Готово' : 'Заполнить →'}</span>
                </li>
              ))}
            </ol>
          </section>

          <nav aria-label="Быстрые действия" className="flex flex-wrap gap-2">
            <span className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--brand-color)] px-4 text-[15px] text-[var(--on-accent)]">Открыть брони</span>
            <span className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[15px]">Настройки</span>
          </nav>
        </div>)}
      </div>
    </div>
  );
}
