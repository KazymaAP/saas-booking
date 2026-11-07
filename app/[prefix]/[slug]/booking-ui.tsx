'use client';
// Общие элементы выбора даты и времени для BookingForm и RescheduleForm (клиентские: обработчики событий).
// Доступность (ТЗ §19.6): группы с подписями, aria-pressed у выбранного, aria-describedby/aria-invalid,
// aria-live для статуса загрузки. Список слотов резервирует высоту — без layout shift при загрузке.
import { memo, useCallback, type MouseEvent, type FocusEvent } from 'react';
import { formatSlotTime } from '@/lib/slots';
import type { DateOption } from '@/lib/booking-dates';
import type { SlotsState } from '@/lib/use-slots';

const SKELETON_ITEMS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

// Классы Tailwind (globals.css — чужая зона, поэтому стили здесь). Высота кнопок 44 px — цель касания на телефоне.
// Выбранное состояние — через aria-pressed (цвет не единственный признак: ещё и жирный текст и рамка).
const CLS = {
  strip: 'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]',
  chip:
    // text-[#111] обязателен: чип белый, а внутри тёмной карточки (нишевые темы) он наследовал
    // светлый цвет текста — даты становились невидимыми (контраст 1.3:1).
    'flex min-w-[56px] shrink-0 flex-col items-center rounded-lg border border-[#e5e5e5] bg-white px-2 py-1 text-[13px] leading-tight text-[#111] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111] ' +
    'disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-[var(--brand-color)] aria-pressed:bg-[var(--brand-color)] aria-pressed:font-semibold aria-pressed:text-white',
  chipDay: 'text-[17px] font-semibold',
  slots: 'grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2',
  slot:
    'h-11 rounded-lg border border-[#e5e5e5] bg-white px-2 text-[15px] tabular-nums text-[#111] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111] ' +
    'aria-pressed:border-[var(--brand-color)] aria-pressed:bg-[var(--brand-color)] aria-pressed:font-semibold aria-pressed:text-white',
  skeleton: 'h-11 animate-pulse rounded-lg bg-[#efefef]',
  // min-h резервирует место под одну строку слотов: смена «загрузка → список» не сдвигает форму.
  wrap: 'min-h-[52px]',
  // #767676 — единственный серый, который держит AA и на белом (4.5:1), и на тёмной теме сайта (4.6:1).
  status: 'text-[14px] text-[color:var(--booking-muted,#595959)]',
} as const;
const ERROR_COLOR = '#b91c1c'; // контраст 6.5:1 на белом (WCAG AA)
// Приглушённый текст: значение приходит из темы сайта (--booking-muted), по умолчанию — тёмно-серый
// для светлых страниц. Один фиксированный серый не может дать AA и на белом, и на чёрном.
const MUTED_COLOR = 'var(--booking-muted, #595959)';

export const fieldStyles = {
  error: { color: ERROR_COLOR, fontSize: 14, margin: '4px 0 0' },
  hint: { color: MUTED_COLOR, fontSize: 14, margin: '4px 0 0' },
} as const;

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  // Элемент есть всегда (пустой без ошибки): aria-describedby не ссылается на несуществующий id.
  return (
    <p id={id} style={fieldStyles.error} >
      {message ?? ''}
    </p>
  );
}

// ---------- Даты ----------

type DateStripProps = {
  options: readonly DateOption[];
  selected: string;
  onSelect: (date: string) => void;
  onPrefetch: (date: string) => void;
  labelId: string;
  describedBy?: string;
};

export const DateStrip = memo(function DateStrip({ options, selected, onSelect, onPrefetch, labelId, describedBy }: DateStripProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const date = event.currentTarget.dataset.date;
      if (date) onSelect(date);
    },
    [onSelect],
  );
  // Prefetch при наведении и фокусе с клавиатуры: к моменту клика слоты уже в кэше.
  const handleHint = useCallback(
    (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
      const date = event.currentTarget.dataset.date;
      if (date && event.currentTarget.dataset.closed !== 'true') onPrefetch(date);
    },
    [onPrefetch],
  );
  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className={CLS.strip}>
      {options.map((option) => (
        <button
          key={option.date}
          type="button"
          data-date={option.date}
          data-closed={option.closed ? 'true' : 'false'}
          aria-pressed={option.date === selected}
          aria-label={option.label}
          disabled={option.closed}
          onClick={handleClick}
          onMouseEnter={handleHint}
          onFocus={handleHint}
          className={CLS.chip}
        >
          <span>{option.weekday}</span>
          <span className={CLS.chipDay}>{option.day}</span>
          <span>{option.month}</span>
        </button>
      ))}
    </div>
  );
});

// ---------- Слоты ----------

type SlotPickerProps = {
  state: SlotsState;
  showSkeleton: boolean;
  selected: string;
  timeZone: string;
  onSelect: (iso: string) => void;
  labelId: string;
  errorId: string;
  invalid: boolean;
  emptyText: string;
};

function SlotSkeleton() {
  return (
    <div className={CLS.slots} aria-hidden="true">
      {SKELETON_ITEMS.map((key) => (
        <span key={key} className={CLS.skeleton} />
      ))}
    </div>
  );
}

// Текст статуса для aria-live: диктор узнаёт о загрузке и результате, не теряя фокус.
function slotsStatus(state: SlotsState, emptyText: string): string {
  if (state.kind === 'loading') return 'Загружаем свободное время…';
  if (state.kind === 'error') return state.message;
  if (state.kind === 'ready' && state.slots.length === 0) return emptyText;
  if (state.kind === 'ready') return `Свободно: ${state.slots.length}`;
  return '';
}

export const SlotPicker = memo(function SlotPicker(props: SlotPickerProps) {
  const { state, showSkeleton, selected, timeZone, onSelect, labelId, errorId, invalid, emptyText } = props;
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const iso = event.currentTarget.dataset.iso;
      if (iso) onSelect(iso);
    },
    [onSelect],
  );
  const status = slotsStatus(state, emptyText);
  return (
    <div className={CLS.wrap}>
      <p role="status" aria-live="polite" className={state.kind === 'ready' && state.slots.length > 0 ? 'sr-only' : CLS.status}>
        {state.kind === 'loading' && showSkeleton === false ? '' : status}
      </p>
      {state.kind === 'loading' && showSkeleton ? <SlotSkeleton /> : null}
      {state.kind === 'ready' && state.slots.length > 0 ? (
        <div role="group" aria-labelledby={labelId} aria-describedby={errorId} aria-invalid={invalid} className={CLS.slots}>
          {state.slots.map((iso) => (
            <button
              key={iso}
              type="button"
              data-iso={iso}
              aria-pressed={iso === selected}
              onClick={handleClick}
              className={CLS.slot}
            >
              {formatSlotTime(iso, timeZone)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
