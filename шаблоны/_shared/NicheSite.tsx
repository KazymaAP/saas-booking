'use client';
// шаблоны/_shared/NicheSite.tsx — универсальный публичный сайт ниши.
// Порт разметки/классов DetailingSite (1:1), но весь копирайт/иконки/ресурсы берутся
// из NicheTenant (темы). Один компонент на все 10 ниш. CSS — общий detailing-scoped.css
// (scoped под .detailing-root), поэтому обёртка сохраняется.
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, CalendarCheck, CaretDown, Clock, Download, House,
  InstagramLogo, MapPin, Phone, Star, TelegramLogo, UserCircle, WhatsappLogo, X,
} from '@phosphor-icons/react';
import { NicheBookingFlow } from './NicheBookingFlow';
import { Glyph } from './glyph';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { buildPalette, hexToRgbTuple } from './palette';
import {
  formatCurrency, formatDuration, formatServicePrice, getStudioStatus,
  pickServiceGlyph, plural, resourceNoun, type NicheService, type NicheTenant,
} from './niche-tenant';

// ---------- accent (точно как TenantLayout) ----------
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

// Мессенджеры и соцсети из карточки бизнеса. Показываем только настоящие ссылки:
// в данных встречаются и логины вида «@studio», из которых href не собрать.
const SOCIAL_META: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'vk', label: 'ВКонтакте' },
];

function SocialLinks({ socials }: { socials: Record<string, string> }) {
  const items = SOCIAL_META.filter(({ key }) => /^https?:\/\//i.test(socials[key] ?? ''));
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      {items.map(({ key, label }) => (
        <a
          key={key}
          href={socials[key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="grid size-8 place-items-center rounded-full border border-brand-border text-brand-text-muted transition-colors hover:border-brand-accent hover:text-brand-text"
        >
          {key === 'telegram' && <TelegramLogo size={15} weight="bold" aria-hidden="true" />}
          {key === 'whatsapp' && <WhatsappLogo size={15} weight="bold" aria-hidden="true" />}
          {key === 'instagram' && <InstagramLogo size={15} weight="bold" aria-hidden="true" />}
          {key === 'vk' && <span className="text-[10px] font-bold" aria-hidden="true">VK</span>}
        </a>
      ))}
    </div>
  );
}

// Звёзды рейтинга: заполненные — до округлённой оценки, остальные — контуром.
function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Оценка ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star
          key={index}
          size={size}
          weight={index <= filled ? 'fill' : 'regular'}
          className={index <= filled ? 'text-brand-accent' : 'text-brand-text-subtle'}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ServiceRowButton({ service, tenant, onPick }: { service: NicheService; tenant: NicheTenant; onPick: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onPick(service.id)} className="service-row-flat group">
      <span className="icon-badge-neutral size-11">
        <Glyph icon={pickServiceGlyph(service.name, tenant)} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="block text-[15px] font-semibold leading-5">{service.name}</span>
          {service.badge && (
            <span className="inline-flex items-center rounded-full border border-brand-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-brand-accent">
              {service.badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-[13px] leading-5 text-brand-text-muted">{formatDuration(service.durationMinutes)}</span>
      </span>
      <span className="flex shrink-0 items-start gap-2 pt-0.5">
        <span className="flex flex-col items-end gap-0.5">
          {service.oldPrice !== null && service.oldPrice > service.price && (
            <span className="whitespace-nowrap text-[11px] leading-none text-brand-text-subtle line-through">{formatServicePrice(service.oldPrice)}</span>
          )}
          {/* Подпись «Выбрать» убрана: она делала правую колонку на строку выше названия услуги,
              а affordance уже даёт стрелка и подсветка всей строки при наведении. */}
          <span className="whitespace-nowrap text-[13px] font-semibold sm:text-sm">{formatServicePrice(service.price)}</span>
        </span>
        <ArrowUpRight size={15} className="mt-0.5 text-brand-text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  );
}

export function NicheSite({ tenant, prefix, slug, demo = false }: { tenant: NicheTenant; prefix: string; slug: string; demo?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [initialServiceId, setInitialServiceId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // Переход с UtilityShell: «Услуги» открывает ту же шторку записи.
  useEffect(() => {
    if (demo) return;
    if (new URLSearchParams(window.location.search).get('book') === '1') setBookingOpen(true);
  }, [demo]);

  // Уходим сразу на нужную страницу, минуя светлый промежуточный /booking/last —
  // иначе при переходе на мгновение мелькает белый экран.
  const openMyBooking = () => {
    let token = '';
    try {
      token = window.localStorage.getItem(`autobooking:last:${slug}`) ?? '';
    } catch {
      token = '';
    }
    const target = token
      ? `/${prefix}/${slug}/booking/my/${encodeURIComponent(token)}`
      : `/${prefix}/${slug}/booking/my/none`;
    window.location.assign(target);
  };

  // Демо-шаблон (/dev/templates/*, ссылки с лендинга) рисуется на выдуманных данных:
  // такого бизнеса в базе нет, поэтому слоты и создание записи вернут 404.
  // Шторку не открываем вовсе — иначе посетитель видел бы пустой выбор времени.
  const [demoNotice, setDemoNotice] = useState(false);
  useEffect(() => {
    if (!demoNotice) return;
    const t = window.setTimeout(() => setDemoNotice(false), 4000);
    return () => window.clearTimeout(t);
  }, [demoNotice]);

  const openBooking = (serviceId?: string) => {
    if (demo) { setDemoNotice(true); return; }
    setInitialServiceId(serviceId);
    setBookingOpen(true);
  };
  const closeBooking = () => {
    setBookingOpen(false);
    setBusy(false);
  };

  // Фокус держим внутри шторки: без этого Tab уводил в страницу под ней и до формы
  // записи нельзя было добраться с клавиатуры. Escape обрабатывается ниже — там есть
  // проверка busy, чтобы не закрыть шторку во время отправки.
  const sheetTrap = useFocusTrap<HTMLDivElement>(closeBooking, { enabled: bookingOpen, focusContainer: true, closeOnEscape: false });

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

  // Палитра вынесена в ./palette: тот же набор переменных используют служебные страницы
  // («Моя запись»), иначе они красились жёстко синим независимо от темы ниши.
  const paletteStyle = useMemo(() => buildPalette({
    accent: tenant.accentColor,
    accent2: tenant.accent2,
    mode: tenant.mode,
    bg: tenant.bg,
    surface: tenant.surface,
    border: tenant.border,
    borderHover: tenant.borderHover,
    text: tenant.text,
    textMuted: tenant.textMuted,
    textSubtle: tenant.textSubtle,
  }), [tenant]);

  const activeServices = tenant.services.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const previewServices = activeServices.slice(0, 4);
  const restServices = activeServices.slice(4);
  // Полный прайс раскрывается здесь же: у студии нет отдельной страницы услуг.
  const [showAllServices, setShowAllServices] = useState(false);
  // Цена 0 в прайсе означает «не указана», а не «бесплатно»: с ней Math.min давал 0,
  // и в плитке героя появлялось «от 0 ₽ за услугу» (так было на /d/begemot и /d/skorost).
  const prices = activeServices.map((s) => s.price).filter((p) => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const gallery = [...tenant.gallery].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3);
  const resourceCount = tenant.resources.filter((r) => r.isActive).length;
  const status = getStudioStatus(tenant.workHours, tenant.timezone, now);
  // Средняя оценка по опубликованным отзывам: на сайте показываем её, а не рейтинг из карточки.
  const reviewAverage = tenant.reviews.length > 0
    ? tenant.reviews.reduce((sum, review) => sum + review.rating, 0) / tenant.reviews.length
    : null;

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
          <a href={`/${prefix}/${slug}/booking/my/none`} onClick={(event) => { event.preventDefault(); openMyBooking(); }} aria-label="Профиль клиента" className="grid size-10 place-items-center rounded-full border border-brand-border text-brand-text-muted transition-colors hover:border-brand-border hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg">
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
                {/* Раньше в первой и второй карточке стоял один и тот же глиф ниши — в ряду из трёх
                    плиток это читалось как дубль. Для «в работе» берём часы, для прайса — глиф ниши. */}
                <Clock size={20} weight="bold" className="text-brand-text" aria-hidden="true" />
                <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{resourceCount}</div>
              </div>
              <div className="mt-3 text-[13px] text-brand-text-muted">{resourceNoun(resourceCount, tenant.resourceLabel)} в работе</div>
            </div>
            <div className="col-span-2 rounded-3xl border border-brand-border bg-brand-surface p-4 md:col-span-1 md:p-5">
              <div className="flex items-center gap-3">
                <Glyph icon="calendar" size={20} weight="bold" className="text-brand-text" />
                <div className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{minPrice !== null ? `от ${formatCurrency(minPrice)}` : '—'}</div>
              </div>
              {/* Подпись всегда под значением, как у первых двух плиток: на мобиле она стояла
                  справа через mr-12 и ломала общий ритм ряда. */}
              <div className="mt-3 text-[13px] text-brand-text-muted">за услугу</div>
            </div>
          </section>

          {/* Раньше колонки были жёстко 620 + 320 при контейнере 1056: свободные 92 px уходили
              в промежуток между колонками (lg:justify-between), и вместо 24 px получалось 116 —
              левая колонка выглядела оторванной от правой. Теперь остаток забирает левая колонка. */}
          {/* min-w-0 у колонок: у grid-элемента min-width по умолчанию auto, то есть
              min-content содержимого. Длинная строка внутри прайса распирала колонку
              шире контейнера — на 320 px страница уезжала вбок на 26 px. */}
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
            <div className="order-2 min-w-0 lg:order-1">
              <section id="services">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <h2 className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{tenant.sectionTitles?.services ?? 'Услуги'}</h2>
                  {restServices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllServices((v) => !v)}
                      aria-expanded={showAllServices}
                      className="box-border inline-flex appearance-none items-center gap-1 border-0 bg-transparent p-0 text-[13px] text-brand-text-muted transition-colors hover:text-brand-text"
                    >
                      {showAllServices ? 'Свернуть' : 'Все услуги'}
                      <ArrowRight size={15} weight="bold" className={`transition-transform ${showAllServices ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
                  {previewServices.map((service) => (
                    <ServiceRowButton key={service.id} service={service} tenant={tenant} onPick={openBooking} />
                  ))}
                  {/* Полный прайс не уводит на отдельную страницу: студия — одностраничник,
                      остальные услуги раскрываются здесь же, в той же вёрстке. */}
                  {restServices.length > 0 && (
                    <>
                      {showAllServices && restServices.map((service) => (
                        <ServiceRowButton key={service.id} service={service} tenant={tenant} onPick={openBooking} />
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowAllServices((v) => !v)}
                        aria-expanded={showAllServices}
                        className="box-border flex w-full appearance-none items-center justify-between gap-2 border-0 border-t border-brand-border bg-transparent px-5 py-3.5 text-left text-[13px] font-medium text-brand-text-muted transition-colors hover:text-brand-text"
                      >
                        {showAllServices
                          ? 'Свернуть прайс'
                          : `Ещё ${restServices.length} ${plural(restServices.length, 'услуга', 'услуги', 'услуг')}`}
                        <CaretDown size={15} weight="bold" className={`transition-transform ${showAllServices ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                    </>
                  )}
                  {previewServices.length === 0 && (
                    <p className="p-5 text-body-sm text-brand-text-muted">Прайс обновляется — скоро добавим услуги.</p>
                  )}
                </div>
              </section>

              {gallery.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-5 text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{tenant.sectionTitles?.gallery ?? 'Наши работы'}</h2>
                  {/* Раньше галерея была 2 колонки шириной 520 px при колонке контента 620:
                      третья работа оставалась одна во втором ряду, а справа от неё зияла
                      пустая половина. При трёх кадрах первый становится крупным на всю ширину,
                      при двух — равные половины, при одном — один широкий. */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                    {gallery.map((item, index) => {
                      const featured = index === 0 && gallery.length !== 2;
                      return (
                        <figure key={item.id} className={`group min-w-0 ${featured ? 'col-span-2' : ''}`}>
                          <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-surface">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt={item.caption}
                              loading="lazy"
                              className={`w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] ${featured ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}
                            />
                          </div>
                          <figcaption className="mt-2.5 text-[12px] leading-4 text-brand-text-muted">{item.caption}</figcaption>
                        </figure>
                      );
                    })}
                  </div>
                </section>
              )}

              {tenant.reviews.length > 0 && (
                <section className="mt-10">
                  <div className="mb-5 flex items-end justify-between gap-4">
                    <h2 className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{tenant.sectionTitles?.reviews ?? 'Отзывы'}</h2>
                    {reviewAverage !== null && (
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-brand-text-muted">
                        <Stars value={reviewAverage} />
                        <span className="tabular-nums">{reviewAverage.toFixed(1)}</span>
                        <span className="text-brand-text-subtle">· {tenant.reviews.length}</span>
                      </span>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tenant.reviews.slice(0, 4).map((review) => (
                      <article key={review.id} className="rounded-3xl border border-brand-border bg-brand-surface p-4 md:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <Stars value={review.rating} />
                          {review.source && <span className="text-[11px] text-brand-text-subtle">{review.source}</span>}
                        </div>
                        {review.body && <p className="mt-3 text-[13px] leading-5 text-brand-text-muted">{review.body}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px]">
                          <span className="font-medium text-brand-text">{review.author}</span>
                          {review.serviceName && <span className="text-brand-text-subtle">· {review.serviceName}</span>}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {tenant.staff.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-5 text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{tenant.sectionTitles?.staff ?? 'Команда'}</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {tenant.staff.slice(0, 6).map((member) => (
                      <div key={member.id} className="rounded-3xl border border-brand-border bg-brand-surface p-4">
                        <div className="flex items-center gap-3">
                          {member.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={member.photo} alt={member.name} loading="lazy" className="size-12 shrink-0 rounded-full border border-brand-border object-cover" />
                          ) : (
                            <span className="grid size-12 shrink-0 place-items-center rounded-full border border-brand-border text-brand-text-muted">
                              <UserCircle size={24} weight="bold" aria-hidden="true" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-semibold leading-5">{member.name}</div>
                            {member.position && <div className="mt-0.5 truncate text-[12px] leading-4 text-brand-text-muted">{member.position}</div>}
                          </div>
                        </div>
                        {member.experience !== null && member.experience > 0 && (
                          <div className="mt-3 text-[12px] text-brand-text-subtle">
                            Стаж {member.experience} {plural(member.experience, 'год', 'года', 'лет')}
                          </div>
                        )}
                        {member.description && <p className="mt-1.5 text-[12px] leading-5 text-brand-text-muted">{member.description}</p>}
                      </div>
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

              {tenant.faq.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-5 text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{tenant.sectionTitles?.faq ?? 'Частые вопросы'}</h2>
                  <div className="overflow-hidden rounded-3xl border border-brand-border bg-brand-surface">
                    {tenant.faq.map((item, index) => (
                      <details key={item.id} className={`group ${index > 0 ? 'border-t border-brand-border' : ''}`}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[14px] font-medium leading-5 [&::-webkit-details-marker]:hidden">
                          {item.question}
                          <CaretDown size={16} weight="bold" className="shrink-0 text-brand-text-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <p className="px-5 pb-4 text-[13px] leading-5 text-brand-text-muted">{item.answer}</p>
                      </details>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Правая колонка короче левой (443 px против 2289 px): раньше под карточками
                оставалось почти два экрана пустоты. Приклеиваем её под шапку — блок записи
                остаётся на виду, пока посетитель читает прайс, работы и отзывы. */}
            <aside className="order-1 min-w-0 space-y-4 lg:sticky lg:top-[108px] lg:order-2 lg:self-start">
              <h2 className="text-[26px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{tenant.sectionTitles?.booking ?? 'Запись'}</h2>

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
            <div className="flex items-center gap-3">
              <SocialLinks socials={tenant.socials} />
              <a href={`tel:${tenant.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 text-caption text-brand-text-muted transition-colors hover:text-brand-text">
                Связаться <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </footer>
      </main>

      <nav className="bottom-nav safe-area-bottom" aria-label="Основная навигация">
        <div className="bottom-nav__inner">
          <a href="#top" aria-label="Главная" aria-current="page" className="bottom-nav__item press is-active">
            <House size={20} weight="bold" />
            <span>Главная</span>
          </a>
          <button type="button" onClick={() => openBooking()} aria-label="Услуги" className="bottom-nav__item press border-0 bg-transparent">
            <Glyph icon={tenant.glyph} size={20} weight="bold" />
            <span>Услуги</span>
          </button>
          <a href={`/${prefix}/${slug}/booking/my/none`} onClick={(event) => { event.preventDefault(); openMyBooking(); }} aria-label="Моя запись" className="bottom-nav__item press">
            <CalendarCheck size={20} weight="bold" />
            <span>Моя запись</span>
          </a>
        </div>
      </nav>

      {demoNotice && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-modal -translate-x-1/2 rounded-full border border-brand-border bg-brand-surface px-4 py-2 text-[13px] text-brand-text shadow-lg md:bottom-8"
        >
          Это демонстрация шаблона — запись здесь не создаётся.
        </div>
      )}

      {bookingOpen && (
        <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center" role="presentation">
          <div className="sheet-backdrop" onClick={busy ? undefined : closeBooking} aria-hidden="true" />
          <div
            ref={sheetTrap.ref}
            onKeyDown={sheetTrap.onKeyDown}
            role="dialog"
            aria-modal="true"
            aria-label={`Запись — ${tenant.name}`}
            tabIndex={-1}
            className="sheet animate-scale-in"
          >
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
