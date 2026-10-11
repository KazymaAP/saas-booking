// components/Hero.tsx — hero-блок сайта (ТЗ §5.1): логотип, название, адрес, телефон, рейтинг, кнопка записи.
// Используется в превью и на публичном сайте, чтобы оба выглядели одинаково.
import type { Business } from '@/lib/database.types';

export function Hero({ business, title, subtitle, cta = 'Записаться', ctaHref = '#book' }: {
  business: Pick<Business, 'name' | 'address' | 'city' | 'phones' | 'rating' | 'reviews_count' | 'logo_url' | 'brand_color'>;
  title?: string;
  subtitle?: string;
  cta?: string;
  ctaHref?: string;
}) {
  const phone = business.phones?.[0];
  return (
    <section className="grid gap-6 border-b border-[#e5e5e5] pb-8 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex items-start gap-4">
        {business.logo_url && (
          <img src={business.logo_url} alt={`Логотип ${business.name}`} width={72} height={72} className="h-[72px] w-[72px] shrink-0 rounded-2xl" />
        )}
        <div>
          <h1 className="text-[32px] font-bold leading-tight md:text-[48px]">{title || business.name}</h1>
          {subtitle && <p className="mt-2 text-[#666666]">{subtitle}</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-[#666666]">
            {business.address && <span>{business.city ? `${business.city}, ` : ''}{business.address}</span>}
            {business.rating ? (
              <span>★ {Number(business.rating).toFixed(1)}{business.reviews_count ? ` · ${business.reviews_count} отзывов` : ''}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 md:items-end">
        <a href={ctaHref} className="btn-primary px-6 text-[16px]">{cta}</a>
        {phone && <a href={`tel:${phone}`} className="text-[15px] underline">{phone}</a>}
      </div>
    </section>
  );
}
