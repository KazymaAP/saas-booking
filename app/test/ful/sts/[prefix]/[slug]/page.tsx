// app/test/ful/sts/[prefix]/[slug]/page.tsx — копия витрины бизнеса внутри раздела /test/ful/sts.
//
// Зачем отдельный маршрут, а не rewrite на настоящую витрину (как у остальных копий):
// витрина пререндерится (generateStaticParams + revalidate=3600). Middleware-rewrite отдавал
// браузеру готовый HTML из кэша и одновременно RSC-поток, собранный заново; React не мог
// сопоставить деревья и падал в гидрации (Minified React error #418/#423, 4 исключения
// на каждой копии — проверено на /test/ful/sts/d/vippro и /test/ful/sts/d/2bro).
// Динамический маршрут рендерит HTML и RSC в одном проходе, поэтому гидрация совпадает.
// Настоящая витрина остаётся на ISR — её скорость не меняется.
//
// Копия — только чтение: ссылки внутри неё удерживает CopyLinks (см. app/test/ful/sts/CopyLinks.tsx).
import BusinessPage, { generateMetadata, generateViewport } from '../../../../../[prefix]/[slug]/page';

// Копию не кэшируем: она нужна ровно для чтения и правок «на лету».
export const dynamic = 'force-dynamic';

export { generateMetadata, generateViewport };

export default async function CopyStorefront({ params }: { params: { prefix: string; slug: string } }) {
  return BusinessPage({ params });
}
