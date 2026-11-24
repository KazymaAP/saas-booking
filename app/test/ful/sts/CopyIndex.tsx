'use client';
// app/test/ful/sts/CopyIndex.tsx — оглавление копий: кнопки на каждую страницу сайта.
// Классы короткие (cx-*), стили лежат рядом в page.tsx: иначе повторяющийся Tailwind
// раздувал HTML до 757 КБ, и страницу было тяжело читать и людям, и агентам.
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

export function CopyIndex({ prefix, publicPages, superadminPages, cabinetSections, roles, services }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q));
  }, [query, services]);

  return (
    <div className="cx">
      <div aria-hidden className="cx-glow">
        <div className="cx-g1" />
        <div className="cx-g2" />
      </div>

      <div className="cx-wrap">
        <header>
          <span className="cx-badge">Временный раздел · доступ без входа</span>
          <h1 className="cx-h1">Копии всех страниц сайта</h1>
          <p className="cx-lead">
            Каждая кнопка открывает полноценную копию страницы: тот же вид, те же данные, те же действия.
            Адрес остаётся внутри <code className="cx-code">{prefix}</code>, на оригинал вас не перекинет.
          </p>
          <p className="cx-warn">
            Копии работают с настоящей базой: изменения сохраняются по-настоящему. Раздел открыт всем,
            у кого есть ссылка — не оставляйте его включённым надолго.
          </p>
        </header>

        <nav className="cx-nav">
          <a className="cx-btn" href="#public">Публичные страницы</a>
          <a className="cx-btn" href="#superadmin">Супер-админка</a>
          <a className="cx-btn" href="#services">Сервисы · {services.length}</a>
        </nav>

        <div id="public" className="cx-sec">
          <h2 className="cx-h2">Публичные страницы</h2>
          <span className="cx-hint">{publicPages.length} страниц</span>
        </div>
        <div className="cx-grid">
          {publicPages.map((p) => (
            <a key={p.path} className="cx-btn" href={`${prefix}${p.path}`}>{p.label}</a>
          ))}
        </div>

        <div id="superadmin" className="cx-sec">
          <h2 className="cx-h2">Супер-админка</h2>
          <span className="cx-hint">{superadminPages.length} страниц</span>
        </div>
        <div className="cx-grid">
          {superadminPages.map((p) => (
            <a key={p.path} className="cx-btn" href={`${prefix}${p.path}`}>{p.label}</a>
          ))}
        </div>

        <div id="services" className="cx-sec">
          <h2 className="cx-h2">Сервисы</h2>
          <span className="cx-hint">{services.length} сайтов · у каждого сайт, кабинет, клиентский кабинет и 13 смен</span>
        </div>
        <div className="cx-search-wrap">
          <input
            className="cx-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию или адресу сервиса…"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="cx-empty">Ничего не нашлось по «{query}».</p>
        ) : (
          <div className="cx-cards">
            {filtered.map((s) => {
              const base = `/${s.prefix}/${s.slug}`;
              return (
                <div key={s.slug} className="cx-card">
                  <div className="cx-head">
                    <div className="cx-headText">
                      <p className="cx-name">{s.name}</p>
                      <p className="cx-path">{base}</p>
                    </div>
                    {/* Бейдж только для неопубликованных: в списке сейчас лишь status='client',
                        и «client» на каждой карточке — шум без информации. */}
                    {s.status !== 'client' && <span className="cx-status">{s.status}</span>}
                  </div>
                  <div className="cx-row">
                    <a className="cx-btn cx-btn-p" href={`${prefix}${base}`}>Сайт</a>
                    <a className="cx-btn cx-btn-p" href={`${prefix}${base}/admin`}>Кабинет</a>
                    <a className="cx-btn" href={`${prefix}${base}/my`}>Клиент</a>
                  </div>
                  <details className="cx-details">
                    <summary className="cx-summary">
                      Все страницы сервиса ({cabinetSections.length + roles.length + 2})
                    </summary>
                    <div className="cx-groups">
                      <div>
                        <p className="cx-gt">Кабинет</p>
                        <div className="cx-chips">
                          {cabinetSections.map((c) => (
                            <a key={c.path} className="cx-chip" href={`${prefix}${base}/admin/${c.path}`}>{c.label}</a>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="cx-gt">Смены сотрудников</p>
                        <div className="cx-chips">
                          {roles.map((r) => (
                            <a key={r.role} className="cx-chip" href={`${prefix}${base}/${r.role}`}>{r.label}</a>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="cx-gt">Клиент</p>
                        <div className="cx-chips">
                          <a className="cx-chip" href={`${prefix}${base}/my`}>Мои записи</a>
                          <a className="cx-chip" href={`${prefix}${base}/my/login`}>Вход клиента</a>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        <footer className="cx-foot">
          Раздел временный. Удаляется в три шага: блок COPY_PREFIX в middleware.ts, папка app/test/ful,
          файлы общие/lib/copy-mode*.ts — и строка CopyLinks в app/layout.tsx.
        </footer>
      </div>
    </div>
  );
}
