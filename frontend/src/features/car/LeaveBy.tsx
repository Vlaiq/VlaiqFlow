import { CalendarPlus, Clock } from 'lucide-react';
import { clock, downloadReminder } from './calendar';
import './car.css';

/** Minutes kept free in "when do I leave", because the route has no live traffic and no search time. */
export const LEAVE_MARGIN_MIN = 5;

/** Latest departure to arrive on time: arrival − drive − walk − margin. Pure; every input is a real figure. */
export function leaveTime(arrive: Date, driveMinutes: number, walkMinutes: number, margin = LEAVE_MARGIN_MIN): Date {
  return new Date(arrive.getTime() - Math.ceil(driveMinutes + walkMinutes + margin) * 60_000);
}

interface Props {
  /** The arrival the user set in "Când ajungi?", null for "now". */
  arriveAt: Date | null;
  driveMinutes: number;
  walkMinutes: number;
  parkingName: string;
  destinationName: string;
  now?: Date;
}

/** "Când trebuie să plec?" (spec §6.18), from the provider's driving time and the walking time. */
export function LeaveBy({ arriveAt, driveMinutes, walkMinutes, parkingName, destinationName, now = new Date() }: Props) {
  if (!arriveAt) {
    return (
      <p className="mt-2 text-xs text-muted">
        <Clock className="mr-1 inline h-3 w-3" aria-hidden />
        Alege ora la care vrei să ajungi („Când ajungi?” în lista de parcări) și îți spunem când să pleci.
      </p>
    );
  }
  const leave = leaveTime(arriveAt, driveMinutes, walkMinutes);
  const late = Math.ceil((now.getTime() - leave.getTime()) / 60_000);
  const sameDay = arriveAt.toDateString() === now.toDateString();
  const day = sameDay
    ? ''
    : ` (${new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' }).format(leave)})`;
  return (
    <section className="trip-helper mt-3" aria-label="Când trebuie să pleci">
      <span className="trip-helper-eyebrow">CÂND PLECI</span>
      {late > 0 ? (
        <p role="status">
          Ca să ajungi la {destinationName} la <strong>{clock(arriveAt)}</strong> trebuia să pleci la{' '}
          <strong>{clock(leave)}</strong>. Dacă pleci acum, întârzii ~{late} min.
        </p>
      ) : (
        <p>
          Pleacă cel târziu la <strong>{clock(leave)}</strong>
          {day} ca să fii la {destinationName} la <strong>{clock(arriveAt)}</strong>.
        </p>
      )}
      <small>
        ~{Math.max(1, Math.round(driveMinutes))} min cu mașina (fără trafic live) + ~{Math.max(1, Math.round(walkMinutes))} min
        pe jos + {LEAVE_MARGIN_MIN} min rezervă pentru găsirea locului. Estimare, nu garanție.
      </small>
      {late <= 0 && (
        <div className="trip-helper-chips">
          <button
            type="button"
            onClick={() =>
              downloadReminder(
                {
                  title: `Pleacă spre ${destinationName}`,
                  description: `Parcare aleasă: ${parkingName}. Sosire dorită ${clock(arriveAt)}. Ora este calculată de VLAIQ FLOW fără trafic live.`,
                  start: leave,
                  location: parkingName,
                },
                'vlaiq-flow-plecare.ics',
              )
            }
          >
            <CalendarPlus size={14} /> Adaugă în calendar
          </button>
        </div>
      )}
    </section>
  );
}
