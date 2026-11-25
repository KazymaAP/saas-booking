// app/test/ful/sts/GERA/page.tsx — копия GERA внутри раздела /test/ful/sts.
//
// Та же причина, что у копии витрины: GERA — статическая страница с клиентской таблицей,
// и rewrite на неё давал расхождение гидрации (4 исключения). Здесь страница рендерится
// динамически, поэтому HTML и RSC-поток совпадают.
import GeraPage, { metadata } from '../../../../GERA/page';

export const dynamic = 'force-dynamic';

export { metadata };

export default function CopyGera() {
  return GeraPage();
}
