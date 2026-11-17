'use client';
// app/GERA/GeraTable.tsx — внутренняя таблица всех организаций из Excel:
// сортировка, поиск, копирование сообщений и отдельные кнопки связи по каждому контакту.
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowsDownUp, Check, Copy, Globe, MagnifyingGlass,
  MapPin, Phone, TelegramLogo, WhatsappLogo,
} from '@phosphor-icons/react';

type Service = { name: string; price: number };

type GeraRow = {
  id: number;
  name: string;
  sphere: string;
  city: string;
  address: string;
  phones: string[];
  telegram: string;
  max: string;
  vk: string;
  whatsapp: string;
  map: string;
  rating: number | null;
  reviews: number | null;
  services: Service[];
  siteUrl: string | null;
  exampleUrl: string;
};

type Payload = {
  generatedAt: string;
  source: string;
  templateUrl: string;
  total: number;
  withSite: number;
  rows: GeraRow[];
};

type SortKey = 'id' | 'name' | 'city' | 'rating' | 'reviews' | 'services' | 'status';

type OutreachStatus = 'new' | 'progress' | 'sent';

const STATUS_OPTIONS: ReadonlyArray<{ value: OutreachStatus; label: string; active: string; order: number }> = [
  { value: 'new', label: 'Не взят', active: 'bg-white/15 text-white', order: 0 },
  { value: 'progress', label: 'В процессе', active: 'bg-amber-400/20 text-amber-200', order: 1 },
  { value: 'sent', label: 'Отправил', active: 'bg-emerald-400/20 text-emerald-200', order: 2 },
];

const STATUS_KEY = 'gera:statuses:v1';

const PAGE_SIZES = [25, 50, 100] as const;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return value;
}

function telHref(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, '')}`;
}

function messageFor(row: GeraRow, templateUrl: string): string {
  if (row.siteUrl) {
    return [
      `Здравствуйте! Мы сделали для «${row.name}» сайт с онлайн-записью: ${row.siteUrl}`,
      '',
      'Посмотрите, пожалуйста. Если понравится — можем доработать под вас: услуги, фото, цены и запись уже внутри.',
    ].join('\n');
  }
  return [
    'Здравствуйте! Мы делаем сайты с онлайн-записью для детейлинг-студий.',
    `Пример шаблона: ${templateUrl}`,
    '',
    `Можем сделать такой же сайт для «${row.name}»${row.city ? ` (${row.city})` : ''}. Посмотрите, пожалуйста.`,
  ].join('\n');
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

const TONES: Record<string, string> = {
  phone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20',
  telegram: 'border-sky-400/25 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20',
  max: 'border-violet-400/25 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20',
  whatsapp: 'border-green-400/25 bg-green-400/10 text-green-200 hover:bg-green-400/20',
  vk: 'border-blue-400/25 bg-blue-400/10 text-blue-200 hover:bg-blue-400/20',
  map: 'border-amber-400/25 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20',
  site: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200 hover:bg-fuchsia-400/20',
  email: 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10',
};

function ContactLink({
  href, label, tone, icon, title,
}: {
  href: string;
  label: string;
  tone: keyof typeof TONES;
  icon?: React.ReactNode;
  title?: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith('tel:') ? undefined : '_blank'}
      rel={href.startsWith('tel:') ? undefined : 'noopener noreferrer'}
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${TONES[tone]}`}
    >
      {icon}
      {label}
    </a>
  );
}

function SortHeader({
  label, active, dir, onClick, className,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 border-0 bg-transparent p-0 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors ${active ? 'text-white' : 'text-white/45 hover:text-white/80'} ${className ?? ''}`}
    >
      {label}
      <ArrowsDownUp size={12} weight="bold" className={active ? 'opacity-100' : 'opacity-40'} />
      {active && <span className="sr-only">{dir === 'asc' ? 'по возрастанию' : 'по убыванию'}</span>}
    </button>
  );
}

export function GeraTable() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [copied, setCopied] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Record<number, OutreachStatus>>({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | OutreachStatus>('all');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;
    fetch('/gera-data.json')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Payload>;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить базу. Обновите страницу.');
      });
    return () => { cancelled = true; };
  }, []);

  // Статусы обзвона храним в браузере: переживают перезагрузку и не требуют записи в БД.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STATUS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, OutreachStatus>;
        const next: Record<number, OutreachStatus> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (value === 'new' || value === 'progress' || value === 'sent') next[Number(key)] = value;
        }
        setStatuses(next);
      }
    } catch {
      // Приватный режим или повреждённое значение — начинаем с пустых статусов.
    }
    setStatusesLoaded(true);
  }, []);

  useEffect(() => {
    if (!statusesLoaded) return;
    try {
      window.localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
    } catch {
      // Если localStorage запрещён, статусы останутся в памяти на время сессии.
    }
  }, [statuses, statusesLoaded]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, pageSize, sortKey, sortDir, statusFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = deferredQuery.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return data.rows.filter((row) => {
      const status = statuses[row.id] ?? 'new';
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        row.name, row.sphere, row.city, row.address,
        ...row.phones, ...row.services.map((service) => service.name),
      ].join(' ').toLowerCase();
      if (haystack.includes(needle)) return true;
      return digits.length >= 3 && row.phones.some((phone) => phone.replace(/\D/g, '').includes(digits));
    });
  }, [data, deferredQuery, statusFilter, statuses]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name, 'ru') * dir;
        case 'city': return a.city.localeCompare(b.city, 'ru') * dir;
        case 'rating': {
          if (a.rating === null && b.rating === null) return 0;
          if (a.rating === null) return 1;
          if (b.rating === null) return -1;
          return (a.rating - b.rating) * dir;
        }
        case 'reviews': {
          if (a.reviews === null && b.reviews === null) return 0;
          if (a.reviews === null) return 1;
          if (b.reviews === null) return -1;
          return (a.reviews - b.reviews) * dir;
        }
        case 'services': return (a.services.length - b.services.length) * dir;
        case 'status': {
          const order = (id: number) => STATUS_OPTIONS.find((option) => option.value === (statuses[id] ?? 'new'))?.order ?? 0;
          return (order(a.id) - order(b.id)) * dir;
        }
        default: return (a.id - b.id) * dir;
      }
    });
    return rows;
  }, [filtered, sortKey, sortDir, statuses]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusCounts = useMemo(() => {
    const counts: Record<OutreachStatus, number> = { new: 0, progress: 0, sent: 0 };
    for (const row of data?.rows ?? []) counts[statuses[row.id] ?? 'new'] += 1;
    return counts;
  }, [data, statuses]);

  const setStatus = (id: number, status: OutreachStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rating' || key === 'reviews' ? 'desc' : 'asc');
    }
  };

  const copyMessage = async (row: GeraRow) => {
    const ok = await copyText(messageFor(row, data?.templateUrl ?? 'https://www.zapishisya.ru/d/lm-detail'));
    if (!ok) return;
    setCopied(row.id);
    window.setTimeout(() => setCopied((current) => (current === row.id ? null : current)), 1600);
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070707]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight md:text-[26px]">GERA — база сервисов</h1>
              <p className="mt-1 text-[13px] text-white/45">
                {data
                  ? `${data.total.toLocaleString('ru-RU')} организаций · ${data.withSite} с готовым сайтом · отправлено ${statusCounts.sent.toLocaleString('ru-RU')}`
                  : 'Загрузка базы…'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={data?.templateUrl ?? 'https://www.zapishisya.ru/d/lm-detail'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Globe size={14} weight="bold" /> Шаблон
              </a>
              <label className="relative block">
                <MagnifyingGlass size={15} weight="bold" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск: название, город, телефон, услуга"
                  className="h-10 w-[280px] max-w-[70vw] rounded-full border border-white/15 bg-white/5 pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-sky-400/50"
                />
              </label>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 md:px-6">
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-[14px] text-red-200">{error}</div>
        )}

        {!data && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
            Загружаем 5907 организаций…
          </div>
        )}

        {data && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-white/45">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${statusFilter === 'all' ? 'border-white/25 bg-white/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80'}`}
                >
                  Все <span className="text-white/35">{data.total.toLocaleString('ru-RU')}</span>
                </button>
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${statusFilter === option.value ? option.active : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80'}`}
                  >
                    {option.label} <span className="text-white/35">{statusCounts[option.value].toLocaleString('ru-RU')}</span>
                  </button>
                ))}
                <span className="ml-1">Найдено {sorted.length.toLocaleString('ru-RU')}</span>
              </div>
              <label className="flex items-center gap-2">
                Показывать по
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="h-8 rounded-lg border border-white/15 bg-[#111] px-2 text-[12px] text-white outline-none"
                >
                  {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>

            <div className="max-h-[calc(100vh-230px)] overflow-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[1380px] border-collapse text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-[#101010]">
                  <tr className="border-b border-white/10">
                    <th className="w-[58px] px-3 py-3"><SortHeader label="№" active={sortKey === 'id'} dir={sortDir} onClick={() => toggleSort('id')} /></th>
                    <th className="min-w-[240px] px-3 py-3"><SortHeader label="Сервис" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} /></th>
                    <th className="min-w-[210px] px-3 py-3"><SortHeader label="Услуги" active={sortKey === 'services'} dir={sortDir} onClick={() => toggleSort('services')} /></th>
                    <th className="min-w-[300px] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-white/45">Связаться</th>
                    <th className="w-[100px] px-3 py-3"><SortHeader label="Оценка" active={sortKey === 'rating'} dir={sortDir} onClick={() => toggleSort('rating')} /></th>
                    <th className="w-[150px] px-3 py-3"><SortHeader label="Отзывы" active={sortKey === 'reviews'} dir={sortDir} onClick={() => toggleSort('reviews')} /></th>
                    <th className="w-[190px] px-3 py-3"><SortHeader label="Статус" active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} /></th>
                    <th className="w-[170px] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-white/45">Сообщение</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-b border-white/[0.06] align-top transition-colors hover:bg-white/[0.025]">
                      <td className="px-3 py-3 text-white/35">{row.id}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold leading-snug text-white">{row.name}</div>
                        <div className="mt-0.5 text-[11px] text-white/45">{row.sphere}{row.city ? ` · ${row.city}` : ''}</div>
                        {row.address && <div className="mt-0.5 text-[11px] leading-snug text-white/35">{row.address}</div>}
                        {row.siteUrl && (
                          <a href={row.siteUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-fuchsia-300 hover:text-fuchsia-200">
                            <Globe size={12} weight="bold" /> Готовый сайт
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {row.services.length > 0 ? (
                          <details className="group">
                            <summary className="cursor-pointer list-none text-[12px] leading-snug text-white/70 marker:hidden">
                              {row.services.slice(0, 2).map((service) => service.name).join(' · ')}
                              {row.services.length > 2 && <span className="text-white/40"> · +{row.services.length - 2}</span>}
                            </summary>
                            <ul className="mt-2 space-y-1 border-l border-white/10 pl-2 text-[11px] text-white/55">
                              {row.services.map((service, index) => (
                                <li key={`${row.id}-${index}`} className="flex justify-between gap-2">
                                  <span>{service.name}</span>
                                  {service.price > 0 && <span className="shrink-0 text-white/35">{service.price.toLocaleString('ru-RU')} ₽</span>}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {row.phones.map((phone) => (
                            <ContactLink key={phone} href={telHref(phone)} label={formatPhone(phone)} tone="phone" icon={<Phone size={11} weight="bold" />} title="Позвонить" />
                          ))}
                          {row.telegram && <ContactLink href={row.telegram} label="Telegram" tone="telegram" icon={<TelegramLogo size={12} weight="bold" />} />}
                          {row.whatsapp && <ContactLink href={row.whatsapp} label="WhatsApp" tone="whatsapp" icon={<WhatsappLogo size={12} weight="bold" />} />}
                          {row.max && <ContactLink href={row.max} label="MAX" tone="max" icon={<span className="text-[9px] font-black">M</span>} />}
                          {row.vk && <ContactLink href={row.vk} label="VK" tone="vk" icon={<span className="text-[9px] font-black">VK</span>} />}
                          {row.map && <ContactLink href={row.map} label="Карта" tone="map" icon={<MapPin size={11} weight="bold" />} />}
                          {row.siteUrl && <ContactLink href={row.siteUrl} label="Сайт" tone="site" icon={<Globe size={11} weight="bold" />} />}
                          {row.phones.length === 0 && !row.telegram && !row.whatsapp && !row.max && !row.vk && !row.map && !row.siteUrl && (
                            <span className="text-[11px] text-white/25">Контактов нет</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {row.rating === null ? <span className="text-white/25">—</span> : (
                          <span className="inline-flex items-center gap-1 text-[12px] text-amber-200"><span className="text-amber-400">★</span>{row.rating.toFixed(1)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-white/50">{row.reviews === null ? '—' : row.reviews.toLocaleString('ru-RU')}</td>
                      <td className="px-3 py-3">
                        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Статус обзвона">
                          {STATUS_OPTIONS.map((option) => {
                            const current = (statuses[row.id] ?? 'new') === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setStatus(row.id, option.value)}
                                aria-pressed={current}
                                className={`whitespace-nowrap rounded-full border-0 bg-transparent px-2 py-1 text-[10px] font-semibold transition-colors ${current ? option.active : 'text-white/35 hover:text-white/70'}`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => copyMessage(row)}
                          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-colors ${copied === row.id ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200' : 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white'}`}
                        >
                          {copied === row.id ? <Check size={13} weight="bold" /> : <Copy size={13} weight="bold" />}
                          {copied === row.id ? 'Скопировано' : 'Копировать'}
                        </button>
                        <div className="mt-1 text-center text-[10px] text-white/30">
                          {row.siteUrl ? 'ссылка на их сайт' : 'ссылка на шаблон'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-white/50">
              <span>Страница {safePage} из {totalPages}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white/75 disabled:cursor-not-allowed disabled:opacity-30">Назад</button>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white/75 disabled:cursor-not-allowed disabled:opacity-30">Вперёд</button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
