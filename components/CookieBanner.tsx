'use client';
// components/CookieBanner.tsx — баннер согласия на cookie (ТЗ 4.0 §15.6, §4.44).
// 'use client': нужен доступ к localStorage и обработчики кнопок.
// Поведение:
//   ▸ Показывается после гидрации, если выбора нет или он дан к прошлой редакции политики. В SSR-HTML не попадает —
//     не влияет на LCP и не мигает у тех, кто уже выбрал.
//   ▸ Баннер — немодальный диалог внизу экрана: страница остаётся доступной (мышь, клавиатура, скринридер).
//   ▸ «Настройки» — модальный диалог (aria-modal, ловушка фокуса, Escape, возврат фокуса).
//   ▸ «Принять» / сохранение с аналитикой → localStorage + POST в cookie_consents (ошибка — тихо).
//   ▸ «Отклонить» → только localStorage, в журнал не пишется: работают лишь технические cookie.
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  COOKIE_CHANGE_EVENT, COOKIE_CONSENT_API, COOKIE_CONSENT_STORAGE_KEY, COOKIE_POLICY_VERSION, COOKIE_SETTINGS_EVENT,
  needsConsent, parseStoredConsent, type StoredCookieConsent,
} from '@/lib/legal-versions';
import { SITE_URL } from '@/lib/site';

// Абсолютная ссылка: на кастомных доменах клиентов middleware переписывает пути в /domain-site, и относительная
// /privacy туда бы не попала. Политика одна — на домене сервиса.
const PRIVACY_COOKIES_URL = `${SITE_URL}/privacy#cookies`;

type View = 'hidden' | 'banner' | 'settings';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Чтение/запись localStorage: в приватном режиме Safari и при отключённом хранилище бросает исключение.
function readStored(): StoredCookieConsent | null {
  try {
    return parseStoredConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    // Хранилище недоступно — выбор не сохранён, баннер покажется.
    return null;
  }
}

function writeStored(consent: StoredCookieConsent): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Хранилище недоступно: выбор действует до перезагрузки страницы, это допустимо.
  }
  window.dispatchEvent(new CustomEvent<StoredCookieConsent>(COOKIE_CHANGE_EVENT, { detail: consent }));
}

// Запись в журнал согласий. Ошибка сети или БД не должна мешать посетителю (ТЗ: «тихо, не блокировать»).
function reportConsent(): void {
  fetch(COOKIE_CONSENT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accepted: true, policy_version: COOKIE_POLICY_VERSION }),
    keepalive: true,
  }).catch(() => undefined);
}

function useCookieConsent() {
  const [view, setView] = useState<View>('hidden');
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setAnalytics(stored?.analytics ?? false);
    if (needsConsent(stored)) setView('banner');
    const open_settings = () => {
      setAnalytics(readStored()?.analytics ?? false);
      setView('settings');
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, open_settings);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, open_settings);
  }, []);

  const decide = useCallback((allow_analytics: boolean) => {
    const previous = readStored();
    writeStored({ version: COOKIE_POLICY_VERSION, analytics: allow_analytics, decided_at: new Date().toISOString() });
    // В журнал пишем только согласие и только при изменении выбора: повторное «Сохранить» дублей не создаёт.
    if (allow_analytics && !(previous?.analytics && previous.version === COOKIE_POLICY_VERSION)) reportConsent();
    setAnalytics(allow_analytics);
    setView('hidden');
  }, []);

  return { view, setView, analytics, setAnalytics, decide };
}

export function CookieBanner() {
  const { view, setView, analytics, setAnalytics, decide } = useCookieConsent();
  const settings_trigger = useRef<HTMLElement | null>(null);
  // Настройки открыты из самого баннера: при закрытии баннер монтируется заново, и старый узел кнопки уже удалён из DOM.
  // Флаг просит CookieBar сфокусировать свою кнопку «Настройки» после монтирования.
  const [focus_bar_settings, setFocusBarSettings] = useState(false);

  const accept = useCallback(() => decide(true), [decide]);
  const reject = useCallback(() => decide(false), [decide]);
  const save = useCallback(() => decide(analytics), [decide, analytics]);
  const open_settings = useCallback(() => {
    settings_trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setView('settings');
  }, [setView]);
  const close_settings = useCallback(() => {
    // Закрытие без сохранения: если выбора ещё нет — вернуться к баннеру, иначе скрыть.
    const back_to_bar = needsConsent(readStored());
    setView(back_to_bar ? 'banner' : 'hidden');
    const trigger = settings_trigger.current;
    // Кнопка в футере живёт постоянно — фокус возвращаем сразу; кнопка баннера — после его повторного монтирования.
    if (trigger?.isConnected) trigger.focus();
    else setFocusBarSettings(back_to_bar);
  }, [setView]);
  const bar_focused = useCallback(() => setFocusBarSettings(false), []);
  const toggle_analytics = useCallback((event: ChangeEvent<HTMLInputElement>) => setAnalytics(event.target.checked), [setAnalytics]);

  if (view === 'hidden') return null;
  return (
    <>
      <CookieStyles />
      {view === 'settings'
        ? <CookieSettings analytics={analytics} onToggle={toggle_analytics} onSave={save} onAcceptAll={accept} onClose={close_settings} />
        : <CookieBar onAccept={accept} onReject={reject} onSettings={open_settings} focusSettings={focus_bar_settings} onFocused={bar_focused} />}
    </>
  );
}

type BarProps = {
  onAccept: () => void;
  onReject: () => void;
  onSettings: () => void;
  focusSettings: boolean;
  onFocused: () => void;
};

function CookieBar({ onAccept, onReject, onSettings, focusSettings, onFocused }: BarProps) {
  const title_id = useId();
  const text_id = useId();
  const settings_button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!focusSettings) return;
    settings_button.current?.focus();
    onFocused();
  }, [focusSettings, onFocused]);
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={title_id}
      aria-describedby={text_id}
      data-testid="cookie-banner"
      className="cookie-bar"
    >
      <h2 id={title_id} className="cookie-title">Мы используем cookie</h2>
      <p id={text_id} className="cookie-text">
        Технические cookie нужны для работы сайта и включены всегда. Обезличенную статистику посещений включим,
        только если вы согласитесь. <a href={PRIVACY_COOKIES_URL} className="cookie-link">Подробнее в политике</a>.
      </p>
      <div className="cookie-actions">
        <button type="button" onClick={onAccept} className="cookie-btn cookie-btn--primary">Принять</button>
        <button type="button" onClick={onReject} className="cookie-btn">Отклонить</button>
        <button ref={settings_button} type="button" onClick={onSettings} className="cookie-btn cookie-btn--text">Настройки</button>
      </div>
    </div>
  );
}

type SettingsProps = {
  analytics: boolean;
  onToggle: (event: ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onAcceptAll: () => void;
  onClose: () => void;
};

// Ловушка фокуса: Tab/Shift+Tab циклически внутри диалога, Escape закрывает.
function useFocusTrap(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, []);
  return {
    ref,
    onKeyDown: useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }, [onClose]),
  };
}

function CookieSettings({ analytics, onToggle, onSave, onAcceptAll, onClose }: SettingsProps) {
  const title_id = useId();
  const tech_id = useId();
  const analytics_id = useId();
  const trap = useFocusTrap(onClose);
  return (
    <div className="cookie-overlay">
      <div
        ref={trap.ref}
        onKeyDown={trap.onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title_id}
        data-testid="cookie-settings"
        className="cookie-modal"
      >
        <h2 id={title_id} className="cookie-title cookie-title--lg">Настройки cookie</h2>
        <fieldset className="cookie-groups">
          <legend className="cookie-sr-only">Категории cookie</legend>
          <div className="cookie-group">
            <input id={`${tech_id}-input`} type="checkbox" checked disabled aria-describedby={tech_id} className="cookie-check" />
            <div>
              <label htmlFor={`${tech_id}-input`} className="cookie-label">Технические — всегда включены</label>
              <p id={tech_id} className="cookie-hint">Вход в личный кабинет, защита форм, состояние сайта. Без них сайт не работает. Срок — до 30 дней.</p>
            </div>
          </div>
          <div className="cookie-group">
            <input id={`${analytics_id}-input`} type="checkbox" checked={analytics} onChange={onToggle} aria-describedby={analytics_id} className="cookie-check" />
            <div>
              <label htmlFor={`${analytics_id}-input`} className="cookie-label">Статистика посещений</label>
              <p id={analytics_id} className="cookie-hint">Обезличенный подсчёт просмотров страниц. Без рекламы и сторонних счётчиков.</p>
            </div>
          </div>
        </fieldset>
        <p className="cookie-text">
          Редакция политики {COOKIE_POLICY_VERSION}. <a href={PRIVACY_COOKIES_URL} className="cookie-link">Подробнее о cookie</a>.
        </p>
        <div className="cookie-actions">
          <button type="button" onClick={onSave} className="cookie-btn cookie-btn--primary">Сохранить выбор</button>
          <button type="button" onClick={onAcceptAll} className="cookie-btn">Принять все</button>
          <button type="button" onClick={onClose} className="cookie-btn cookie-btn--text">Закрыть</button>
        </div>
      </div>
    </div>
  );
}

// Стили баннера — свои классы с префиксом cookie-, без Tailwind: tailwind.config не сканирует components/**,
// а баннер показывается и на сайтах клиентов, где brand_color может быть светлым (контраст AA не гарантирован).
// Кнопки ≥ 44px (WCAG 2.5.5), видимый фокус, контраст текста ≥ 7:1.
const COOKIE_CSS = `
.cookie-bar { position:fixed; left:0; right:0; bottom:0; z-index:50; box-sizing:border-box; background:#fff; color:#1a1a1a;
  border-top:1px solid #e5e5e5; padding:16px; box-shadow:0 -4px 16px rgba(0,0,0,.08); font-size:15px; line-height:1.45; }
@media (min-width:768px) { .cookie-bar { left:16px; right:auto; bottom:16px; max-width:480px; border:1px solid #e5e5e5; border-radius:12px; } }
.cookie-overlay { position:fixed; inset:0; z-index:50; display:flex; align-items:flex-end; justify-content:center; background:rgba(0,0,0,.4); }
@media (min-width:768px) { .cookie-overlay { align-items:center; padding:16px; } }
.cookie-modal { box-sizing:border-box; width:100%; max-height:90vh; overflow-y:auto; background:#fff; color:#1a1a1a; padding:20px; font-size:15px; line-height:1.45; }
@media (min-width:768px) { .cookie-modal { max-width:520px; border-radius:12px; } }
.cookie-title { margin:0; font-size:16px; font-weight:600; }
.cookie-title--lg { font-size:18px; }
.cookie-text { margin:6px 0 0; font-size:14px; }
.cookie-hint { margin:2px 0 0; font-size:14px; color:#595959; }
.cookie-link { color:inherit; text-decoration:underline; background:none; border:0; padding:0; font:inherit; cursor:pointer; }
.cookie-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.cookie-groups { display:grid; gap:16px; margin:16px 0 0; padding:0; border:0; }
.cookie-group { display:flex; align-items:flex-start; gap:12px; }
.cookie-check { width:20px; height:20px; margin-top:2px; flex-shrink:0; accent-color:#1a1a1a; }
.cookie-label { font-weight:600; }
.cookie-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.cookie-btn { display:inline-flex; align-items:center; justify-content:center; min-height:44px; min-width:44px; box-sizing:border-box;
  padding:10px 16px; border-radius:8px; border:1px solid #1a1a1a; background:#fff; color:#1a1a1a;
  font:inherit; font-size:15px; font-weight:550; cursor:pointer; }
.cookie-btn--primary { background:#1a1a1a; color:#fff; }
.cookie-btn--text { border-color:transparent; text-decoration:underline; }
.cookie-btn:focus-visible, .cookie-link:focus-visible, .cookie-check:focus-visible { outline:3px solid #1a1a1a; outline-offset:2px; }
@media (prefers-reduced-motion:no-preference) { .cookie-bar { animation:cookie-in .2s ease-out; } }
@keyframes cookie-in { from { transform:translateY(8px); opacity:0; } to { transform:none; opacity:1; } }
`;

function CookieStyles() {
  return <style>{COOKIE_CSS}</style>;
}
