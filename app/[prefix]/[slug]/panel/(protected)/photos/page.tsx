// app/[prefix]/[slug]/panel/(protected)/photos/page.tsx — загрузка и удаление фото (ТЗ §5.3, §45).
import { adminClient } from '@/lib/supabase';
import { currentOwner } from '@/lib/owner-session';
import { uploadPhoto, deletePhoto } from './actions';
import { PhotoUploader } from './PhotoUploader';

export const dynamic = 'force-dynamic';

export default async function PhotosPage({ params }: { params: { prefix: string; slug: string } }) {
  const access = (await currentOwner(params.slug))!;
  const { data } = await adminClient()
    .from('photos').select('id, url, alt').eq('business_id', access.business.id).order('sort_order');
  const { prefix, slug } = params;

  return (
    <div className="grid gap-6">
      <h1 className="text-[24px] font-semibold">Фото работ</h1>
      <p className="text-[14px] text-[#666666]">JPG, PNG или WebP. Большие файлы сжимаются в браузере до 2 МБ, но не больше 5 МБ.</p>

      <PhotoUploader action={uploadPhoto.bind(null, prefix, slug)} />

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {(data ?? []).map((p) => (
          <li key={p.id} className="grid gap-2">
            {p.url && <img src={p.url} alt={p.alt ?? ''} className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" />}
            <form action={deletePhoto.bind(null, prefix, slug)}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="text-[14px] underline">Удалить</button>
            </form>
          </li>
        ))}
        {(data ?? []).length === 0 && <li className="text-[14px] text-[#666666]">Фото пока нет.</li>}
      </ul>
    </div>
  );
}
