// app/_legal/LegalDocument.tsx — общий каркас юридических документов (/oferta, /privacy, /dogovor-porucheniya):
// заголовок, версия и дата, оглавление, разделы, блок реквизитов, ссылки на связанные документы.
// Server Component: без состояния и клиентского JS. Лежит в app/_legal (приватная папка, не маршрут), потому что
// tailwind.config сканирует только app/** и lib/** — в components/** Tailwind-классы не генерируются.
import Link from 'next/link';
import { CookieSettingsButton } from '@/components/CookieSettingsButton';
import type { ReactNode } from 'react';
import { LEGAL_DOCS, formatLegalDate, formatRequisites, type LegalDocKey, type Requisites } from '@/lib/legal';

export type LegalSection = { id: string; title: string; body: ReactNode };

type Props = {
  doc: LegalDocKey;
  lead: ReactNode;
  sections: LegalSection[];
  requisites: Requisites;
  // Текст, введённый владельцем в /panel/settings: показывается отдельным разделом как простой текст (без HTML).
  extra_text?: string | null;
};

export function LegalDocument({ doc, lead, sections, requisites, extra_text }: Props) {
  const meta = LEGAL_DOCS[doc];
  const related = Object.values(LEGAL_DOCS).filter((d) => d.key !== doc);
  const all_sections: LegalSection[] = [
    ...sections,
    ...(extra_text ? [{ id: 'extra', title: 'Дополнительные условия', body: <ExtraText text={extra_text} /> }] : []),
    { id: 'requisites', title: 'Реквизиты', body: <RequisitesBlock requisites={requisites} /> },
  ];

  return (
    <main id="main-content" className="legal-doc mx-auto max-w-[800px] px-4 py-8 md:px-8">
      <article aria-labelledby="legal-title">
        <header>
          <p className="text-[14px]"><Link href="/" className="underline">На главную</Link></p>
          <h1 id="legal-title" className="mt-4 text-[28px] font-bold leading-tight md:text-[32px]">{meta.title}</h1>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px] text-[#595959]">
            <dt>Редакция</dt>
            <dd><time dateTime={meta.version}>{meta.version}</time></dd>
            <dt>Действует с</dt>
            <dd><time dateTime={meta.effective_from}>{formatLegalDate(meta.effective_from)}</time></dd>
          </dl>
          {!requisites.is_complete && (
            <p role="note" className="mt-4 rounded-md border border-[#e5e5e5] bg-[#f6f6f6] p-3 text-[14px]">
              Реквизиты исполнителя заполняются. До их публикации по всем вопросам пишите на адрес,
              указанный в разделе «Реквизиты».
            </p>
          )}
          <div className="mt-4 grid gap-3 leading-relaxed">{lead}</div>
        </header>

        <nav aria-label="Содержание документа" className="mt-6 rounded-md border border-[#e5e5e5] p-4">
          <h2 className="text-[16px] font-semibold">Содержание</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-[15px]">
            {all_sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="underline">{s.title}</a></li>
            ))}
          </ol>
        </nav>

        {all_sections.map((s, index) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="mt-8 scroll-mt-4">
            <h2 id={`${s.id}-title`} className="text-[22px] font-semibold md:text-[24px]">{index + 1}. {s.title}</h2>
            <div className="mt-3 grid gap-3 leading-relaxed">{s.body}</div>
          </section>
        ))}

        <footer className="mt-10 border-t border-[#e5e5e5] pt-4 text-[14px]">
          <h2 className="font-semibold">Связанные документы</h2>
          <ul className="mt-2 grid gap-1">
            {related.map((d) => (
              <li key={d.key}><Link href={d.path} className="underline">{d.title}</Link> (редакция {d.version})</li>
            ))}
            <li><Link href="/data-request" className="underline">Запрос субъекта персональных данных</Link></li>
          </ul>
          <p className="mt-3"><CookieSettingsButton className="min-h-[44px] underline" /></p>
        </footer>
      </article>
    </main>
  );
}

// Текст из настроек — недоверенный ввод: только текстовые узлы, абзацы по пустой строке. React экранирует HTML.
function ExtraText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <>
      {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
    </>
  );
}

export function RequisitesBlock({ requisites }: { requisites: Requisites }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[220px_1fr]">
      {formatRequisites(requisites).map((line) => (
        <div key={line.label} className="contents">
          <dt className="text-[#595959]">{line.label}</dt>
          <dd className={line.missing ? 'italic text-[#595959]' : undefined}>
            {line.label === 'Email' && !line.missing ? <a href={`mailto:${line.value}`} className="underline">{line.value}</a> : line.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Нумерованный список пунктов документа. Ключ — индекс: список статичен.
export function Clauses({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid list-decimal gap-2 pl-6">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ol>
  );
}
