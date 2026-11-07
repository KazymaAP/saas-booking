// components/Analytics.test.ts — Vitest: клиентский pixel без DOM-окружения (jsdom не добавляем — новые зависимости
// запрещены). navigator/window/document подменяются минимальными заглушками через vi.stubGlobal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACK_ENDPOINT, isTrackingDisabled, sendAnalyticsEvent } from './Analytics';

const BUSINESS_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

type Sent = { url: string; body: string };

const beaconMock = vi.fn<(url: string, data: Blob) => boolean>();
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function stubBrowser(nav: Record<string, unknown> = {}, opts: { referrer?: string; win?: Record<string, unknown> } = {}): void {
  vi.stubGlobal('navigator', { sendBeacon: beaconMock, ...nav });
  vi.stubGlobal('window', { location: { pathname: '/s/salon' }, ...opts.win });
  vi.stubGlobal('document', { referrer: opts.referrer ?? '' });
  vi.stubGlobal('fetch', fetchMock);
}

async function sentPayloads(): Promise<Sent[]> {
  return Promise.all(beaconMock.mock.calls.map(async ([url, blob]) => ({ url, body: await blob.text() })));
}

beforeEach(() => {
  beaconMock.mockReset().mockReturnValue(true);
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isTrackingDisabled', () => {
  it('DNT в любом из вариантов браузеров и GPC отключают трекинг', () => {
    const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ doNotTrack: '1' }, {}],
      [{ msDoNotTrack: '1' }, {}],
      [{}, { doNotTrack: 'yes' }],
      [{ globalPrivacyControl: true }, {}],
    ];
    for (const [nav, win] of cases) {
      stubBrowser(nav, { win });
      expect(isTrackingDisabled()).toBe(true);
    }
  });

  it('без сигналов приватности трекинг включён; на сервере (нет navigator) — выключен', () => {
    stubBrowser({ doNotTrack: '0' });
    expect(isTrackingDisabled()).toBe(false);
    vi.stubGlobal('navigator', undefined);
    expect(isTrackingDisabled()).toBe(true);
  });
});

describe('sendAnalyticsEvent', () => {
  it('sendBeacon text/plain на /api/track/page, путь без query, без PII', async () => {
    stubBrowser({}, { referrer: 'https://yandex.ru/search/?text=x' });
    sendAnalyticsEvent('pageview', BUSINESS_ID);
    const [sent] = await sentPayloads();
    expect(sent?.url).toBe(TRACK_ENDPOINT);
    expect(beaconMock.mock.calls[0]?.[1].type).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(sent?.body ?? '{}')).toEqual({
      business_id: BUSINESS_ID, event: 'pageview', path: '/s/salon', referrer: 'https://yandex.ru/search/?text=x',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('реферер уходит только с первым просмотром документа (клиентская навигация его не дублирует)', async () => {
    // Свежий экземпляр модуля: флаг «реферер отправлен» живёт в памяти модуля.
    vi.resetModules();
    const fresh = await import('./Analytics');
    stubBrowser({}, { referrer: 'https://google.com/' });
    fresh.sendAnalyticsEvent('pageview', BUSINESS_ID);
    fresh.sendAnalyticsEvent('phone_click', BUSINESS_ID);
    fresh.sendAnalyticsEvent('pageview', BUSINESS_ID);
    const referrers = (await sentPayloads()).map((s) => (JSON.parse(s.body) as { referrer: string | null }).referrer);
    expect(referrers).toEqual(['https://google.com/', null, null]);
  });

  it('DNT → ничего не отправляется', () => {
    stubBrowser({ doNotTrack: '1' });
    sendAnalyticsEvent('pageview', BUSINESS_ID);
    expect(beaconMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendBeacon недоступен или отказал → fetch keepalive без ожидания', () => {
    beaconMock.mockReturnValue(false);
    stubBrowser();
    sendAnalyticsEvent('map_open', null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(TRACK_ENDPOINT);
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'same-origin' });
  });

  it('сетевой сбой фолбэка не бросает исключение', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    stubBrowser({ sendBeacon: undefined });
    expect(() => sendAnalyticsEvent('booking_open', BUSINESS_ID)).not.toThrow();
    await Promise.resolve();
  });
});
