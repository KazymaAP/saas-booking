'use client';
// app/test/ful/sts/CopyIndex.tsx — оглавление копий: кнопки на каждую страницу сайта.
// Всё статично, кроме фильтра по сервисам: 99 карточек вручную не найти.
import { useMemo, useState } from 'react';

type Link = { readonly path: string; readonly label: string };
type Service = { readonly slug: string; readonly name: string; readonly status: string; readonly prefix: string };
type RoleLink = { readonly role: string; readonly label: string };

type Props = {
  readonly prefix: string;
  readonly publicPages: readonly Link[];
  readonly superadminPages: readonly Link[];
  readonly cabinetSections: readonly Link[];
  readonly roles: readonly RoleLink[];
  readonly services: readonly Service[];
};

const CARD = 'rounded-2xl border border-white/10 bg-white/[0.04] p-4';
const BTN = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-[#e6edf7] transition-colors hover:border-[#38bdf8] hover:bg-[#38bdf8]/10 hover:text-white';
const BTN_PRIMARY = 'inline-flex items-center justify-center rounded-xl border border-[#38bdf8]/60 bg-[#38bdf8]/15 px-3 py-2 text-[13px] font-semibold text-[#bae6fd] transition-colors hover:bg-[#38bdf8]/25 hover:text-white';

function SectionTitle({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div id={id} className="mb-4 mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="m-0 text-xl font-semibold text-white">{title}</h2>
      {hint ? <span className="text-[13px] text-[#8aa0bb]">{hint}</span> : null}
    </div>
  );
}

export function CopyIndex({ prefix, publicPages, superadminPages, cabinetSections, roles, services }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q));
  }, [query, services]);

  return (
    <div className="min-h-screen bg-[#060f1a] text-[#e6edf7]">
      {/* Фон: два мягких пятна, чтобы страница не выглядела плоской. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#38bdf8]/10 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[460px] w-[460px] rounded-full bg-[#a78bfa]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
        <header className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/10 px-3 py-1 text-[12px] font-medium text-[#bae6fd]">
            Временный раздел · доступ без входа
          </span>
          <h1 className="mb-2 mt-4 text-3xl font-semibold text-white sm:text-4xl">Копии всех страниц сайта</h1>
          <p className="m-0 max-w-[720px] text-[15px] leading-relaxed text-[#a8bcd4]">
            Каждая кнопка открывает полноценную копию страницы: тот же вид, те же данные, те же действия.
            Адрес остаётся внутри <code className="rounded bg-white/10 px-1.5 py-0.5 text-[13px] text-[#bae6fd]">{prefix}</code>,
            на оригинал вас не перекинет.
          </p>
          <p className="m-0 mt-3 max-w-[720px] rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[13px] leading-relaxed text-amber-100">
            Копии работают с настоящей базой: изменения сохраняются по-настоящему. Раздел открыт всем,
            у кого есть ссылка — не оставляйте его включённым надолго.
          </p>
        </header>

        <nav className="flex flex-wrap gap-2">
          <a className={BTN} href="#public">Публичные страницы</a>
          <a className={BTN} href="#superadmin">Супер-админка</a>
          <a className={BTN} href="#services">Сервисы · {services.length}</a>
        </nav>

        <SectionTitle id="public" title="Публичные страницы" hint={`${publicPages.length} страниц`} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {publicPages.map((p) => (
            <a key={p.path} className={BTN} href={`${prefix}${p.path}`}>
              {p.label}
            </a>
          ))}
        </div>

        <SectionTitle id="superadmin" title="Супер-админка" hint={`${superadminPages.length} страниц`} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {superadminPages.map((p) => (
            <a key={p.path} className={BTN} href={`${prefix}${p.path}`}>
              {p.label}
            </a>
          ))}
        </div>

        <SectionTitle id="services" title="Сервисы" hint={`${services.length} сайтов · у каждого сайт, кабинет, клиентский кабинет и 13 смен`} />
        <div className="sticky top-0 z-10 -mx-1 mb-4 bg-[#060f1a]/85 px-1 py-2 backdrop-blur">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию или адресу сервиса…"
            className="w-full rounded-xl border border-white/15 bg-[#0b1725] px-4 py-2.5 text-[14px] text-white placeholder:text-[#6b7f96] focus:border-[#38bdf8] focus:outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-6 text-center text-[14px] text-[#8aa0bb]">
            Ничего не нашлось по «{query}».
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((s) => {
              const base = `/${s.prefix}/${s.slug}`;
              return (
                <div key={s.slug} className={CARD}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[15px] font-semibold text-white">{s.name}</p>
                      <p className="m-0 truncate text-[12px] text-[#7c93ad]">{base}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-[#8aa0bb]">
                      {s.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a className={BTN_PRIMARY} href={`${prefix}${base}`}>
                      Сайт
                    </a>
                    <a className={BTN_PRIMARY} href={`${prefix}${base}/admin`}>
                      Кабинет
                    </a>
                    <a className={BTN} href={`${prefix}${base}/my`}>
                      Клиент
                    </a>
                  </div>
                  <details className="group mt-3">
                    <summary className="cursor-pointer list-none text-[13px] font-medium text-[#7dd3fc] hover:text-white">
                      Все страницы сервиса ({cabinetSections.length + roles.length + 2})
                    </summary>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6b7f96]">Кабинет</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cabinetSections.map((c) => (
                            <a key={c.path} className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-[#c7d7e8] hover:border-[#38bdf8] hover:text-white" href={`${prefix}${base}/admin/${c.path}`}>
                              {c.label}
                            </a>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6b7f96]">Смены сотрудников</p>
                        <div className="flex flex-wrap gap-1.5">
                          {roles.map((r) => (
                            <a key={r.role} className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-[#c7d7e8] hover:border-[#38bdf8] hover:text-white" href={`${prefix}${base}/${r.role}`}>
                              {r.label}
                            </a>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6b7f96]">Клиент</p>
                        <div className="flex flex-wrap gap-1.5">
                          <a className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-[#c7d7e8] hover:border-[#38bdf8] hover:text-white" href={`${prefix}${base}/my`}>
                            Мои записи
                          </a>
                          <a className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-[#c7d7e8] hover:border-[#38bdf8] hover:text-white" href={`${prefix}${base}/my/login`}>
                            Вход клиента
                          </a>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        <footer className="mt-12 border-t border-white/10 pt-5 text-[12px] leading-relaxed text-[#6b7f96]">
          Раздел временный. Удаляется в три шага: блок COPY_PREFIX в middleware.ts, папка app/test/ful,
          файлы общие/lib/copy-mode*.ts — и строка CopyLinks в app/layout.tsx.
        </footer>
      </div>
    </div>
  );
}
