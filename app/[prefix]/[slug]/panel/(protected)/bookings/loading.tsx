// bookings/loading.tsx — скелетон списка броней: та же форма, что у готовой страницы (заголовок + фильтр,
// день, карточки на телефоне / строки таблицы на десктопе) — при подгрузке ничего не прыгает.
// Брони — самый частый раздел: общий скелетон (карточки дашборда) здесь выглядел бы как другая страница.
import { SkeletonBlock, SkeletonFrame } from '../_components/Skeleton';

const ROWS = [0, 1, 2, 3, 4];

export default function BookingsLoading() {
  return (
    <SkeletonFrame label="Загружаем брони…">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SkeletonBlock className="h-8 w-32 !rounded-md !bg-[#ececec]" />
        <SkeletonBlock className="h-11 w-64 !rounded-lg md:h-9" />
      </div>
      <SkeletonBlock className="h-5 w-40 !rounded-md" />
      <div className="grid gap-3 md:hidden">
        {ROWS.slice(0, 3).map((i) => <SkeletonBlock key={i} className="h-36" />)}
      </div>
      <div className="hidden gap-2 md:grid">
        {ROWS.map((i) => <SkeletonBlock key={i} className="h-14 !rounded-md" />)}
      </div>
    </SkeletonFrame>
  );
}
