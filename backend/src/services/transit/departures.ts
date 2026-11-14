import { z } from 'zod';
import { TransitTimestamp, type ScheduledDeparture, type TransitUnavailableReason } from '../../../../shared/src/schemas/transit';
import { localServiceDate, serviceDayEpoch, shiftDate } from './gtfsCalendar';
import { lowerBound, type TransitIndex } from './gtfsIndex';

const Query = z.object({
  stopId: z.string().min(1), from: TransitTimestamp, horizonSeconds: z.number().int().min(1).max(86400).default(7200),
  limit: z.number().int().min(1).max(20).default(8), routeId: z.string().optional(),
  directionId: z.union([z.literal(0), z.literal(1)]).optional(),
}).strict();
export function departuresForStop(index: TransitIndex, input: z.input<typeof Query>): {
  departures: ScheduledDeparture[]; reason: TransitUnavailableReason | null;
} {
  const q = Query.safeParse(input);
  if (!q.success) return { departures: [], reason: 'INVALID_INPUT' };
  const { stopId, from, horizonSeconds, limit, routeId, directionId } = q.data;
  const meta = index.digest.metadata, start = Date.parse(from), end = start + horizonSeconds * 1000;
  const local = localServiceDate(start, meta.timezone);
  const rows = index.departures.get(stopId) ?? [];
  const departures: ScheduledDeparture[] = [];
  const first = shiftDate(local, -Math.ceil(index.maxDepartureSeconds / 86400) - 1);
  const last = shiftDate(localServiceDate(end, meta.timezone), 1);
  for (let date = first; date <= last; date = shiftDate(date, 1)) {
    if (date < meta.validFrom || date > meta.validUntil) continue;
    const epoch = serviceDayEpoch(date, meta.timezone);
    const minSeconds = (start - epoch) / 1000, maxSeconds = (end - epoch) / 1000;
    const begin = lowerBound(rows, minSeconds, (st) => st[4]!);
    let foundOnDate = 0;
    for (let i = begin; i < rows.length; i++) {
      const st = rows[i]!;
      if (st[4]! > maxSeconds) break;
      const trip = index.trips.get(st[0])!, route = index.routes.get(trip.routeId)!;
      if ((routeId && trip.routeId !== routeId) || (directionId !== undefined && trip.directionId !== directionId) || !index.active(trip.serviceId, date)) continue;
      const scheduledAt = new Date(epoch + st[4]! * 1000).toISOString();
      departures.push({
        id: `${date}:${trip.id}:${st[2]}`, stopId, tripId: trip.id, routeId: route.id,
        serviceId: trip.serviceId, serviceDate: date, stopSequence: st[2], departureSeconds: st[4]!, scheduledAt,
        routeShortName: route.shortName, headsign: st[7] ?? trip.headsign, directionId: trip.directionId,
        quality: meta.quality, source: meta.source, feedVersion: meta.version,
      });
      // Sorted stop-time index makes further matches on this service day unnecessary.
      if (++foundOnDate === limit) break;
    }
  }
  departures.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.tripId.localeCompare(b.tripId, 'en') || a.stopSequence - b.stopSequence || a.serviceDate.localeCompare(b.serviceDate, 'en'));
  return { departures: departures.slice(0, limit), reason: departures.length ? null :
    local > meta.validUntil ? 'EXPIRED_FEED' : shiftDate(local, 1) < meta.validFrom ? 'UNSUPPORTED_DATE' : 'NO_DEPARTURE' };
}
