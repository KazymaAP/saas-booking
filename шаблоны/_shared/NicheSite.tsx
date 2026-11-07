'use client';
// шаблоны/_shared/NicheSite.tsx — универсальный публичный сайт ниши.
// Порт разметки/классов DetailingSite (1:1), но весь копирайт/иконки/ресурсы берутся
// из NicheTenant (темы). Один компонент на все 10 ниш. CSS — общий detailing-scoped.css
// (scoped под .detailing-root), поэтому обёртка сохраняется.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight, ArrowUpRight, CalendarCheck, Clock, Download, House,
  MapPin, Phone, UserCircle, X,
} from '@phosphor-icons/react';
import { NicheBookingFlow } from './NicheBookingFlow';
import { Glyph } from './glyph';
import {
  formatCurrency, formatDuration, formatServicePrice, getStudioStatus,
  pickServiceGlyph, resourceNoun, type NicheTenant,
} from './niche-tenant';

// ---------- accent (точно как TenantLayout) ----------
function hexToRgbTuple(hex: string): [number, number, number] {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return [70, 144, 255];
  return [r, g, b];
}
function scaleRgb(rgb: [number, number, number], k: number): string {
  return rgb.map((v) => Math.round(v * k)).join(' ');
}
function channelLuminance(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}
function contrastWithWhite(rgb: [number, number, number]): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}
function ensureWhiteContrast(rgb: [number, number, number], min = 4.5): [number, number, number] {
  for (let i = 16; i >= 1; i--) {
    const k = i * 0.05;
    const candidate: [number, number, number] = [Math.round(rgb[0] * k), Math.round(rgb[1] * k), Math.round(rgb[2] * k)];
    if (contrastWithWhite(candidate) >= min) return candidate;
  }
  return [0, 0, 0];
}

function InfoCardIcon({ icon }: { icon: string }) {
  const props = { size: 19, weight: 'bold' as const, 'aria-hidden': true };
  switch (icon) {
    case 'clock': return <Clock {...props} />;
    case 'shield': return <Glyph icon="shield" {...props} />;
    case 'calendar': return <CalendarCheck {...props} />;
    case 'star': return <Glyph icon="star" {...props} />;
    default: return <Glyph icon={icon} {...props} />;
  }
}

export function NicheSite({ tenant, prefix, slug }: { tenant: NicheTenant; prefix: string; slug: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [initialServiceId, setInitialServiceId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const openBooking = (serviceId?: string) => {
    setInitialServiceId(serviceId);
    setBookingOpen(true);
  };
  const closeBooking = () => {
    setBookingOpen(false);
    setBusy(false);
  };

  useEffect(() => {
    if (!bookingOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeBooking();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [bookingOpen, busy]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const bg = `rgb(${hexToRgbTuple(tenant.bg).join(' ')})`;
    const fg = `rgb(${hexToRgbTuple(tenant.text).join(' ')})`;
    const prev = { htmlBg: html.style.background, bodyBg: body.style.background, bodyColor: body.style.color, scheme: html.style.colorScheme };
    html.style.background = bg;
    html.style.colorScheme = tenant.mode;
    body.style.background = bg;
    body.style.color = fg;
    return () => {
      html.style.background = prev.htmlBg;
      html.style.colorScheme = prev.scheme;
      body.style.background = prev.bodyBg;
      body.style.color = prev.bodyColor;
    };
  }, [tenant.bg, tenant.text, tenant.mode]);

  const accentChannels = useMemo(() => hexToRgbTuple(tenant.accentColor), [tenant.accentColor]);
  const accent2Channels = useMemo(() => hexToRgbTuple(tenant.accent2), [tenant.accent2]);
  const paletteStyle = useMemo(() => {
    const accentSolid = ensureWhiteContrast(accentChannels);
    const t = (hex: string) => hexToRgbTuple(hex).join(' ');
    return {
      '--color-bg': t(tenant.bg),
      '--color-surface': t(tenant.surface),
      '--color-border': t(tenant.border),
      '--color-border-hover': t(tenant.borderHover),
      '--color-text': t(tenant.text),
      '--color-text-muted': t(tenant.textMuted),
      '--color-text-subtle': t(tenant.textSubtle),
      '--color-accent': accentChannels.join(' '),
      '--color-accent-2': accent2Channels.join(' '),
      // В светлых темах стандартный зелёный #22c55e даёт 2.3:1 на белом — статус «Открыто до…»
      // не читался. Для светлого режима берём тёмный зелёный (4.9:1), для тёмного оставляем прежний.
      '--color-success': tenant.mode === 'light' ? '21 128 61' : '34 197 94',
      // Подсказки формы записи: один и тот же серый не проходит AA и на белом, и на тёмном,
      // поэтому цвет зависит от режима темы (см. booking-ui.tsx).
      '--booking-muted': tenant.mode === 'light' ? '#595959' : '#a1a1aa',
      '--color-accent-solid': accentSolid.join(' '),
      '--color-accent-solid-hover': scaleRgb(accentSolid, 0.9),
    } as CSSProperties;
  }, [accentChannels, accent2Channels, tenant.bg, tenant.surface, tenant.border, tenant.borderHover, tenant.text, tenant.textMuted, tenant.textSubtle]);

  const activeServices = tenant.services.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const previewServices = activeServices.slice(0, 4);
  const minPrice = activeServices.length > 0 ? Math.min(...activeServices.map((s) => s.price)) : null;
  const gallery = [...tenant.gallery].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3);
  const resourceCount = tenant.resources.filter((r) => r.isActive).length;
  const status = getStudioStatus(tenant.workHours, tenant.timezone, now);

  return (
    <div className="detailing-root min-h-screen bg-brand-bg" style={paletteStyle} data-mode={tenant.mode}>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-scoped.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/detailing-fonts.css" />

      <header className="safe-area-top sticky top-0 z-sticky bg-[rgb(var(--color-bg)/0.82)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[69rem] items-center justify-between border-b border-brand-border px-4 md:h-[92px] md:px-6">
          <a href="#top" aria-label={`${tenant.name} — на главную`} className="group flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
            <span className="grid size-12 place-items-center overflow-hidden rounded-full border border-brand-border bg-brand-surface text-brand-text transition-transform duration-normal group-hover:scale-105 md:size-[52px]">
              {tenant.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.logo} alt="" className="size-full object-cover" loading="lazy" />
              ) : (
                <Glyph icon={tenant.glyph} size={22} weight="fill" />
              )}
            </span>
            <span className="text-[16px] font-semibold leading-none tracking-[-0.01em]">{tenant.name}</span>
          </a>
          <a href="#book" aria-label="Профиль клиента" className="grid size-10 place-items-center rounded-full border border-brand-border text-brand-text-muted transition-colors hover:border-brand-border hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
            <UserCircle size={21} weight="bold" />
          </a>
        </div>
      </header>

      <main className="pb-28 md:pb-24" id="top">
        <div className="mx-auto max-w-[69rem] px-4 pb-4 md:px-6">
          <section className="pt-4 md:pt-7">
            <div className="hero-frame">
              {tenant.heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.heroImage} alt={`${tenant.name} — ${tenant.tagline}`} className="aspect-[16/10] w-full object-cover object-[50%_64%] md:aspect-[3.72/1] md:object-center" loading="eager" />
              ) : (
                <div className="aspect-[16/10] w-full bg-[radial-gradient(70%_90%_at_72%_20%,rgb(var(--color-accent)/0.28),transparent_70%)] md:aspect-[3.72/1]" aria-hidden="true" />
              )}
              {tenant.heroImage && (
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" aria-hidden="true" />
              )}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_80%_at_76%_16%,rgb(var(--color-accent-2)/0.24),transparent_72%)]" aria-hidden="true" />
              <button type="button" onClick={() => openBooking()} className="pill-glass press absolute bottom-4 left-4 right-4 flex h-12 items-center justify-between px-5 text-body-md font-medium sm:bottom-5 sm:left-5 sm:right-auto sm:h-11 sm:justify-start sm:gap-2">
                {tenant.ctaPrimary}
                <ArrowUpRight size={17} weight="bold" className="sm:hidden" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => openBooking()} aria-label={tenant.ctaPrimary} className="absolute bottom-5 right-5 hidden size-11 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-xl transition-colors hover:bg-black/60 sm:grid">
                <ArrowUpRight size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="flex items-start justify-between gap-6 pt-8 md:pt-10">
            <div className="min-w-0">
              <h1 className="max-w-[760px] text-[36px] font-semibold leading-[1.08] tracking-[-0.035em] text-balance md:text-[42px]">{tenant.name}</h1>
              <p className="mt-4 max-w-[620px] text-[15px] leading-6 text-brand-text-muted md:text-base">{tenant.description}</p>
            </div>
            <a href="#services" aria-label="Все услуги" className="mt-1 hidden size-12 shrink-0 place-items-center rounded-full border border-brand-border text-brand-text-muted transition-colors hover:border-brand-border hover:text-brand-text md:grid">
              <ArrowRight size={20} weight="bold" aria-hidden="true" />
            </a>
          </section>

          <section className="grid grid-cols-2 gap-3 pt-7 md:grid-cols-3 md:gap-4">
            <div className="rounded-3xl border border-brand-border bg-brand-surface p-4 md:p-5">
              <div className="flex items-center gap-3">
                <Glyph icon={tenant.glyph} size={20} weight="bold" className="text-brand-text" />
                <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{activeServices.length}</div>
              </div>
              <div className="mt-3 text-[13px] text-brand-text-muted">услуг в прайсе</div>
            </div>
            <div className="rounded-3xl border border-brand-border bg-brand-surface p-4 md:p-5">
              <div className="flex items-center gap-3">
                <Glyph icon={tenant.glyph} size={20} weight="bold" className="text-brand-text" />
                <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{resourceCount}</div>
              </div>
              <div className="mt-3 text-[13px] text-brand-text-muted">{resourceNoun(resourceCount, tenant.resourceLabel)} в работе</div>
            </div>
            <div className="col-span-2 rounded-3xl border border-brand-border bg-brand-surface p-4 md:col-span-1 md:p-5">
              <div className="flex items-center gap-3">
                <Glyph icon="calendar" size={20} weight="bold" className="text-brand-text" />
                <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{minPrice !== null ? `от ${formatCurrency(minPrice)}` : '—'}</div>
                <div className="ml-auto mr-12 text-[13px] text-brand-text-muted md:hidden">за услугу</div>
              </div>
              <div className="mt-3 hidden text-[13px] text-brand-text-muted md:block">за услугу</div>
            </div>
          </section>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,620px)_320px] lg:justify-between lg:gap-6">
            <div className="order-2 lg:order-1">
              <section id="services">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <h2 className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">Услуги</h2>
                  <a href="#services" className="inline-flex items-center gap-1 text-[13px] text-brand-text-muted transition-colors hover:text-brand-text">
                    Все услуги
                    <ArrowRight size={15} weight="bold" aria-hidden="true" />
                  </a>
                </div>

                <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
                  {previewServices.map((service) => (
                    <button key={service.id} type="button" onClick={() => openBooking(service.id)} className="service-row-flat group">
                      <span className="icon-badge-neutral size-11">
                        <Glyph icon={pickServiceGlyph(service.name, tenant)} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-5">{service.name}</span>
                        <span className="mt-1 block text-[13px] leading-5 text-brand-text-muted">{formatDuration(service.durationMinutes)}</span>
                      </span>
                      <span className="flex shrink-0 items-start gap-2 pt-0.5">
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="whitespace-nowrap text-[13px] font-semibold sm:text-sm">{formatServicePrice(service.price)}</span>
                          <span className="hidden text-[11px] text-brand-text-subtle sm:block">Выбрать</span>
                        </span>
                        <ArrowUpRight size={15} className="mt-0.5 text-brand-text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                  {previewServices.length === 0 && (
                    <p className="p-5 text-body-sm text-brand-text-muted">Прайс обновляется — скоро добавим услуги.</p>
                  )}
                </div>
              </section>

              {gallery.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-5 text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">Наши работы</h2>
                  <div className="grid max-w-[520px] grid-cols-2 gap-x-4 gap-y-5">
                    {gallery.map((item) => (
                      <figure key={item.id} className="group min-w-0">
                        <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-surface">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.url} alt={item.caption} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                        </div>
                        <figcaption className="mt-2.5 text-[12px] leading-4 text-brand-text-muted">{item.caption}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              {tenant.infoCards.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-5 text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">Почему выбирают нас</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {tenant.infoCards.slice(0, 3).map((card) => (
                      <div key={card.id} className="rounded-3xl border border-brand-border bg-brand-surface p-4 md:p-5">
                        <span className="grid size-10 place-items-center rounded-xl border border-brand-border bg-brand-surface text-brand-text">
                          <InfoCardIcon icon={card.icon} />
                        </span>
                        <h3 className="mt-4 text-[15px] font-semibold leading-5">{card.title}</h3>
                        <p className="mt-1.5 text-[13px] leading-5 text-brand-text-muted">{card.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="order-1 space-y-4 lg:order-2">
              <h2 className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">Запись</h2>

              <div className="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-surface p-5">
                <div className="dot-matrix pointer-events-none absolute -right-14 -top-16 size-52 opacity-70" aria-hidden="true" />
                <Glyph icon={tenant.glyph} size={22} weight="fill" className="relative text-brand-text" />
                <h3 className="relative mt-4 text-[17px] font-semibold leading-6">{tenant.asideTitle}</h3>
                <p className="relative mt-2 text-[13px] leading-5 text-brand-text-muted">{tenant.asideText}</p>
                <button type="button" onClick={() => openBooking()} className="btn-primary press relative mt-5 w-full text-body-sm">
                  {tenant.ctaBook}
                  <ArrowRight size={16} weight="bold" aria-hidden="true" />
                </button>
              </div>

              <div className="rounded-3xl border border-brand-border bg-brand-surface p-5">
                <div className="flex items-start gap-3">
                  <MapPin size={20} weight="fill" className="mt-0.5 shrink-0 text-brand-text" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium leading-5">{tenant.address}</div>
                    <div className={`mt-1.5 flex items-center gap-1.5 text-[12px] ${status.isOpen ? 'text-brand-success' : 'text-brand-text-muted'}`}>
                      <Clock size={13} weight="bold" aria-hidden="true" />
                      <span>{status.label}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <a href={`https://yandex.ru/maps/?text=${encodeURIComponent(tenant.address)}`} target="_blank" rel="noopener" className="btn-secondary press flex-1 py-2.5 text-[13px]">
                    Маршрут
                    <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
                  </a>
                  <a href={`tel:${tenant.phone.replace(/\s/g, '')}`} aria-label={`Позвонить: ${tenant.phone}`} className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-border text-brand-text transition-colors hover:border-brand-border hover:bg-brand-surface">
                    <Phone size={17} weight="bold" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </aside>
          </div>

          <section id="book" className="mt-12 md:mt-16">
            <h2 className="mb-5 text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{tenant.ctaPrimary}</h2>
            <div className="rounded-3xl border border-brand-border bg-brand-surface p-5 md:p-6">
              <NicheBookingFlow tenant={tenant} prefix={prefix} slug={slug} onClose={() => {}} />
            </div>
          </section>

          <section className="mt-12 md:mt-16" id="install">
            <div className="relative overflow-hidden rounded-3xl border border-brand-border bg-brand-surface p-6 md:p-8">
              <div className="pointer-events-none absolute -right-24 top-1/2 h-80 w-[460px] -translate-y-1/2 rounded-full bg-brand-accent/15 blur-3xl" aria-hidden="true" />
              <div className="dot-matrix pointer-events-none absolute -right-4 top-1/2 h-72 w-[420px] -translate-y-1/2 opacity-80" aria-hidden="true" />
              <div className="relative max-w-lg">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-brand-accent-solid text-[13px] font-semibold text-brand-accent-on shadow-[0_8px_24px_-8px_rgb(var(--color-accent)/0.7)]" aria-hidden="true">
                    {tenant.name.slice(0, 1)}
                  </span>
                  <div>
                    <div className="text-[13px] font-medium leading-4">{tenant.name}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-brand-text-muted">Приложение {tenant.businessNoun}</div>
                  </div>
                </div>
                <h2 className="mt-6 max-w-[320px] text-[26px] font-semibold leading-tight tracking-[-0.03em] md:text-[32px]">{tenant.installTitle}</h2>
                <p className="mt-2 max-w-md text-[14px] leading-6 text-brand-text-muted">{tenant.installText}</p>
                <span className="btn-primary press mt-5 inline-flex text-body-sm">
                  <Download size={16} weight="bold" aria-hidden="true" />
                  {tenant.installCta}
                </span>
                <p className="mt-3 text-[11px] text-brand-text-subtle">Бесплатно. Установка через браузер.</p>
              </div>
            </div>
          </section>
        </div>

        <footer className="mx-auto mt-16 max-w-[69rem] px-4 md:px-6">
          <div className="footer-bar">
            <span className="text-[13px] font-semibold text-brand-text">{tenant.name}</span>
            <a href={`tel:${tenant.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 text-caption text-brand-text-muted transition-colors hover:text-brand-text">
              Связаться <span aria-hidden="true">↗</span>
            </a>
          </div>
        </footer>
      </main>

      <nav className="bottom-nav safe-area-bottom" aria-label="Основная навигация">
        <div className="bottom-nav__inner">
          <a href="#top" aria-label="Главная" aria-current="page" className="bottom-nav__item press is-active">
            <House size={20} weight="bold" />
            <span>Главная</span>
          </a>
          <a href="#services" aria-label="Услуги" className="bottom-nav__item press">
            <Glyph icon={tenant.glyph} size={20} weight="bold" />
            <span>Услуги</span>
          </a>
          <a href="#book" aria-label="Моя запись" className="bottom-nav__item press">
            <CalendarCheck size={20} weight="bold" />
            <span>Моя запись</span>
          </a>
        </div>
      </nav>

      {bookingOpen && (
        <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center" role="presentation">
          <div className="sheet-backdrop" onClick={busy ? undefined : closeBooking} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label={`Запись — ${tenant.name}`} tabIndex={-1} className="sheet animate-scale-in">
            <button type="button" onClick={closeBooking} disabled={busy} aria-label="Закрыть" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-brand-text-muted transition-colors hover:bg-brand-border-hover hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
              <X size={20} weight="bold" />
            </button>
            <NicheBookingFlow tenant={tenant} prefix={prefix} slug={slug} initialServiceId={initialServiceId} onClose={closeBooking} onBusyChange={setBusy} />
          </div>
        </div>
      )}
    </div>
  );
}
