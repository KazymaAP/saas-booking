// tests/unit/panel-pure.test.ts — чистые модули кабинета: CSV, чек-лист, разделы и роли, статусы, фото, время, команда.
import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell, exportFilename, type ExportBooking } from '../../../app/[prefix]/[slug]/panel/export/csv';
import { buildChecklist, progressPercent } from '../../../app/[prefix]/[slug]/panel/(protected)/_lib/onboarding';
import { SECTIONS, isActiveSection, sectionHref, visibleSections } from '../../../app/[prefix]/[slug]/panel/(protected)/_lib/sections';
import { availableActions, canApply, isActiveStatus, isBookingAction } from '../../../app/[prefix]/[slug]/panel/(protected)/bookings/status';
import { altForIndex, isOwnPhotoPath, remainingSlots, sourceFileError, uploadFileError } from '../../../app/[prefix]/[slug]/panel/(protected)/photos/rules';
import { businessDayStart, DAY_MS } from '../../../app/[prefix]/[slug]/panel/(protected)/_lib/time';
import { callAction } from '../../../app/[prefix]/[slug]/panel/(protected)/_lib/client-action';
import { zodFieldErrors } from '../../../app/[prefix]/[slug]/panel/(protected)/_lib/result';
import { confirmationMatches } from '../../../app/[prefix]/[slug]/panel/(protected)/data/rules';
import { InviteSchema, canRemove, managersCount } from '../../../app/[prefix]/[slug]/panel/(protected)/team/schema';
import { PaidSchema } from '../../../app/[prefix]/[slug]/panel/(protected)/subscription/schema';
import { mergeTexts, TextsSchema } from '../../../app/[prefix]/[slug]/panel/(protected)/texts/schema';
import { ServiceSchema, formatDuration, formatPrice } from '../../../app/[prefix]/[slug]/panel/(protected)/services/schema';

const B = '11111111-1111-4111-8111-111111111111';
const U = '33333333-3333-4333-8333-333333333333';

describe('export/csv', () => {
  it('экранирует ; кавычки и переводы строк', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('CSV-инъекция: формула превращается в текст', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+79991234567')).toBe("'+79991234567");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });

  it('числа без кавычек, NaN — пусто', () => {
    expect(csvCell(1500)).toBe('1500');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('BOM, заголовок, CRLF, удалённая услуга', () => {
    const row: ExportBooking = {
      scheduled_at: '2026-10-20T07:00:00Z', status: 'new', client_name: 'Анна', client_phone: '+79990000000',
      client_email: null, comment: null, created_at: '2026-10-19T07:00:00Z', services: null,
    };
    const csv = buildCsv([row], { date: () => '20.10.2026', time: () => '10:00', status: () => 'Новая' });
    expect(csv.startsWith('\uFEFFДата;Время;Статус')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('Услуга удалена');
    expect(csv).toContain("'+79990000000");
  });

  it('имя файла безопасно для заголовка', () => {
    expect(exportFilename('my-studio', new Date('2026-10-15T10:00:00Z'))).toBe('bookings-my-studio-2026-10-15.csv');
    expect(exportFilename('"; x', new Date('2026-10-15T10:00:00Z'))).toBe('bookings-x-2026-10-15.csv');
    expect(exportFilename('', new Date('2026-10-15T10:00:00Z'))).toBe('bookings-business-2026-10-15.csv');
  });
});

describe('_lib/onboarding', () => {
  const empty = { activeServices: 0, photos: 0, business: { address: null, phones: [], working_hours: null } };

  it('пустой бизнес — 0%', () => {
    const items = buildChecklist(empty);
    expect(items).toHaveLength(4);
    expect(progressPercent(items)).toBe(0);
  });

  it('каждый пункт — 25%', () => {
    const items = buildChecklist({ ...empty, activeServices: 1, photos: 2 });
    expect(progressPercent(items)).toBe(50);
  });

  it('адрес из пробелов не засчитывается; адрес + телефон — да', () => {
    expect(buildChecklist({ ...empty, business: { ...empty.business, address: '  ', phones: ['+7'] } })[2]?.done).toBe(false);
    expect(buildChecklist({ ...empty, business: { ...empty.business, address: 'ул. 1', phones: ['+7'] } })[2]?.done).toBe(true);
  });

  it('пустой список — 100%', () => {
    expect(progressPercent([])).toBe(100);
  });
});

describe('_lib/sections — роли', () => {
  it('manager не видит биллинг, настройки, оформление, команду, данные', () => {
    const keys = visibleSections('manager').map((s) => s.key);
    for (const k of ['settings', 'appearance', 'subscription', 'team', 'data'] as const) expect(keys).not.toContain(k);
    expect(keys).toContain('bookings');
  });

  it('owner видит все разделы', () => {
    expect(visibleSections('owner')).toHaveLength(SECTIONS.length);
  });

  it('активный раздел: дашборд — только точно, остальные — по префиксу', () => {
    const base = '/s/x/panel';
    const home = { path: '' };
    const bookings = { path: 'bookings' };
    expect(isActiveSection('/s/x/panel', base, home)).toBe(true);
    expect(isActiveSection('/s/x/panel/', base, home)).toBe(true);
    expect(isActiveSection('/s/x/panel/bookings', base, home)).toBe(false);
    expect(isActiveSection('/s/x/panel/bookings/1', base, bookings)).toBe(true);
    expect(isActiveSection('/s/x/panel/bookingsx', base, bookings)).toBe(false);
    expect(sectionHref(base, home)).toBe(base);
  });
});

describe('bookings/status', () => {
  it('переходы', () => {
    expect(availableActions('new')).toEqual(['confirm', 'done', 'no_show', 'cancel']);
    expect(availableActions('confirmed')).toEqual(['done', 'no_show', 'cancel']);
    expect(availableActions('cancelled')).toEqual([]);
    expect(canApply('confirm', 'confirmed')).toBe(false);
    expect(isActiveStatus('done')).toBe(false);
    expect(isActiveStatus('new')).toBe(true);
    expect(isBookingAction('confirm')).toBe(true);
    expect(isBookingAction('drop')).toBe(false);
  });
});

describe('photos/rules', () => {
  it('исходник и загружаемый файл', () => {
    expect(sourceFileError({ type: 'image/gif', size: 1 })).toBeTruthy();
    expect(sourceFileError({ type: 'image/jpeg', size: 0 })).toBeTruthy();
    expect(sourceFileError({ type: 'image/jpeg', size: 26 * 1024 * 1024 })).toBeTruthy();
    expect(sourceFileError({ type: 'image/jpeg', size: 10 * 1024 * 1024 })).toBeNull();
    expect(uploadFileError({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
    expect(uploadFileError({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBeTruthy();
  });

  it('путь только в папке своего бизнеса, без ../', () => {
    expect(isOwnPhotoPath(`${B}/${U}.jpg`, B)).toBe(true);
    expect(isOwnPhotoPath(`${U}/${U}.jpg`, B)).toBe(false);
    expect(isOwnPhotoPath(`${B}/../${U}.jpg`, B)).toBe(false);
    expect(isOwnPhotoPath(`${B}/${U}.gif`, B)).toBe(false);
  });

  it('лимит и подписи пачки', () => {
    expect(remainingSlots(48)).toBe(2);
    expect(remainingSlots(60)).toBe(0);
    expect(altForIndex(' Маникюр ', 0)).toBe('Маникюр');
    expect(altForIndex('Маникюр', 2)).toBe('Маникюр (3)');
    expect(altForIndex('x'.repeat(200), 1).length).toBeLessThanOrEqual(120);
  });
});

describe('_lib/time', () => {
  it('начало дня по Москве, а не по UTC', () => {
    // 2026-10-15 22:30 UTC = 16 октября 01:30 МСК → начало дня 15 окт 21:00 UTC.
    expect(new Date(businessDayStart(Date.UTC(2026, 9, 15, 22, 30))).toISOString()).toBe('2026-10-15T21:00:00.000Z');
    expect(new Date(businessDayStart(Date.UTC(2026, 9, 15, 10, 0))).toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(DAY_MS).toBe(86_400_000);
  });
});

describe('_lib/client-action', () => {
  it('повтор при сетевой ошибке, затем успех', async () => {
    let n = 0;
    const r = await callAction(async () => {
      n += 1;
      if (n === 1) throw new TypeError('Failed to fetch');
      return { ok: true as const };
    });
    expect(r.ok).toBe(true);
    expect(n).toBe(2);
  });

  it('две сетевые ошибки → понятный текст', async () => {
    const r = await callAction(async () => { throw new TypeError('offline'); }, 1);
    expect(r).toMatchObject({ ok: false });
  });

  it('служебные ошибки Next (digest) пробрасываются', async () => {
    const err = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;/x' });
    await expect(callAction(async () => { throw err; })).rejects.toBe(err);
  });

  it('бизнес-ошибку не повторяем', async () => {
    let n = 0;
    await callAction(async () => { n += 1; return { ok: false as const, error: 'x' }; });
    expect(n).toBe(1);
  });
});

describe('схемы форм', () => {
  it('zodFieldErrors — первая ошибка на поле', () => {
    const r = ServiceSchema.safeParse({ name: '', price: 'x', duration_minutes: '1', description: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(zodFieldErrors(r.error)).sort()).toEqual(['duration_minutes', 'name', 'price']);
  });

  it('услуга: форматирование', () => {
    expect(formatPrice(0)).toBe('Бесплатно');
    expect(formatDuration(90)).toBe('1 ч 30 мин');
    expect(formatDuration(45)).toBe('45 мин');
    expect(formatDuration(120)).toBe('2 ч');
  });

  it('тексты: лимиты и слияние', () => {
    expect(TextsSchema.safeParse({ hero_title: 'x'.repeat(121), hero_subtitle: '', about: '', cta: '' }).success).toBe(false);
    expect(mergeTexts(null, { hero_title: '', hero_subtitle: 'a', about: '', cta: '' })).toEqual({ hero_subtitle: 'a' });
  });

  it('приглашение: email нормализуется', () => {
    expect(InviteSchema.parse({ email: '  Ivan@Mail.RU ' })).toEqual({ email: 'ivan@mail.ru' });
    expect(InviteSchema.safeParse({ email: 'ivan@' }).success).toBe(false);
    expect(InviteSchema.safeParse({ email: '' }).success).toBe(false);
  });

  it('команда: владельца не удалить, подсчёт менеджеров', () => {
    const owner = { id: '1', email: 'a', role: 'owner' as const };
    const manager = { id: '2', email: 'b', role: 'manager' as const };
    expect(canRemove(owner)).toBe(false);
    expect(canRemove(manager)).toBe(true);
    expect(managersCount([owner, manager])).toBe(1);
  });

  it('оплата: сумма с пробелами, без букв', () => {
    expect(PaidSchema.parse({ amount: '2 500', comment: '' }).amount).toBe('2500');
    expect(PaidSchema.safeParse({ amount: '25,5', comment: '' }).success).toBe(false);
    expect(PaidSchema.safeParse({ amount: '1234567890', comment: '' }).success).toBe(false);
  });

  it('удаление: подтверждение без учёта регистра и пробелов', () => {
    expect(confirmationMatches(' My-Studio ', 'my-studio')).toBe(true);
    expect(confirmationMatches('my-studi', 'my-studio')).toBe(false);
  });
});

describe('_lib/color — контраст акцента', () => {
  it('тёмный цвет не меняется', async () => {
    const { accentColor } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/color');
    expect(accentColor('#1d4ed8')).toBe('#1d4ed8');
  });

  it('светлый цвет затемняется до 4.5:1', async () => {
    const { accentColor, contrastWithWhite, MIN_CONTRAST } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/color');
    for (const c of ['#facc15', '#a7f3d0', '#ffffff', '#FF9900']) {
      expect(contrastWithWhite(accentColor(c))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('мусор → цвет по умолчанию', async () => {
    const { accentColor, DEFAULT_ACCENT } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/color');
    expect(accentColor(null)).toBe(DEFAULT_ACCENT);
    expect(accentColor('red')).toBe(DEFAULT_ACCENT);
    expect(accentColor('#12345')).toBe(DEFAULT_ACCENT);
  });
});

describe('_lib/subscription', () => {
  const now = Date.UTC(2026, 9, 15, 12, 0);
  const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString();

  it('статусы по сроку', async () => {
    const { subscriptionStatus } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/subscription');
    expect(subscriptionStatus(true, inDays(30), now).tone).toBe('ok');
    expect(subscriptionStatus(true, inDays(3), now)).toMatchObject({ tone: 'warn', label: 'Скоро закончится' });
    expect(subscriptionStatus(true, inDays(-1), now).tone).toBe('bad');
    expect(subscriptionStatus(false, inDays(10), now).tone).toBe('bad');
    expect(subscriptionStatus(true, null, now).tone).toBe('ok');
    expect(subscriptionStatus(false, null, now).label).toBe('Не активна');
  });

  it('отметка в меню только когда нужно внимание', async () => {
    const { subscriptionAttention } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/subscription');
    expect(subscriptionAttention(true, inDays(30), now)).toBeNull();
    expect(subscriptionAttention(true, inDays(2), now)).toBe('скоро закончится');
  });
});

describe('bookings/status — отметки визита только после начала', () => {
  it('до начала записи нет «Выполнено» и «Не пришёл»', async () => {
    const { availableActions } = await import('../../../app/[prefix]/[slug]/panel/(protected)/bookings/status');
    expect(availableActions('new', false)).toEqual(['confirm', 'cancel']);
    expect(availableActions('confirmed', false)).toEqual(['cancel']);
    expect(availableActions('confirmed', true)).toEqual(['done', 'no_show', 'cancel']);
    expect(availableActions('done', false)).toEqual([]);
  });

  it('toBookingRow отдаёт начало записи в мс', async () => {
    const { toBookingRow } = await import('../../../app/[prefix]/[slug]/panel/(protected)/bookings/rows');
    const row = toBookingRow({ id: U, scheduled_at: '2026-10-20T07:00:00Z', status: 'new', client_name: null, client_phone: null, comment: null, services: null });
    expect(row.starts_at).toBe(Date.UTC(2026, 9, 20, 7, 0));
    expect(row.service).toBe('Услуга удалена');
  });
});

describe('_lib/tips', () => {
  it('ключ подсказки: версия, slug в нижнем регистре, имя подсказки', async () => {
    const { tipStorageKey, TIP_PREFIX } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/tips');
    expect(tipStorageKey(' My-Studio ', 'photos')).toBe(`${TIP_PREFIX}:my-studio:photos`);
    expect(tipStorageKey('a', 'dashboard')).not.toBe(tipStorageKey('b', 'dashboard'));
  });
});

describe('bookings/tel', () => {
  it('tel: только из цифр, «+» сохраняется, мусор — без ссылки', async () => {
    const { telHref } = await import('../../../app/[prefix]/[slug]/panel/(protected)/bookings/tel');
    expect(telHref('+7 (999) 123-45-67')).toBe('tel:+79991234567');
    expect(telHref('8 999 123 45 67')).toBe('tel:89991234567');
    expect(telHref('нет')).toBeNull();
  });
});

describe('bookings/view — группы по дням и поиск', () => {
  // 15 октября 2026, 12:00 МСК.
  const now = Date.UTC(2026, 9, 15, 9, 0);
  const row = (id: string, isoUtc: string, patch: Record<string, unknown> = {}) => ({
    id, when: '', starts_at: Date.parse(isoUtc), status: 'new' as const,
    client_name: 'Анна', client_phone: '+7 (999) 123-45-67', comment: null, service: 'Маникюр', ...patch,
  });

  it('dayTitle: сегодня / завтра / вчера по Москве, а не по UTC', async () => {
    const { dayTitle } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/time');
    expect(dayTitle(Date.UTC(2026, 9, 15, 20, 30), now)).toBe('Сегодня'); // 23:30 МСК
    expect(dayTitle(Date.UTC(2026, 9, 15, 21, 30), now)).toBe('Завтра'); // 00:30 МСК 16-го, в UTC ещё 15-е
    expect(dayTitle(Date.UTC(2026, 9, 14, 10, 0), now)).toBe('Вчера');
    expect(dayTitle(Date.UTC(2026, 9, 21, 10, 0), now)).toMatch(/21 октября/);
  });

  it('groupByDay сохраняет порядок и склеивает соседние строки одного дня', async () => {
    const { groupByDay } = await import('../../../app/[prefix]/[slug]/panel/(protected)/bookings/view');
    const groups = groupByDay([
      row('a', '2026-10-15T10:00:00Z'), row('b', '2026-10-15T15:00:00Z'), row('c', '2026-10-15T22:00:00Z'),
    ], now);
    expect(groups.map((g) => [g.title, g.rows.map((r) => r.id)])).toEqual([['Сегодня', ['a', 'b']], ['Завтра', ['c']]]);
    expect(groupByDay([], now)).toEqual([]);
  });

  it('matchesQuery: имя, услуга, телефон по цифрам; короткие цифры телефон не ищут', async () => {
    const { matchesQuery } = await import('../../../app/[prefix]/[slug]/panel/(protected)/bookings/view');
    const r = row('a', '2026-10-15T10:00:00Z');
    expect(matchesQuery(r, '')).toBe(true);
    expect(matchesQuery(r, '  анна ')).toBe(true);
    expect(matchesQuery(r, 'МАНИК')).toBe(true);
    expect(matchesQuery(r, '999 123')).toBe(true);
    expect(matchesQuery(r, '99')).toBe(false);
    expect(matchesQuery(row('b', '2026-10-15T10:00:00Z', { client_name: null, client_phone: null }), '999')).toBe(false);
  });
});

describe('texts/schema — очистка вставленного текста', () => {
  it('однострочные поля: переносы и лишние пробелы схлопываются, мусорные символы убираются', () => {
    const r = TextsSchema.parse({ hero_title: '  Студия\n  красоты\u200B ', hero_subtitle: '', about: '', cta: 'За\u0007писаться' });
    expect(r.hero_title).toBe('Студия красоты');
    expect(r.cta).toBe('Записаться');
  });

  it('многострочные: не больше одной пустой строки подряд, CRLF → LF', () => {
    const r = TextsSchema.parse({ hero_title: '', hero_subtitle: '', about: 'Абзац 1  \r\n\r\n\r\n\r\nАбзац 2', cta: '' });
    expect(r.about).toBe('Абзац 1\n\nАбзац 2');
  });

  it('лимит считается после очистки', () => {
    expect(TextsSchema.safeParse({ hero_title: '', hero_subtitle: '', about: '', cta: `${'а'.repeat(30)}   \n` }).success).toBe(true);
    expect(TextsSchema.safeParse({ hero_title: '', hero_subtitle: '', about: '', cta: 'а'.repeat(31) }).success).toBe(false);
  });
});

describe('settings/schema', () => {
  const hours = { mon: '09:00-18:00', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' };
  const base = {
    name: 'Студия', description: '', city: '', address: '', phones: '', emails: '', brand_color: '#111111', hours,
    slot_step_minutes: '60', cancel_hours_before: '2', min_hours_before: '1', max_days_ahead: '30', auto_confirm: false,
  };

  it('телефоны: дубли в разном формате схлопываются, больше 3 — ошибка, кривой — с текстом номера', async () => {
    const { SettingsSchema } = await import('../../../app/[prefix]/[slug]/panel/(protected)/settings/schema');
    expect(SettingsSchema.parse({ ...base, phones: '8 (999) 123-45-67; +7 999 1234567' }).phones).toEqual(['+79991234567']);
    expect(SettingsSchema.safeParse({ ...base, phones: '89990000001, 89990000002, 89990000003, 89990000004' }).success).toBe(false);
    const bad = SettingsSchema.safeParse({ ...base, phones: '123' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toContain('«123»');
  });

  it('email: нижний регистр, дубли, неверный формат', async () => {
    const { SettingsSchema } = await import('../../../app/[prefix]/[slug]/panel/(protected)/settings/schema');
    expect(SettingsSchema.parse({ ...base, emails: 'A@B.ru, a@b.ru' }).emails).toEqual(['a@b.ru']);
    expect(SettingsSchema.safeParse({ ...base, emails: 'a@b' }).success).toBe(false);
  });

  it('шаг записи только из списка, цвет только #RRGGBB', async () => {
    const { SettingsSchema } = await import('../../../app/[prefix]/[slug]/panel/(protected)/settings/schema');
    expect(SettingsSchema.safeParse({ ...base, slot_step_minutes: '45' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...base, brand_color: 'red' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...base, max_days_ahead: '0' }).success).toBe(false);
  });

  it('toSettingsForm: кривой brand_color из БД не ломает форму', async () => {
    const { toSettingsForm } = await import('../../../app/[prefix]/[slug]/panel/(protected)/settings/schema');
    const b = { name: 'X', description: null, city: null, address: null, phones: ['+79991234567'], emails: [], brand_color: 'blue',
      working_hours: { mon: [{ open: '09:00', close: '18:00' }] }, slot_step_minutes: 30, cancel_hours_before: 2, min_hours_before: 1,
      max_days_ahead: 30, auto_confirm: true };
    const f = toSettingsForm(b as unknown as Parameters<typeof toSettingsForm>[0]);
    expect(f.brand_color).toBe('#111111');
    expect(f.hours.mon).toBe('09:00-18:00');
    expect(f.hours.sun).toBe('');
    expect(f.phones).toBe('+79991234567');
  });
});

describe('_lib/busy — занятые строки списка', () => {
  it('добавление и снятие не затрагивают другие строки', async () => {
    const { withBusy, withoutBusy } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/busy');
    const a = withBusy(new Set(), 'a');
    const ab = withBusy(a, 'b');
    // Ответ по «a» пришёл раньше — «b» остаётся занятой (раньше один busyId сбрасывал обе).
    const b = withoutBusy(ab, 'a');
    expect([...b]).toEqual(['b']);
    expect(withoutBusy(b, 'b').size).toBe(0);
  });

  it('без изменений возвращает тот же набор (лишнего рендера нет)', async () => {
    const { withBusy, withoutBusy } = await import('../../../app/[prefix]/[slug]/panel/(protected)/_lib/busy');
    const s = withBusy(new Set(), 'a');
    expect(withBusy(s, 'a')).toBe(s);
    expect(withoutBusy(s, 'zzz')).toBe(s);
  });
});

describe('custom_texts — служебные ключи', () => {
  // Выбор стиля кабинета/сайта и тексты сайта лежат в одном jsonb-поле. Сохранение текстов
  // не должно сбрасывать оформление, а сохранение стиля — затирать тексты.
  it('сохранение текстов оставляет _panel_theme и _site_theme', () => {
    const current = { _panel_theme: 'photographer', _site_theme: 'beauty', hero_title: 'Старый', custom_note: 'не трогать' };
    const next = mergeTexts(current, { hero_title: 'Новый', hero_subtitle: '', about: '', cta: '' });
    expect(next).toEqual({ _panel_theme: 'photographer', _site_theme: 'beauty', hero_title: 'Новый', custom_note: 'не трогать' });
  });

  it('пустой заголовок удаляет только свой ключ', () => {
    const current = { _panel_theme: 'detailing', hero_title: 'Старый', about: 'О нас' };
    const next = mergeTexts(current, { hero_title: '', hero_subtitle: '', about: '', cta: '' });
    expect(next).toEqual({ _panel_theme: 'detailing' });
  });
});
