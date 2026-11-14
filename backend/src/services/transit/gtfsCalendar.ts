import { ServiceDate, type TransitDigest } from '../../../../shared/src/schemas/transit';

export function shiftDate(date: string, days: number): string {
  ServiceDate.parse(date);
  const d = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}
export function parseGtfsTime(value: string): number {
  if (!/^\d{1,3}:\d{2}:\d{2}$/.test(value)) throw new Error(`Invalid GTFS time: ${value}`);
  const [h, m, s] = value.split(':').map(Number) as [number, number, number];
  if (h > 167 || m > 59 || s > 59) throw new Error(`Unsupported GTFS time: ${value}`);
  return h * 3600 + m * 60 + s;
}
function parts(at: number, timezone: string): Record<string, number> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}
function utc(year: number, month: number, day: number, hour: number, minute = 0, second = 0) {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day); d.setUTCHours(hour, minute, second, 0);
  return d.valueOf();
}
export function localServiceDate(at: number, timezone: string): string {
  const p = parts(at, timezone);
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}
/** GTFS zero = local noon minus twelve elapsed hours, including DST transition days. */
export function serviceDayEpoch(date: string, timezone: string): number {
  ServiceDate.parse(date);
  const noon = utc(Number(date.slice(0, 4)), Number(date.slice(4, 6)), Number(date.slice(6, 8)), 12);
  let instant = noon;
  for (let i = 0; i < 4; i++) {
    const p = parts(instant, timezone);
    const represented = utc(p.year!, p.month!, p.day!, p.hour!, p.minute!, p.second!);
    const delta = noon - represented;
    instant += delta;
    if (delta === 0) return instant - 43200000;
  }
  throw new Error('Timezone has no resolvable local noon');
}
export function createServiceCalendar(digest: TransitDigest) {
  const calendars = new Map(digest.calendars.map((c) => [c.serviceId, c]));
  const exceptions = new Map(digest.exceptions.map((e) => [`${e.serviceId}:${e.date}`, e.type]));
  return (serviceId: string, date: string): boolean => {
    const exception = exceptions.get(`${serviceId}:${date}`);
    if (exception !== undefined) return exception === 1;
    const calendar = calendars.get(serviceId);
    if (!calendar || date < calendar.startDate || date > calendar.endDate) return false;
    const day = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`).getUTCDay();
    return calendar.weekdays[(day + 6) % 7]!;
  };
}
