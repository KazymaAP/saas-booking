'use client';
// components/Analytics.tsx — pixel аналитики на публичных страницах (ТЗ 4.0 §12.3).
// Не влияет на LCP: ничего не рендерит, отправка откладывается до показа страницы и простоя браузера (requestIdleCallback)
// и уходит через navigator.sendBeacon — запрос не блокирует ни рендер, ни выгрузку страницы.
// Do Not Track / Global Privacy Control → не отправляем ничего.
import { useEffect } from 'react';

export const TRACK_ENDPOINT = '/api/track/page';
// Запасной таймаут, если браузер не поддерживает requestIdleCallback (Safari).
const IDLE_FALLBACK_MS = 1500;
const IDLE_TIMEOUT_MS = 4000;
// Повторный клик по тому же элементу в течение этого окна — одно событие (двойные клики, дребезг тач-экранов).
const CLICK_DEDUPE_MS = 1000;
const INTERACTIVE_EVENTS = ['map_open', 'booking_open', 'phone_click', 'booking_submit'] as const;
type InteractiveEvent = (typeof INTERACTIVE_EVENTS)[number];

// Внешний реферер отправляется один раз за загрузку документа: при клиентской навигации Next document.referrer
// не меняется, и без флага каждый следующий pageview приписывался бы тому же источнику. Флаг живёт в памяти модуля,
// без localStorage/cookie — это не идентификатор.
let referrerSent = false;

export type ClientAnalyticsEvent = 'pageview' | 'booking_open' | 'booking_submit' | 'phone_click' | 'map_open' | 'preview_view';

type Props = {
  businessId: string | null;
  // Событие при показе страницы: pageview для сайта, preview_view для прототипа.
  event?: Extract<ClientAnalyticsEvent, 'pageview' | 'preview_view'>;
};

type NavigatorPrivacy = Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
type WindowPrivacy = Window & { doNotTrack?: string };

export function isTrackingDisabled(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as NavigatorPrivacy;
  const dnt = nav.doNotTrack ?? (window as WindowPrivacy).doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes' || nav.globalPrivacyControl === true;
}

// Отправка одного события. Тип text/plain — «простой» запрос без CORS-preflight.
// Внешний реферер берём только при первом показе (document.referrer), дальше сервер сам отрежет внутренние.
export function sendAnalyticsEvent(event: ClientAnalyticsEvent, businessId: string | null): void {
  if (isTrackingDisabled()) return;
  const isView = event === 'pageview' || event === 'preview_view';
  const referrer = isView && !referrerSent ? document.referrer || null : null;
  if (isView) referrerSent = true;
  const payload = JSON.stringify({ business_id: businessId, event, path: window.location.pathname, referrer });
  const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(TRACK_ENDPOINT, blob)) return;
  // Фолбэк без ожидания ответа: keepalive переживает уход со страницы.
  fetch(TRACK_ENDPOINT, { method: 'POST', body: blob, keepalive: true, credentials: 'same-origin' }).catch(() => undefined);
}

function whenIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
}

// Pageview только для страницы, которую человек реально увидел: вкладки, открытые в фоне (Ctrl+клик),
// и prerender (Speculation Rules) считаются в момент первого показа, а не загрузки. Иначе просмотры завышены.
function whenVisible(cb: () => void): () => void {
  if (document.visibilityState === 'visible') {
    cb();
    return () => undefined;
  }
  const onChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', onChange);
    cb();
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

// Показ → простой браузера → отправка. Отмена снимает и ожидание видимости, и idle-колбэк.
function scheduleView(cb: () => void): () => void {
  let cancelIdle: () => void = () => undefined;
  const cancelVisible = whenVisible(() => {
    cancelIdle = whenIdle(cb);
  });
  return () => {
    cancelVisible();
    cancelIdle();
  };
}

function isInteractiveEvent(value: string | null | undefined): value is InteractiveEvent {
  return typeof value === 'string' && (INTERACTIVE_EVENTS as readonly string[]).includes(value);
}

// Делегированные клики: телефон (tel:) и размеченные элементы (data-analytics="map_open" и т. п.) без правок шаблонов.
function eventFromClick(target: EventTarget | null): { event: InteractiveEvent; el: Element } | null {
  if (!(target instanceof Element)) return null;
  const marked = target.closest('[data-analytics]');
  const value = marked?.getAttribute('data-analytics');
  // booking_submit по клику не считаем: только по событию submit формы (кнопка может не отправить невалидную форму).
  if (marked && isInteractiveEvent(value) && value !== 'booking_submit') return { event: value, el: marked };
  const tel = target.closest('a[href^="tel:"]');
  return tel ? { event: 'phone_click', el: tel } : null;
}

// Отправка формы записи: <form data-analytics="booking_submit">. submit срабатывает только после валидации браузера.
function eventFromSubmit(target: EventTarget | null): { event: InteractiveEvent; el: Element } | null {
  if (!(target instanceof HTMLFormElement)) return null;
  return target.getAttribute('data-analytics') === 'booking_submit' ? { event: 'booking_submit', el: target } : null;
}

// Фабрика обработчика с дедупликацией по элементу: WeakMap не держит ссылки на удалённые узлы DOM.
function createInteractionHandler(businessId: string | null, pick: (t: EventTarget | null) => { event: InteractiveEvent; el: Element } | null) {
  const lastSent = new WeakMap<Element, number>();
  return function onInteraction(e: Event): void {
    const hit = pick(e.target);
    if (!hit) return;
    const now = Date.now();
    const prev = lastSent.get(hit.el);
    if (prev !== undefined && now - prev < CLICK_DEDUPE_MS) return;
    lastSent.set(hit.el, now);
    sendAnalyticsEvent(hit.event, businessId);
  };
}

export function Analytics({ businessId, event = 'pageview' }: Props) {
  useEffect(() => {
    if (isTrackingDisabled()) return undefined;
    const cancel = scheduleView(() => sendAnalyticsEvent(event, businessId));
    const onClick = createInteractionHandler(businessId, eventFromClick);
    const onSubmit = createInteractionHandler(businessId, eventFromSubmit);
    // capture: событие ловится до обработчиков шаблона, даже если они вызывают stopPropagation.
    document.addEventListener('click', onClick, { capture: true, passive: true });
    document.addEventListener('submit', onSubmit, { capture: true, passive: true });
    return () => {
      cancel();
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('submit', onSubmit, { capture: true });
    };
  }, [businessId, event]);

  return null;
}
