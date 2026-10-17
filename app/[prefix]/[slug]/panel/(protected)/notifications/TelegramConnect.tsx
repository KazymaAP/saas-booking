// notifications/TelegramConnect.tsx — клиентская часть подключения Telegram (ТЗ §18.3, §36).
// Optimistic: кнопки сразу меняют вид, ответ server action заменяет состояние (при ошибке — откат).
// Пока показан код: таймер TTL, опрос статуса каждые 5 с (только на видимой вкладке), авто-переход
// в «подключено». A11y: статус в aria-live (в т.ч. «код истёк»), фокус переводится на новый блок,
// ошибки в role=alert. Исключение server action (сеть) → откат и сообщение, кнопки не зависают.
'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { checkTelegramStatus, createTelegramCode, disconnectTelegram } from './actions';
import { ACTION_ERRORS, DISCONNECTED_STATE, deepLink, formatLeft, type ActionResult, type TelegramState } from './telegram-view';

const POLL_INTERVAL_MS = 5_000;
const TICK_MS = 1_000;
const COPIED_RESET_MS = 2_000;

interface Props {
  prefix: string;
  slug: string;
  botName: string | null;
  initial: TelegramState;
}

type Pending = 'create' | 'disconnect' | null;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Опрос статуса, пока ждём /start от бота. Скрытая вкладка не опрашивает. */
function useStatusPolling(enabled: boolean, poll: () => void): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, poll]);
}

/**
 * Остаток TTL кода. Таймер тикает, только пока код жив; при истечении — объявление в aria-live
 * (визуальная надпись «Код истёк» без него не дошла бы до скринридера).
 */
function useCodeExpiry(state: TelegramState, say: (message: string) => void): { left: number; codeAlive: boolean } {
  const [ticking, setTicking] = useState(true);
  const now = useNow(Boolean(state.code) && ticking);
  const left = (state.expiresAt ? new Date(state.expiresAt).getTime() : 0) - now;
  const codeAlive = Boolean(state.code) && left > 0;
  useEffect(() => setTicking(true), [state.code]);
  useEffect(() => {
    if (!state.code || codeAlive) return;
    setTicking(false);
    say('Код истёк. Создайте новый.');
  }, [state.code, codeAlive, say]);
  return { left, codeAlive };
}

interface Feedback {
  error: string | null;
  announce: string;
  setError: (value: string | null) => void;
  say: (message: string) => void;
}

function useFeedback(): Feedback {
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const say = useCallback((message: string) => {
    setError(null);
    setAnnounce(message);
  }, []);
  return { error, announce, setError, say };
}

/**
 * Цель фокуса после смены состояния: кнопка, на которой был фокус, исчезает из DOM, и без этого
 * фокус «падает» на body. Срабатывает только после действия пользователя (arm), не при загрузке.
 */
function useFocusTarget() {
  const ref = useRef<HTMLHeadingElement>(null);
  const armed = useRef(false);
  const arm = useCallback(() => { armed.current = true; }, []);
  const flush = useCallback(() => {
    if (!armed.current) return;
    armed.current = false;
    ref.current?.focus();
  }, []);
  return { ref, arm, flush };
}

interface Controller {
  state: TelegramState;
  pending: Pending;
  run: (kind: Exclude<Pending, null>, optimistic: TelegramState | null, action: () => Promise<ActionResult>, message: string) => void;
  poll: () => void;
}

/** Действия с optimistic-состоянием: ответ сервера заменяет его, ошибка — откат к статусу из БД. */
function useController(prefix: string, slug: string, initial: TelegramState, feedback: Feedback, onChange: () => void): Controller {
  const [state, setState] = useState<TelegramState>(initial);
  const [pending, setPending] = useState<Pending>(null);
  const [, startTransition] = useTransition();
  const { say, setError } = feedback;

  const run: Controller['run'] = (kind, optimistic, action, message) => {
    const previous = state;
    setPending(kind);
    setError(null);
    if (optimistic) setState(optimistic);
    startTransition(async () => {
      try {
        const result = await action();
        setState(result.state ?? previous);
        if (result.ok) {
          say(message);
          onChange();
        } else {
          setError(ACTION_ERRORS[result.error]);
        }
      } catch {
        // Сервер недоступен (сеть, деплой): откат optimistic-состояния, кнопки снова активны.
        setState(previous);
        setError(ACTION_ERRORS.failed);
      } finally {
        setPending(null);
      }
    });
  };

  const poll = useCallback(() => {
    startTransition(async () => {
      // Сбой опроса не показываем: следующий тик через 5 с повторит запрос.
      const result = await checkTelegramStatus(prefix, slug).catch(() => null);
      if (!result?.ok || !result.state.connected) return;
      setState(result.state);
      say('Telegram подключён. Уведомления будут приходить в чат.');
      onChange();
    });
  }, [prefix, slug, say, onChange]);

  return { state, pending, run, poll };
}

function useCopy(code: string | null, feedback: Feedback): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`/start ${code}`);
      setCopied(true);
      feedback.say('Команда скопирована.');
    } catch {
      // Clipboard API недоступен (http, запрет браузера) — код виден на экране и выделяется целиком.
      feedback.setError('Не удалось скопировать. Выделите код вручную.');
    }
  };
  return { copied, copy };
}

export default function TelegramConnect({ prefix, slug, botName, initial }: Props) {
  const feedback = useFeedback();
  const [confirming, setConfirming] = useState(false);
  const focus = useFocusTarget();
  const ctl = useController(prefix, slug, initial, feedback, focus.arm);
  const { state, pending } = ctl;
  const { left, codeAlive } = useCodeExpiry(state, feedback.say);
  const { copied, copy } = useCopy(state.code, feedback);
  useStatusPolling(codeAlive && pending === null, ctl.poll);
  const { flush } = focus;
  useEffect(flush, [state.connected, state.code, flush]);

  const onCreate = () => ctl.run('create', null, () => createTelegramCode(prefix, slug), 'Код создан. Он действует 15 минут.');
  const onDisconnect = () => {
    setConfirming(false);
    ctl.run('disconnect', DISCONNECTED_STATE, () => disconnectTelegram(prefix, slug), 'Telegram отключён.');
  };

  return (
    <div className="grid gap-3" data-testid="telegram-connect">
      <p aria-live="polite" role="status" className="sr-only" data-testid="telegram-announce">{feedback.announce}</p>
      {feedback.error && <p role="alert" className="text-[14px] text-[#dc2626]" data-testid="telegram-error">{feedback.error}</p>}
      {state.connected ? (
        <Connected focusRef={focus.ref} connectedAt={state.connectedAt} confirming={confirming} busy={pending !== null}
          onAsk={() => setConfirming(true)} onCancel={() => setConfirming(false)} onConfirm={onDisconnect} />
      ) : (
        <NotConnected focusRef={focus.ref} botName={botName} code={codeAlive ? state.code : null}
          expired={Boolean(state.code) && !codeAlive} left={left} copied={copied} busy={pending !== null}
          creating={pending === 'create'} onCreate={onCreate} onCopy={copy} />
      )}
    </div>
  );
}

interface ConnectedProps {
  focusRef: React.RefObject<HTMLHeadingElement>;
  connectedAt: string | null;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function Connected({ focusRef, connectedAt, confirming, busy, onAsk, onCancel, onConfirm }: ConnectedProps) {
  const since = connectedAt ? new Date(connectedAt).toLocaleDateString('ru-RU') : null;
  return (
    <div className="grid gap-3 rounded-md border border-[#16a34a] bg-[#f0fdf4] p-4" data-testid="telegram-connected">
      <h3 ref={focusRef} tabIndex={-1} className="text-[15px] font-semibold">✅ Telegram подключён{since ? ` с ${since}` : ''}</h3>
      <p className="text-[14px]">Новые записи, отмены, переносы и напоминания приходят в чат.</p>
      {confirming ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Подтверждение отключения">
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy} data-testid="telegram-disconnect-confirm">
            Да, отключить
          </button>
          <button type="button" className="h-10 rounded-md border border-[#e5e5e5] bg-white px-4" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="h-10 rounded-md border border-[#e5e5e5] bg-white px-4" onClick={onAsk} disabled={busy} data-testid="telegram-disconnect">
            Отключить
          </button>
        </div>
      )}
    </div>
  );
}

interface NotConnectedProps {
  focusRef: React.RefObject<HTMLHeadingElement>;
  botName: string | null;
  code: string | null;
  expired: boolean;
  left: number;
  copied: boolean;
  busy: boolean;
  creating: boolean;
  onCreate: () => void;
  onCopy: () => void;
}

function NotConnected({ focusRef, botName, code, expired, left, copied, busy, creating, onCreate, onCopy }: NotConnectedProps) {
  const link = deepLink(botName, code);
  const createLabel = code || expired ? 'Создать новый код' : 'Получить код';
  return (
    <div className="grid gap-3" data-testid="telegram-not-connected">
      <ol className="grid list-decimal gap-1 pl-5 text-[14px]">
        <li>Нажмите «{createLabel}».</li>
        <li>Откройте бота{botName ? <> <b>@{botName}</b></> : null} и отправьте ему команду с кодом — или нажмите «Открыть в Telegram».</li>
        <li>Страница сама покажет «Подключено», когда бот примет код.</li>
      </ol>
      {code && (
        <div className="grid gap-2 rounded-md border border-[#e5e5e5] bg-white p-4" data-testid="telegram-code-block">
          <h3 ref={focusRef} tabIndex={-1} className="text-[15px] font-semibold">Ваш код</h3>
          <p className="text-[14px]">
            <code className="select-all text-[18px] font-semibold tracking-wider" data-testid="telegram-code">/start {code}</code>
          </p>
          <p className="text-[13px] text-[#6b6b6b]" aria-live="off">
            Действует ещё <span data-testid="telegram-ttl" suppressHydrationWarning>{formatLeft(left)}</span>. Код одноразовый.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-10 rounded-md border border-[#e5e5e5] px-4" onClick={onCopy} data-testid="telegram-copy">
              {copied ? 'Скопировано' : 'Скопировать команду'}
            </button>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="btn-primary" data-testid="telegram-deeplink">
                Открыть в Telegram
              </a>
            )}
          </div>
          <p className="text-[13px] text-[#6b6b6b]">Ждём подтверждения от бота…</p>
        </div>
      )}
      {expired && <p className="text-[14px] text-[#dc2626]" data-testid="telegram-expired">Код истёк. Создайте новый.</p>}
      <div>
        <button type="button" className="btn-primary" onClick={onCreate} disabled={busy} aria-busy={creating} data-testid="telegram-create">
          {creating ? 'Создаём…' : createLabel}
        </button>
      </div>
    </div>
  );
}
