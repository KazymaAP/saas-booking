// (protected)/not-found.tsx — раздел не найден или недоступен для роли (ТЗ §19.5).
import Link from 'next/link';

export default function PanelNotFound() {
  return (
    <section className="grid max-w-[560px] gap-3">
      <h1>Страница не найдена</h1>
      <p className="text-[14px] text-[#595959]">Раздела нет или он доступен только владельцу.</p>
      <Link href="." className="btn-primary w-fit !no-underline">На главную кабинета</Link>
    </section>
  );
}
