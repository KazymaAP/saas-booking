// app/[prefix]/[slug]/booking/loading.tsx — тёмный экран ожидания для всех страниц записи.
// Без него App Router на время загрузки server component показывает белый фон.
export default function BookingLoading() {
  return <div style={{ minHeight: '100vh', background: '#000000' }} aria-hidden="true" />;
}
