import { useEffect, useState } from 'react';
import {
  isPaidAt,
  timisoaraClock,
  type AvailabilityExplainResponse,
  type RecommendationOption,
  type TimparkTariffs,
} from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { api } from '../../services/api';
import './car.css';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 … 21:00

/** The instant of a full hour on the same Timișoara day as `at`. */
export function sameDayAt(at: Date, hour: number): Date {
  const { hour: h, minute } = timisoaraClock(at);
  const midnight = at.getTime() - (h * 60 + minute) * 60_000 - at.getSeconds() * 1000 - at.getMilliseconds();
  return new Date(midnight + hour * 3600_000);
}

interface Props {
  option: RecommendationOption;
  /** The arrival SmartMatch used (ISO). */
  arriveAt: string;
  schedule: TimparkTariffs['schedule'] | null;
  /** Pick an hour: the planner recomputes everything for it. */
  onPick: (at: Date) => void;
}

/**
 * "Cel mai bun moment" (spec §6.21): the same parking at every hour of the day, from the published
 * rule model (estimated, never a measurement) and the published Timpark schedule (confirmed).
 */
export function BestTime({ option: o, arriveAt, schedule, onPick }: Props) {
  const [curve, setCurve] = useState<AvailabilityExplainResponse['dayCurve'] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    api
      .explainAvailability({
        profile: o.pFree.profile,
        at: arriveAt,
        ...(o.capacity.value ? { capacity: o.capacity.value } : {}),
      })
      .then(
        (r) => alive && setCurve(r.dayCurve),
        () => alive && setFailed(true),
      );
    return () => {
      alive = false;
    };
  }, [o.pFree.profile, o.capacity.value, arriveAt]);

  const at = new Date(arriveAt);
  const current = timisoaraClock(at).hour;
  const tariff = o.kind === 'osm' ? null : o.tariff;
  if (failed) return null;
  return (
    <section className="trip-helper mt-3" aria-label="Cel mai bun moment să vii">
      <span className="trip-helper-eyebrow">CEL MAI BUN MOMENT</span>
      <p>
        Șansele estimate de loc la {o.name}, pe ore, în aceeași zi. <QualityBadge quality="estimated" /> Atinge o oră ca
        să refacem recomandarea pentru ea.
      </p>
      {!curve ? (
        <p role="status">Calculăm…</p>
      ) : (
        <div className="trip-helper-bars">
          {HOURS.map((h) => {
            const v = curve.find((c) => c.hour === h)?.value ?? null;
            if (v == null) return null;
            const when = sameDayAt(at, h);
            const paid = tariff && schedule ? isPaidAt(tariff, when, schedule) : null;
            const pct = Math.round(v * 100);
            return (
              <button
                key={h}
                type="button"
                className="trip-helper-bar"
                aria-pressed={h === current}
                aria-label={`Ora ${h}:00: șanse estimate ${pct}%${paid == null ? '' : paid ? ', program plătit' : ', gratuit'}`}
                onClick={() => onPick(when)}
              >
                <span>{String(h).padStart(2, '0')}:00</span>
                <span className="trip-helper-meter" aria-hidden>
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span>
                  ~{pct}%{paid == null ? '' : paid ? ' · plătit' : ' · gratuit'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <small>
        Model pe reguli, necalibrat: nu există senzori de ocupare în Timișoara.
        {tariff
          ? ' „Plătit/gratuit” vine din programul Timpark publicat de Primărie.'
          : o.price.total === 0
            ? ' Parcarea nu e Timpark și e marcată gratuită (neverificat), deci nu are program plătit.'
            : ' Parcarea nu e Timpark: prețul și programul ei nu le cunoaștem.'}
      </small>
    </section>
  );
}
