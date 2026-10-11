// app/blocked/page.tsx — заглушка: лицензия заблокирована или срок поддержки истёк (ТЗ §3.1, §5.8, §5.9).
export const metadata = { robots: { index: false, follow: false } };

export default function Blocked() {
  return (
    <main className="mx-auto max-w-[520px] px-4 py-16">
      <h1 className="text-[24px] font-semibold">Сайт временно недоступен</h1>
      <p className="mt-3 text-[#666666]">Чтобы восстановить работу, свяжитесь с владельцем сервиса.</p>
    </main>
  );
}
