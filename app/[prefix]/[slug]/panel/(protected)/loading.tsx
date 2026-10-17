// (protected)/loading.tsx — скелетон при переходе между разделами (ТЗ §13.12).
// Link префетчит его заранее, поэтому он появляется сразу после клика (с задержкой показа 300 мс — см. SkeletonFrame).
import { SkeletonBlock, SkeletonFrame } from './_components/Skeleton';

export default function PanelLoading() {
  return (
    <SkeletonFrame>
      <SkeletonBlock className="h-8 w-48 !rounded-md !bg-[#ececec]" />
      <div className="grid gap-3 md:grid-cols-2">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
      <SkeletonBlock className="h-16" />
      <SkeletonBlock className="h-16" />
    </SkeletonFrame>
  );
}
