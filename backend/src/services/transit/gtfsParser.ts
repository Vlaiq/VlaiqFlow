import { TransitDigest, type TransitFeedMetadata } from '../../../../shared/src/schemas/transit';
import { parseGtfsTime } from './gtfsCalendar';

export interface CsvTable { columns: string[]; rows: Record<string, string>[] }
export type GtfsTables = Record<string, CsvTable>;
const fail = (message: string): never => { throw new Error(`GTFS validation: ${message}`); };
const integer = (v: string, context: string): number => {
  if (!/^\d+$/.test(v)) return fail(`${context}: expected integer, got ${JSON.stringify(v)}`);
  return Number(v);
};
const nullableFlag = (v: string | undefined) => v ? integer(v, 'accessibility flag') : null;
function unique<T>(rows: T[], key: (r: T) => string, context: string) {
  const keys = new Set<string>();
  for (const row of rows) {
    const k = key(row);
    if (keys.has(k)) fail(`${context}: duplicate ${k}`);
    keys.add(k);
  }
  return keys;
}
/** Recheck references on loading a disk snapshot as well as during ingestion. */
export function validateDigest(input: unknown): TransitDigest {
  const d = TransitDigest.parse(input);
  if (d.metadata.validFrom > d.metadata.validUntil) fail('inverted feed validity');
  const agencies = unique(d.metadata.agencies, (x) => x.id, 'agencies');
  if (d.metadata.agencies.some((x) => x.timezone !== d.metadata.timezone)) fail('mixed agency timezones unsupported');
  const stops = new Map(d.stops.map((x) => [x.id, x]));
  unique(d.stops, (x) => x.id, 'stops');
  const routes = unique(d.routes, (x) => x.id, 'routes');
  const trips = unique(d.trips, (x) => x.id, 'trips');
  const services = unique(d.calendars, (x) => x.serviceId, 'calendars');
  unique(d.exceptions, (x) => `${x.serviceId}:${x.date}`, 'calendar exceptions');
  for (const e of d.exceptions) services.add(e.serviceId);
  for (const c of d.calendars) if (c.startDate > c.endDate) fail(`inverted calendar ${c.serviceId}`);
  for (const s of d.stops) {
    if ((s.locationType === 0 || s.locationType === 1 || s.locationType === 2) && !s.coordinate) fail(`missing coordinate ${s.id}`);
    if (s.parentStation) {
      const parent = stops.get(s.parentStation);
      if (!parent || parent.id === s.id || parent.locationType !== (s.locationType === 4 ? 0 : 1)) fail(`invalid parent of ${s.id}`);
    }
    if ((s.locationType === 2 || s.locationType === 3 || s.locationType === 4) && !s.parentStation) fail(`missing parent of ${s.id}`);
    if (s.locationType === 1 && s.parentStation) fail(`station cannot have parent: ${s.id}`);
  }
  for (const r of d.routes) if (!agencies.has(r.agencyId) || !(r.shortName || r.longName)) fail(`invalid route ${r.id}`);
  for (const t of d.trips) if (!routes.has(t.routeId) || !services.has(t.serviceId)) fail(`invalid route/service reference in trip ${t.id}`);
  const byTrip = new Map<string, typeof d.stopTimes>();
  for (const st of d.stopTimes) {
    if (!trips.has(st[0]) || stops.get(st[1])?.locationType !== 0) fail(`invalid stop/trip reference ${st[0]}/${st[1]}`);
    if ((st[3] === null) !== (st[4] === null)) fail(`arrival/departure pair missing ${st[0]}/${st[2]}`);
    const list = byTrip.get(st[0]) ?? [];
    list.push(st); byTrip.set(st[0], list);
  }
  for (const t of d.trips) {
    const list = byTrip.get(t.id);
    if (!list || list.length < 2) fail(`trip has fewer than two stops: ${t.id}`);
    list!.sort((a, b) => a[2] - b[2]);
    if (list![0]![3] === null || list!.at(-1)![4] === null) fail(`untimed trip endpoint: ${t.id}`);
    let previousSequence = -1, previousTime = -1;
    for (const st of list!) {
      if (st[2] <= previousSequence) fail(`duplicate stop sequence in ${t.id}`);
      previousSequence = st[2];
      if (st[3] !== null && st[4] !== null) {
        if (st[3] < previousTime || st[4] < st[3]) fail(`time order in ${t.id}/${st[2]}`);
        previousTime = st[4];
      }
    }
  }
  const counts = d.metadata.validation.counts;
  if (counts.stops !== d.stops.length || counts.routes !== d.routes.length || counts.trips !== d.trips.length || counts.stopTimes !== d.stopTimes.length)
    fail('metadata count mismatch');
  return d;
}

/** CSV quoting/UTF-8/ZIP handling is delegated to Python's maintained standard library. */
export function normalizeGtfs(tables: GtfsTables, provenance: {
  source: string; fetchedAt: string; sha256: string; archiveBytes: number;
  quality?: 'confirmed' | 'simulated';
}): TransitDigest {
  function table(name: string, required: string[], optional = false) {
    const t = tables[name];
    if (!t) { if (optional) return []; return fail(`missing ${name}`); }
    for (const column of required) if (!t.columns.includes(column)) fail(`${name}: missing column ${column}`);
    return t.rows;
  }
  const warnings: string[] = [];
  const agencyRows = table('agency.txt', ['agency_name', 'agency_url', 'agency_timezone']);
  const agencies = agencyRows.map((r) => ({ id: r.agency_id || 'default', name: r.agency_name!, timezone: r.agency_timezone! }));
  if (agencyRows.some((r) => !/^https?:\/\//.test(r.agency_url!))) fail('invalid agency URL');
  if (agencies.length > 1 && agencyRows.some((r) => !r.agency_id)) fail('agency_id required for multiple agencies');
  const timezone = agencies[0]?.timezone ?? fail('empty agencies');
  if (timezone !== 'Europe/Bucharest') warnings.push(`Agency timezone is ${timezone}; expected Europe/Bucharest. Calculations use the published timezone.`);
  if (agencies.some((a) => a.timezone !== timezone)) fail('multiple agency timezones unsupported');
  const stopRowsRaw = table('stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon']);
  for (const r of stopRowsRaw) {
    for (const field of ['stop_lon', 'stop_lat']) if (r[field] && !/^-?\d+(\.\d+)?$/.test(r[field]!)) fail(`invalid ${field} on ${r.stop_id}`);
    if (Boolean(r.stop_lon) !== Boolean(r.stop_lat)) fail(`incomplete coordinate on ${r.stop_id}`);
  }
  const stops = stopRowsRaw.map((r) => ({
    id: r.stop_id!, name: r.stop_name!, coordinate: r.stop_lon && r.stop_lat ? [Number(r.stop_lon), Number(r.stop_lat)] : null,
    parentStation: r.parent_station || null, locationType: integer(r.location_type || '0', 'location_type'),
    wheelchairBoarding: nullableFlag(r.wheelchair_boarding),
  }));
  if (stops.some((s) => s.wheelchairBoarding === null)) warnings.push('Stop wheelchair boarding information is missing for some or all stops; access is unknown.');
  const routes = table('routes.txt', ['route_id', 'route_type']).map((r) => ({
    id: r.route_id!, agencyId: r.agency_id || (agencies.length === 1 ? agencies[0]!.id : ''),
    shortName: r.route_short_name || '', longName: r.route_long_name || '', type: integer(r.route_type!, 'route_type'),
  }));
  const validRouteType = (n: number) => [0,1,2,3,4,5,6,7,11,12,300,500,600,800,1000,1100,1200,1400,1600].includes(n) ||
    [[100,117],[200,209],[400,405],[700,716],[900,906],[1300,1307],[1500,1507],[1700,1702]].some(([a,b]) => n >= a! && n <= b!);
  if (routes.some((r) => !validRouteType(r.type))) fail('unsupported route_type');
  const trips = table('trips.txt', ['trip_id', 'route_id', 'service_id']).map((r) => ({
    id: r.trip_id!, routeId: r.route_id!, serviceId: r.service_id!, headsign: r.trip_headsign || null,
    directionId: r.direction_id ? integer(r.direction_id, 'direction_id') : null,
    wheelchairAccessible: nullableFlag(r.wheelchair_accessible), bikesAllowed: nullableFlag(r.bikes_allowed), shapeId: r.shape_id || null,
  }));
  const shapeRows = table('shapes.txt', ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], true);
  const shapeIds = new Set(shapeRows.map((r) => r.shape_id));
  unique(shapeRows, (r) => `${r.shape_id}:${integer(r.shape_pt_sequence!, 'shape sequence')}`, 'shape sequences');
  for (const r of shapeRows) {
    if (!r.shape_id || !r.shape_pt_lat || !r.shape_pt_lon || !Number.isFinite(Number(r.shape_pt_lat)) || !Number.isFinite(Number(r.shape_pt_lon)) || Math.abs(Number(r.shape_pt_lat)) > 90 || Math.abs(Number(r.shape_pt_lon)) > 180) fail('invalid shape point');
  }
  if (trips.some((t) => t.shapeId && !shapeIds.has(t.shapeId))) fail('missing shape reference');
  if (shapeRows.length) warnings.push('Shapes validated then omitted: this digest supports stop access, not vehicle geometry.');
  if (table('frequencies.txt', ['trip_id', 'start_time', 'end_time', 'headway_secs'], true).length)
    fail('frequency-based trips unsupported: templates must not become exact departures');
  const stopRows = table('stop_times.txt', ['trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time']);
  const stopTimes = stopRows.map((r) => [
    r.trip_id!, r.stop_id!, integer(r.stop_sequence!, 'stop_sequence'),
    r.arrival_time ? parseGtfsTime(r.arrival_time) : null, r.departure_time ? parseGtfsTime(r.departure_time) : null,
    integer(r.pickup_type || '0', 'pickup_type'), integer(r.drop_off_type || '0', 'drop_off_type'), r.stop_headsign || null,
  ]);
  for (const r of stopRows) {
    if (r.timepoint && !['0', '1'].includes(r.timepoint)) fail('invalid timepoint');
    if (r.timepoint === '1' && (!r.arrival_time || !r.departure_time)) fail('exact timepoint has missing times');
    if (r.start_pickup_drop_off_window || r.end_pickup_drop_off_window) fail('flexible pickup windows unsupported');
  }
  if (stopTimes.some((r) => r[4] === null)) warnings.push('Untimed intermediate stops retained but omitted from exact departure lookup; no interpolation.');
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const calendars = table('calendar.txt', ['service_id', 'start_date', 'end_date', ...weekdays], true).map((r) => {
    if (weekdays.some((day) => !['0', '1'].includes(r[day]!))) fail('invalid weekday flag');
    return { serviceId: r.service_id!, startDate: r.start_date!, endDate: r.end_date!, weekdays: weekdays.map((day) => r[day] === '1') };
  });
  const exceptions = table('calendar_dates.txt', ['service_id', 'date', 'exception_type'], true).map((r) => ({
    serviceId: r.service_id!, date: r.date!, type: integer(r.exception_type!, 'exception_type'),
  }));
  if (!calendars.length && !exceptions.length) fail('missing service calendars');
  const info = table('feed_info.txt', ['feed_publisher_name', 'feed_publisher_url', 'feed_lang'], true);
  if (info.length > 1) fail('multiple feed_info rows');
  const starts = [...calendars.map((c) => c.startDate), ...exceptions.filter((e) => e.type === 1).map((e) => e.date)].sort();
  const ends = [...calendars.map((c) => c.endDate), ...exceptions.filter((e) => e.type === 1).map((e) => e.date)].sort();
  const metadata: TransitFeedMetadata = {
    ...provenance, quality: provenance.quality ?? 'confirmed', version: info[0]?.feed_version || null,
    validFrom: info[0]?.feed_start_date || starts[0] || fail('no service dates'),
    validUntil: info[0]?.feed_end_date || ends.at(-1) || fail('no service dates'), agencies, timezone,
    license: 'SMTT public GTFS Schedule; redistribution license not independently verified. No official endorsement.',
    validation: { warnings, files: Object.keys(tables).sort(), counts: { stops: stops.length, routes: routes.length, trips: trips.length, stopTimes: stopTimes.length } },
  };
  if (!info.length) warnings.push('feed_info.txt absent; validity derived from service calendars, version unknown.');
  if (trips.some((t) => !t.headsign || t.directionId === null)) warnings.push('Some trip directions/headsigns are unknown; destination relevance is not inferred.');
  warnings.push('Static published schedule only; live service, disruptions and boarding are unknown.');
  return validateDigest({ schemaVersion: 1, metadata, stops, routes, trips, stopTimes, calendars, exceptions });
}
