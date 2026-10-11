// components/templates/StudioTemplate.tsx — шаблон сайта, повторяет разметку и классы rabota (см. SGX_Detailing.html):
// src/pages/Home.tsx, Services.tsx, ServiceRow.tsx, TopBar.tsx, BottomNav.tsx. Стили — public/assets/studio.css.
import { Armchair, CalendarCheck, CaretRight, Clock, Drop, DeviceMobile, Garage, House, MapPin, NavigationArrow, Phone, ArrowRight, ArrowUpRight, ShieldCheck, Sparkle, Tag, UserCircle, Wrench } from '@phosphor-icons/react/dist/ssr';
import type { Business, Service, WorkingHours } from '@/lib/database.types';
import { OceanBackdrop } from '@/components/OceanBackdrop';
import { MapBlock } from '@/components/MapBlock';

export type TemplatePhoto = { url: string | null; alt: string | null };

const DAY_NAMES: Record<string, string> = { mon: 'пн', tue: 'вт', wed: 'ср', thu: 'чт', fri: 'пт', sat: 'сб', sun: 'вс' };

// Тексты по умолчанию — из эталона rabota (business.json, cards). Переопределяются в кабинете (custom_texts).
const DEFAULTS = {
  demo_banner: 'Образец студии — данные демонстрационные',
  booking_title: 'Свежий вид для вашего авто',
  booking_text: 'Выберите услугу и удобное время — остальное возьмём на себя',
  install_title: 'Студия всегда под рукой.',
  install_text: 'Записывайтесь за несколько касаний, без поиска ссылки и звонков.',
};

function iconFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('мойк')) return Drop;
  if (n.includes('салон') || n.includes('химчист')) return Armchair;
  if (n.includes('полиров')) return Sparkle;
  if (n.includes('керамик') || n.includes('покрыт')) return ShieldCheck;
  return Wrench;
}

function money(value: number, priceFrom = false): string {
  return `${priceFrom ? 'от ' : ''}${Number(value).toLocaleString('ru-RU')} ₽`.replace(/\s/g, '\u00a0');
}

// Как в эталоне: «2 ч», «1 д», «1 ч 30 мин».
function duration(min: number): string {
  if (min >= 1440) return `${Math.round(min / 1440)} д`;
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function hoursRange(hours: WorkingHours | null): string | null {
  if (!hours) return null;
  const all = Object.values(hours).flatMap((iv) => iv ?? []);
  if (!all.length) return null;
  const opens = all.map((i) => i.open).sort();
  const closes = all.map((i) => i.close).sort();
  return `${opens[0]}–${closes[closes.length - 1]}`;
}

function hoursLines(hours: WorkingHours | null): string {
  if (!hours) return '';
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
  return order
    .filter((d) => hours[d]?.length)
    .map((d) => `${DAY_NAMES[d]} ${hours[d]!.map((i) => `${i.open}–${i.close}`).join(', ')}`)
    .join(' · ');
}

export function StudioTemplate({
  business,
  services,
  photos,
  title,
  subtitle,
  about,
  texts = {},
  bookingForm,
  preview,
}: {
  business: Pick<Business, 'name' | 'address' | 'city' | 'phones' | 'rating' | 'reviews_count' | 'logo_url' | 'brand_color' | 'working_hours' | 'lat' | 'lng' | 'socials' | 'websites'>;
  services: Pick<Service, 'id' | 'name' | 'price' | 'duration_minutes'>[];
  photos: TemplatePhoto[];
  title: string;
  subtitle?: string;
  about?: string;
  texts?: Record<string, string>;
  bookingForm?: React.ReactNode;
  preview?: boolean;
}) {
  const t = { ...DEFAULTS, ...Object.fromEntries(Object.entries(texts).filter(([, v]) => v)) } as typeof DEFAULTS;
  const withPhoto = photos.filter((p) => p.url);
  const hero = withPhoto[0]?.url ?? null;
  const minPrice = services.length ? Math.min(...services.map((s) => Number(s.price))) : null;
  const phone = business.phones?.[0] ?? null;
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
  const hours = business.working_hours as WorkingHours | null;
  const range = hoursRange(hours);
  const mapHref = business.address
    ? `https://yandex.ru/maps/?text=${encodeURIComponent([business.city, business.address].filter(Boolean).join(', '))}`
    : null;
  const name = business.name;
  const short = name.split(/\s+/)[0] || name; // как «SGX» из «SGX Detailing»

  return (
    <div style={{ ['--accent' as string]: business.brand_color, minHeight: '100dvh', background: '#000', color: '#fff' } as React.CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/assets/studio.css" />

      <div className="app-frame">
        <header className="topbar">
          <a className="wordmark" href="#top">
            {business.logo_url && <img className="brand-logo" alt={`Логотип ${short}`} src={business.logo_url} />}
            {short}
          </a>
          <span className="icon-btn" aria-label="Мой профиль">
            <UserCircle size={28} weight="regular" aria-hidden />
          </span>
        </header>

        {preview && <div className="demo-banner">{t.demo_banner}</div>}

        <main className="page-content" id="top">
          <section className="studio-top">
            <div className="hero-photo">
              {hero ? (
                <img src={hero} alt={name} fetchPriority="high" draggable={false} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${business.brand_color}, #1b1b1b)` }} />
              )}
              <a className="photo-label" href="#book">
                <span className="photo-label-glass" aria-hidden data-liquidgl-fallback="" />
                <span className="photo-label-content">
                  <span>Записаться</span>
                  <ArrowUpRight size={18} weight="bold" aria-hidden />
                </span>
              </a>
            </div>
            <div className="studio-heading">
              <div>
                <h1 className="t-h1">{title}</h1>
                {subtitle && <span className="t-body muted">{subtitle}</span>}
              </div>
              <span className="brand-mark" aria-hidden>
                <ArrowUpRight size={28} weight="bold" />
              </span>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-value">
                  <Wrench size={18} aria-hidden />
                  {services.length}
                </span>
                <span className="t-sub">услуг в прайсе</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-value">
                  <Garage size={18} aria-hidden />
                  {business.rating ? Number(business.rating).toFixed(1) : '—'}
                </span>
                <span className="t-sub">{business.reviews_count ? `${business.reviews_count} отзывов` : 'рейтинг'}</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-value">
                  <Tag size={18} aria-hidden />
                  {minPrice !== null ? money(minPrice, true) : '—'}
                </span>
                <span className="t-sub">за услугу</span>
              </div>
            </div>
          </section>

          <div className="home-columns">
            <div className="main-column">
              <section id="services">
                <div className="section-head">
                  <h2 className="t-h2">Услуги</h2>
                  <a className="text-link" href="#services">
                    Все услуги <ArrowRight size={17} aria-hidden />
                  </a>
                </div>
                <div className="service-list">
                  {services.map((s) => {
                    const Icon = iconFor(s.name);
                    return (
                      <a key={s.id} className="service-row" href="#book">
                        <span className="service-icon">
                          <Icon size={24} weight="regular" aria-hidden />
                        </span>
                        <span className="service-copy">
                          <span className="t-body">{s.name}</span>
                          <span className="t-sub">{duration(s.duration_minutes)}</span>
                        </span>
                        <span className="service-price">
                          <span className="t-body">{money(s.price)}</span>
                          <span className="t-sub accent">Выбрать</span>
                        </span>
                        <CaretRight size={18} aria-hidden className="chev" />
                      </a>
                    );
                  })}
                </div>
              </section>

              {withPhoto.length > 1 && (
                <section>
                  <h2 className="t-h2">Работы студии</h2>
                  <div className="portfolio">
                    {withPhoto.slice(1, 7).map((p, i) => (
                      <figure key={i}>
                        <div className="portfolio-photo">
                          <img src={p.url!} alt={p.alt ?? 'Фото работы'} loading="lazy" />
                        </div>
                        {p.alt && <figcaption className="t-sub">{p.alt}</figcaption>}
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              {about && (
                <section>
                  <h2 className="t-h2">О нас</h2>
                  <p className="t-body muted" style={{ whiteSpace: 'pre-line' }}>{about}</p>
                </section>
              )}

              <section id="book">
                <h2 className="t-h2">Записаться</h2>
                <div className="card" style={{ marginTop: 12 }}>
                  {bookingForm ?? <span className="t-sub">Запись доступна на сайте после подключения. В демо запись отключена.</span>}
                </div>
              </section>
            </div>

            <div className="side-column">
              <div className="stack">
                <div className="card feature booking-card">
                  <OceanBackdrop accent={business.brand_color} />
                  <CalendarCheck size={28} className="accent" aria-hidden />
                  <div>
                    <h3 className="t-h3">{t.booking_title}</h3>
                    <span className="t-sub">{t.booking_text}</span>
                  </div>
                  <a className="btn primary" href="#book">
                    Выбрать время <ArrowRight size={18} aria-hidden />
                  </a>
                </div>
                <div className="card info">
                  {business.address && (
                    <div className="row">
                      <MapPin size={22} aria-hidden />
                      <span>{business.city ? `${business.city}, ` : ''}{business.address}</span>
                    </div>
                  )}
                  {range && (
                    <div className="row">
                      <Clock size={22} aria-hidden />
                      <div className="col">
                        <span>{range}</span>
                        <span className="t-sub">{hoursLines(hours)}</span>
                      </div>
                    </div>
                  )}
                  <div className="row contacts">
                  {business.socials?.whatsapp && <a className="btn" href={business.socials.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>}
                  {business.socials?.telegram && <a className="btn" href={business.socials.telegram} target="_blank" rel="noreferrer">Telegram</a>}
                  {business.websites?.[0] && <a className="btn" href={`https://${business.websites[0]}`} target="_blank" rel="noreferrer">Сайт</a>}
                </div>
                <div className="row actions">
                    {mapHref && (
                      <a className="btn" href={mapHref} target="_blank" rel="noreferrer">
                        Маршрут <NavigationArrow size={18} aria-hidden />
                      </a>
                    )}
                    {telHref && (
                      <a className="btn icon" href={telHref} aria-label={`Позвонить: ${phone}`}>
                        <Phone size={20} aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {business.lat && business.lng && (
            <section>
              <h2 className="t-h2">Как добраться</h2>
              <div style={{ marginTop: 12 }}>
                <MapBlock lat={Number(business.lat)} lng={Number(business.lng)} title={name} />
              </div>
            </section>
          )}

          <div className="card install-card">
            <div className="row">
              {business.logo_url && <img className="brand-logo big" src={business.logo_url} alt={`Логотип ${short}`} />}
              <div className="col">
                <span className="t-body strong">{short}</span>
                <span className="t-sub">Приложение студии</span>
              </div>
            </div>
            <h2 className="t-h2" style={{ margin: 0 }}>{t.install_title}</h2>
            <span className="t-body muted">{t.install_text}</span>
            <span className="btn primary">
              <DeviceMobile size={20} aria-hidden />
              Добавить на экран
              <ArrowRight size={18} aria-hidden />
            </span>
            <span className="t-sub">Бесплатно. Установка через браузер.</span>
          </div>

          <footer className="site-footer">
            <span className="strong">{short}</span>
            {telHref && (
              <a className="text-link" href={telHref}>
                Связаться <ArrowRight size={16} aria-hidden />
              </a>
            )}
          </footer>
        </main>

        <nav className="nav glass" aria-label="Основная навигация">
          <a className="nav-item active" href="#top">
            <House size={22} weight="duotone" aria-hidden />
            <span>Главная</span>
          </a>
          <a className="nav-item" href="#services">
            <Wrench size={22} weight="duotone" aria-hidden />
            <span>Услуги</span>
          </a>
          <a className="nav-item" href="#book">
            <CalendarCheck size={22} weight="duotone" aria-hidden />
            <span>Моя запись</span>
          </a>
        </nav>
      </div>
    </div>
  );
}
