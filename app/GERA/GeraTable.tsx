'use client';
// app/GERA/GeraTable.tsx — внутренняя таблица всех организаций из Excel:
// поиск, сортировка, переключатели фильтров, статус обзвона, копирование сообщений
// и отдельные кнопки связи по каждому контакту.
// На телефоне таблица заменяется карточками: горизонтальной прокрутки нет,
// сортировка и фильтры вынесены в отдельную панель.
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise, ArrowsDownUp, CalendarCheck, CaretDown, Check, Copy, Gauge, Globe,
  ListBullets, MagnifyingGlass, MapPin, Phone, TelegramLogo, UserCircle, WhatsappLogo,
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

const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  id: '№', name: 'Название', city: 'Город', rating: 'Оценка',
  reviews: 'Отзывы', services: 'Услуги', status: 'Статус',
};

const STATUS_KEY = 'gera:statuses:v1';
const FILTERS_KEY = 'gera:filters:v1';
const PAGE_SIZES = [25, 50, 100] as const;

// Булевы фильтры: включён — показываем только подходящие строки, выключен — не ограничиваем.
type Filters = {
  readonly withSite: boolean;
  readonly withContacts: boolean;
  readonly withReviews: boolean;
};

const NO_FILTERS: Filters = { withSite: false, withContacts: false, withReviews: false };

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

// «Есть контакт» = можно написать или позвонить. Карта контактом не считается.
function hasContacts(row: GeraRow): boolean {
  return row.phones.length > 0 || Boolean(row.telegram || row.whatsapp || row.max || row.vk);
}

// Адрес сайта клиента — это и есть адрес его кабинета: /{prefix}/{slug}/admin.
// Панели существуют только у тех, кому уже выкатили сайт (siteUrl не пустой).
function tenantBase(siteUrl: string | null): string | null {
  if (!siteUrl) return null;
  try {
    const parts = new URL(siteUrl).pathname.split('/').filter(Boolean);
    return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : null;
  } catch {
    return null;
  }
}

// Разделы кабинета владельца — ровно те, что лежат в app/[prefix]/[slug]/admin/(protected).
const PANEL_SECTIONS: ReadonlyArray<{ path: string; label: string }> = [
  { path: '', label: 'Обзор' },
  { path: '/bookings', label: 'Записи' },
  { path: '/services', label: 'Услуги' },
  { path: '/photos', label: 'Фото' },
  { path: '/texts', label: 'Тексты' },
  { path: '/appearance', label: 'Оформление' },
  { path: '/team', label: 'Сотрудники' },
  { path: '/notifications', label: 'Уведомления' },
  { path: '/subscription', label: 'Подписка' },
  { path: '/settings', label: 'Настройки' },
  { path: '/data', label: 'Данные' },
];

function messageFor(row: GeraRow, templateUrl: string): string {
  const example = row.siteUrl ?? row.exampleUrl ?? templateUrl;
  return [
    `Здравствуйте! Нашёл «${row.name}» в Яндекс.Картах. У вас нет сайта — я подготовил пример, как он мог бы выглядеть: услуги, фото, прайс и онлайн-запись.`,
    `Пример (${example})`,
    'Важно: это не готовый сайт — сайт могу поменять под ваши требования: добавить или убрать услуги, поменять фото, цены, тексты и форму записи.',
    'Посмотрите без обязательств. Если интересно — напишите, расскажу, как запустить такой сайт для вас.',
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

function ContactLinks({ row }: { row: GeraRow }) {
  const empty = row.phones.length === 0 && !row.telegram && !row.whatsapp && !row.max && !row.vk && !row.map && !row.siteUrl;
  if (empty) return <span className="text-[11px] text-white/25">Контактов нет</span>;
  return (
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
    </div>
  );
}

// Панели конкретного сервиса. Показываем только когда у бизнеса уже есть сайт:
// без сайта нет и кабинета, поэтому у 5 639 строк из 5 907 блока просто не будет.
// card — карточка на телефоне (крупные чипы), row — строка таблицы (плотная строка текста).
function PanelLinks({ row, variant }: { row: GeraRow; variant: 'card' | 'row' }) {
  const [open, setOpen] = useState(false);
  const base = tenantBase(row.siteUrl);
  if (!base) return null;

  const primary = [
    { href: `${base}/admin`, label: 'Админка', title: 'Кабинет владельца', icon: <Gauge size={12} weight="bold" /> },
    { href: `${base}/admin/bookings`, label: 'Записи', title: 'Журнал записей', icon: <CalendarCheck size={12} weight="bold" /> },
    { href: `${base}/admin/services`, label: 'Услуги', title: 'Услуги и цены', icon: <ListBullets size={12} weight="bold" /> },
    { href: `${base}/my`, label: 'Клиент', title: 'Кабинет клиента', icon: <UserCircle size={12} weight="bold" /> },
  ];

  const all = [
    ...PANEL_SECTIONS.map((section) => ({ href: `${base}/admin${section.path}`, label: section.label })),
    { href: `${base}/admin/export`, label: 'Экспорт' },
  ];

  // Список раскрываем в потоке, а не поверх строки — иначе его обрежет overflow таблицы.
  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      className="box-border inline-flex appearance-none items-center gap-1 border-0 bg-transparent p-0 text-[11px] text-white/40 transition-colors hover:text-white/70"
    >
      <CaretDown size={10} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      {open ? 'Свернуть' : `Все панели (${all.length})`}
    </button>
  );

  const expanded = open && (
    <ul className={`mt-1.5 grid list-none gap-x-3 gap-y-1 pl-0 text-[11px] ${variant === 'card' ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {all.map((item) => (
        <li key={item.href}>
          <a href={item.href} target="_blank" rel="noopener noreferrer" className="no-underline text-white/55 transition-colors hover:text-white">
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );

  if (variant === 'card') {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {primary.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              title={item.title}
              className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/[0.07] px-2 py-1 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white"
            >
              {item.icon} {item.label}
            </a>
          ))}
        </div>
        <div className="mt-1.5">{toggle}</div>
        {expanded}
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-none">
        <span className="text-white/35">Панели:</span>
        {primary.map((item, index) => (
          <Fragment key={item.href}>
            {index > 0 && <span className="text-white/20">·</span>}
            <a href={item.href} target="_blank" rel="noopener noreferrer" title={item.title} className="no-underline font-medium text-white/70 transition-colors hover:text-white">
              {item.label}
            </a>
          </Fragment>
        ))}
        <span className="text-white/20">·</span>
        {toggle}
      </div>
      {expanded}
    </div>
  );
}

function ServicesCell({ row }: { row: GeraRow }) {
  if (row.services.length === 0) return <span className="text-white/25">—</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[12px] leading-snug text-white/70 [&::-webkit-details-marker]:hidden">
        {row.services.slice(0, 2).map((service) => service.name).join(' · ')}
        {row.services.length > 2 && <span className="text-white/40"> · +{row.services.length - 2}</span>}
      </summary>
      <ul className="mt-2 list-none space-y-1 border-l border-white/10 pl-2 text-[11px] text-white/55">
        {row.services.map((service, index) => (
          <li key={`${row.id}-${index}`} className="flex justify-between gap-2">
            <span>{service.name}</span>
            {service.price > 0 && <span className="shrink-0 text-white/35">{service.price.toLocaleString('ru-RU')} ₽</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function StatusControl({
  value, onChange,
}: {
  value: OutreachStatus;
  onChange: (status: OutreachStatus) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Статус обзвона">
      {STATUS_OPTIONS.map((option) => {
        const current = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={current}
            className={`flex-1 whitespace-nowrap rounded-full border-0 bg-transparent px-2 py-1 text-[10px] font-semibold transition-colors ${current ? option.active : 'text-white/35 hover:text-white/70'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RatingPill({ row }: { row: GeraRow }) {
  if (row.rating === null) return <span className="text-white/25">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-amber-200">
      <span className="text-amber-400">★</span>{row.rating.toFixed(1)}
    </span>
  );
}

function MessageActions({
  row, templateUrl, copied, onCopy,
}: {
  row: GeraRow;
  templateUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onCopy}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-colors ${copied ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200' : 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white'}`}
      >
        {copied ? <Check size={13} weight="bold" /> : <Copy size={13} weight="bold" />}
        {copied ? 'Скопировано' : 'Копировать'}
      </button>
      <div className="mt-1 text-center text-[10px] text-white/30">
        {row.siteUrl ? 'ссылка на их сайт' : 'ссылка на шаблон'}
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer list-none text-center text-[10px] text-white/30 hover:text-white/60 [&::-webkit-details-marker]:hidden">
          показать текст
        </summary>
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] leading-snug text-white/50">
          {messageFor(row, templateUrl)}
        </p>
      </details>
    </div>
  );
}

function FilterSwitch({
  label, count, checked, onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-2 text-[12px] font-medium transition-colors ${checked ? 'border-sky-400/45 bg-sky-400/15 text-sky-100' : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/85'}`}
    >
      <span aria-hidden className={`relative h-4 w-[28px] shrink-0 rounded-full transition-colors ${checked ? 'bg-sky-400/80' : 'bg-white/15'}`}>
        <span className={`absolute top-[2px] h-3 w-3 rounded-full bg-white transition-all ${checked ? 'left-[14px]' : 'left-[2px]'}`} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
      <span className="text-[11px] tabular-nums text-white/35">{count.toLocaleString('ru-RU')}</span>
    </button>
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
  const [statusFilter, setStatusFilter] = useState<OutreachStatus[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Данные отдаёт серверный роут только супер-админу (файл убран из public/).
    fetch('/api/gera')
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

  // Фильтры тоже запоминаем: обзвон идёт днями, каждый раз заново их включать не нужно.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Filters> & { statuses?: unknown };
        setFilters({
          withSite: parsed.withSite === true,
          withContacts: parsed.withContacts === true,
          withReviews: parsed.withReviews === true,
        });
        if (Array.isArray(parsed.statuses)) {
          setStatusFilter(parsed.statuses.filter((value): value is OutreachStatus => value === 'new' || value === 'progress' || value === 'sent'));
        }
      }
    } catch {
      // Повреждённое значение — начинаем с пустых фильтров.
    }
    setFiltersLoaded(true);
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...filters, statuses: statusFilter }));
    } catch {
      // Если localStorage запрещён, фильтры останутся в памяти на время сессии.
    }
  }, [filters, statusFilter, filtersLoaded]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, pageSize, sortKey, sortDir, statusFilter, filters]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = deferredQuery.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return data.rows.filter((row) => {
      const status = statuses[row.id] ?? 'new';
      if (statusFilter.length > 0 && !statusFilter.includes(status)) return false;
      if (filters.withSite && !row.siteUrl) return false;
      if (filters.withContacts && !hasContacts(row)) return false;
      if (filters.withReviews && (row.reviews ?? 0) <= 0) return false;
      if (!needle) return true;
      const haystack = [
        row.name, row.sphere, row.city, row.address,
        ...row.phones, ...row.services.map((service) => service.name),
      ].join(' ').toLowerCase();
      if (haystack.includes(needle)) return true;
      return digits.length >= 3 && row.phones.some((phone) => phone.replace(/\D/g, '').includes(digits));
    });
  }, [data, deferredQuery, statusFilter, statuses, filters]);

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
  const shownFrom = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const shownTo = Math.min(safePage * pageSize, sorted.length);

  const statusCounts = useMemo(() => {
    const counts: Record<OutreachStatus, number> = { new: 0, progress: 0, sent: 0 };
    for (const row of data?.rows ?? []) counts[statuses[row.id] ?? 'new'] += 1;
    return counts;
  }, [data, statuses]);

  // Счётчики в переключателях считаются по всей базе, а не по текущей выборке:
  // так видно, сколько строк вообще подходит под условие.
  const baseCounts = useMemo(() => {
    const rows = data?.rows ?? [];
    let withSite = 0;
    let withContactsCount = 0;
    let withReviewsCount = 0;
    for (const row of rows) {
      if (row.siteUrl) withSite += 1;
      if (hasContacts(row)) withContactsCount += 1;
      if ((row.reviews ?? 0) > 0) withReviewsCount += 1;
    }
    return { withSite, withContacts: withContactsCount, withReviews: withReviewsCount };
  }, [data]);

  const activeFilterCount =
    (filters.withSite ? 1 : 0) + (filters.withContacts ? 1 : 0) + (filters.withReviews ? 1 : 0) + statusFilter.length;

  const setStatus = (id: number, status: OutreachStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  };

  const toggleStatusFilter = (status: OutreachStatus) => {
    setStatusFilter((current) => (
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status]
    ));
  };

  const resetFilters = () => {
    setFilters(NO_FILTERS);
    setStatusFilter([]);
    setQuery('');
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rating' || key === 'reviews' ? 'desc' : 'asc');
    }
  };

  const goPage = (next: number) => {
    setPage(next);
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const copyMessage = async (row: GeraRow) => {
    const ok = await copyText(messageFor(row, data?.templateUrl ?? 'https://www.zapishisya.ru/d/lm-detail'));
    if (!ok) return;
    setCopied(row.id);
    window.setTimeout(() => setCopied((current) => (current === row.id ? null : current)), 1600);
  };

  const updatedAt = data
    ? new Date(data.generatedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070707]">
        <div className="mx-auto max-w-[1600px] px-3 py-2 md:px-6 md:py-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-[16px] font-semibold tracking-tight md:text-[26px]">GERA — база сервисов</h1>
                <p className="mt-1 hidden text-[12px] leading-snug text-white/45 md:block md:text-[13px]">
                  {data
                    ? `${data.total.toLocaleString('ru-RU')} организаций · ${data.withSite} с готовым сайтом · отправлено ${statusCounts.sent.toLocaleString('ru-RU')}${updatedAt ? ` · база от ${updatedAt}` : ''}`
                    : 'Загрузка базы…'}
                </p>
                <p className="mt-0.5 hidden text-[11px] leading-snug text-white/30 md:block">
                  Панели сервисов открываются под сессией супер-админа: сначала войдите на{' '}
                  <a href="/admin" target="_blank" rel="noopener noreferrer" className="no-underline text-white/50 hover:text-white/80">/admin</a>.
                </p>
              </div>
              {/* На телефоне ссылка на шаблон — иконкой в строке заголовка, чтобы не отнимать ширину у поиска. */}
              <a
                href={data?.templateUrl ?? 'https://www.zapishisya.ru/d/lm-detail'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Открыть шаблон сайта"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
              >
                <Globe size={15} weight="bold" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative block min-w-0 flex-1 md:flex-none">
                <MagnifyingGlass size={15} weight="bold" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  inputMode="search"
                  placeholder="Поиск: название, город, телефон, услуга"
                  className="box-border h-9 w-full rounded-full border border-white/15 bg-white/5 pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-sky-400/50 md:h-10 md:w-[300px]"
                />
              </label>
              <a
                href={data?.templateUrl ?? 'https://www.zapishisya.ru/d/lm-detail'}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-[12px] text-white/70 transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
              >
                <Globe size={14} weight="bold" /> Шаблон
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-4 md:px-6 md:py-5">
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-[14px] text-red-200">
            {error}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ml-2 underline underline-offset-2 hover:text-white"
            >
              Обновить
            </button>
          </div>
        )}

        {!data && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/50">
            Загружаем базу организаций…
          </div>
        )}

        {data && (
          <>
            {/* Панель фильтров: переключатели по одному условию, условия складываются через «и». */}
            <section aria-label="Фильтры" className="mb-3 rounded-2xl border border-white/10 bg-white/[0.02] p-2.5 md:p-3">
              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">Статус</span>
                  {STATUS_OPTIONS.map((option) => (
                    <FilterSwitch
                      key={option.value}
                      label={option.label}
                      count={statusCounts[option.value]}
                      checked={statusFilter.includes(option.value)}
                      onChange={() => toggleStatusFilter(option.value)}
                    />
                  ))}
                </div>
                <span aria-hidden className="hidden h-5 w-px bg-white/10 md:block" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">Ещё</span>
                  <FilterSwitch
                    label="Готовый сайт"
                    count={baseCounts.withSite}
                    checked={filters.withSite}
                    onChange={(next) => setFilters((current) => ({ ...current, withSite: next }))}
                  />
                  <FilterSwitch
                    label="С контактами"
                    count={baseCounts.withContacts}
                    checked={filters.withContacts}
                    onChange={(next) => setFilters((current) => ({ ...current, withContacts: next }))}
                  />
                  <FilterSwitch
                    label="С отзывами"
                    count={baseCounts.withReviews}
                    checked={filters.withReviews}
                    onChange={(next) => setFilters((current) => ({ ...current, withReviews: next }))}
                  />
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-transparent px-2.5 py-2 text-[11px] font-medium text-white/45 transition-colors hover:border-white/25 hover:text-white"
                    >
                      <ArrowCounterClockwise size={12} weight="bold" /> Сбросить ({activeFilterCount})
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                <p aria-live="polite" className="text-[12px] text-white/45">
                  Найдено <span className="font-semibold text-white/80">{sorted.length.toLocaleString('ru-RU')}</span>
                  {sorted.length !== data.total && <span className="text-white/30"> из {data.total.toLocaleString('ru-RU')}</span>}
                  {updatedAt && <span className="text-white/25 lg:hidden"> · база от {updatedAt}</span>}
                </p>
                <div className="flex items-center gap-2">
                  {/* На телефоне колонок нет, поэтому сортировка — отдельным селектом. */}
                  <label className="flex items-center gap-1.5 text-[12px] text-white/45 lg:hidden">
                    Сортировка
                    <select
                      value={sortKey}
                      onChange={(event) => toggleSort(event.target.value as SortKey)}
                      className="box-border h-9 rounded-lg border border-white/15 bg-[#111] px-2 text-[12px] text-white outline-none"
                    >
                      {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                        <option key={key} value={key}>{SORT_LABELS[key]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    aria-label={sortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
                    className="box-border inline-flex h-9 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-[12px] text-white/70 lg:hidden"
                  >
                    <ArrowsDownUp size={13} weight="bold" />
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </button>
                  <label className="flex items-center gap-1.5 text-[12px] text-white/45">
                    <span className="hidden sm:inline">Показывать по</span>
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      className="box-border h-9 rounded-lg border border-white/15 bg-[#111] px-2 text-[12px] text-white outline-none"
                    >
                      {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </section>

            <div ref={listRef} className="scroll-mt-28">
              {sorted.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
                  <p className="text-[14px] text-white/60">Под эти условия ничего не подходит.</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    <ArrowCounterClockwise size={13} weight="bold" /> Сбросить фильтры
                  </button>
                </div>
              ) : (
                <>
                  {/* Телефон: карточки. Горизонтальной прокрутки нет. */}
                  <ul className="list-none space-y-2.5 p-0 lg:hidden">
                    {pageRows.map((row) => (
                      <li key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-semibold leading-snug text-white">{row.name}</h3>
                            <p className="mt-0.5 text-[11px] text-white/45">
                              {row.sphere}{row.city ? ` · ${row.city}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-white/25">#{row.id}</span>
                        </div>

                        {row.address && <p className="mt-1 text-[11px] leading-snug text-white/35">{row.address}</p>}

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          {row.rating === null && row.reviews === null ? (
                            <span className="text-white/30">нет отзывов</span>
                          ) : (
                            <>
                              <RatingPill row={row} />
                              <span className="text-white/40">
                                {row.reviews === null ? 'отзывов нет' : `${row.reviews.toLocaleString('ru-RU')} отзывов`}
                              </span>
                            </>
                          )}
                          {row.siteUrl && (
                            <a href={row.siteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-fuchsia-300 hover:text-fuchsia-200">
                              <Globe size={11} weight="bold" /> Готовый сайт
                            </a>
                          )}
                        </div>

                        {row.services.length > 0 && (
                          <div className="mt-2 rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-2">
                            <ServicesCell row={row} />
                          </div>
                        )}

                        <div className="mt-2">
                          <ContactLinks row={row} />
                        </div>

                        <PanelLinks row={row} variant="card" />

                        <div className="mt-2.5 sm:max-w-[380px]">
                          <StatusControl
                            value={statuses[row.id] ?? 'new'}
                            onChange={(next) => setStatus(row.id, next)}
                          />
                        </div>

                        <div className="mt-2 sm:max-w-[380px]">
                          <MessageActions
                            row={row}
                            templateUrl={data.templateUrl}
                            copied={copied === row.id}
                            onCopy={() => copyMessage(row)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Планшет и десктоп: таблица. */}
                  <div className="hidden max-h-[calc(100dvh-300px)] overflow-auto rounded-2xl border border-white/10 lg:block">
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
                          <th className="w-[220px] px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-white/45">Сообщение</th>
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
                              <PanelLinks row={row} variant="row" />
                            </td>
                            <td className="px-3 py-3"><ServicesCell row={row} /></td>
                            <td className="px-3 py-3"><ContactLinks row={row} /></td>
                            <td className="px-3 py-3"><RatingPill row={row} /></td>
                            <td className="px-3 py-3 text-[12px] text-white/50">{row.reviews === null ? '—' : row.reviews.toLocaleString('ru-RU')}</td>
                            <td className="px-3 py-3">
                              <StatusControl value={statuses[row.id] ?? 'new'} onChange={(next) => setStatus(row.id, next)} />
                            </td>
                            <td className="px-3 py-3">
                              <MessageActions
                                row={row}
                                templateUrl={data.templateUrl}
                                copied={copied === row.id}
                                onCopy={() => copyMessage(row)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 text-[12px] text-white/50 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Показано {shownFrom.toLocaleString('ru-RU')}–{shownTo.toLocaleString('ru-RU')} из {sorted.length.toLocaleString('ru-RU')}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => goPage(Math.max(1, safePage - 1))}
                        disabled={safePage <= 1}
                        className="box-border h-10 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-white/75 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:h-9 sm:flex-none"
                      >
                        Назад
                      </button>
                      <span className="whitespace-nowrap px-1 tabular-nums text-white/60">{safePage} / {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => goPage(Math.min(totalPages, safePage + 1))}
                        disabled={safePage >= totalPages}
                        className="box-border h-10 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-white/75 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:h-9 sm:flex-none"
                      >
                        Вперёд
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
