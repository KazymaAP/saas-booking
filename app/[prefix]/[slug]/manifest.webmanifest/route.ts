// app/[prefix]/[slug]/manifest.webmanifest/route.ts — PWA-манифест каждого сайта (ТЗ §5.1, §9).
// Иконка — SVG с инициалами и brand_color (logo_url уже генерируется в lib/generate.ts).
import { adminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { prefix: string; slug: string } }) {
  const { data: b } = await adminClient()
    .from('businesses').select('name, brand_color, logo_url').eq('slug', params.slug).eq('status', 'client').maybeSingle();
  if (!b) return new Response('Not found', { status: 404 });

  const manifest = {
    name: b.name,
    short_name: b.name.slice(0, 12),
    start_url: `/${params.prefix}/${params.slug}`,
    scope: `/${params.prefix}/${params.slug}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: b.brand_color,
    lang: 'ru',
    icons: [{ src: b.logo_url ?? '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
}
