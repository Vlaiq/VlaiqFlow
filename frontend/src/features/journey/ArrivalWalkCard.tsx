import { useEffect, useState } from 'react';
import { Footprints, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { CompleteJourneyRequest, type Coordinate, type NavigationRoute } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { formatDistance } from '../navigation/geometry';
import type { ArrivalWalk } from '../navigation/scenario';
import { fetchCompleteJourneys } from './useCompleteJourneys';
import '../car/car.css';

type Walk =
  | { state: 'loading' }
  | { state: 'ok'; route: NavigationRoute }
  | { state: 'error'; message: string };

const UNAVAILABLE = 'Ruta pe jos nu este disponibilă acum.';

/**
 * After the car navigation ends at the parking: the real walking route to the final destination,
 * drawn on the map. Only provider geometry is shown; without it we say so instead of drawing a line.
 */
export function ArrivalWalkCard({
  walk,
  onRoute,
  onClose,
}: {
  walk: ArrivalWalk;
  onRoute: (geometry: Coordinate[] | null) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<Walk>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ state: 'loading' });
    fetchCompleteJourneys(
      CompleteJourneyRequest.parse({
        origin: walk.from.coordinate,
        destination: walk.to.coordinate,
        modes: ['walk'],
      }),
      ctrl.signal,
    )
      .then((value) => {
        const leg = value.journeys.find((j) => j.category === 'walk')?.legs[0];
        if (!leg || leg.type === 'parking') throw new Error(UNAVAILABLE);
        if (ctrl.signal.aborted) return;
        setState({ state: 'ok', route: leg.route });
        onRoute(leg.route.geometry);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ state: 'error', message: e instanceof Error ? e.message : UNAVAILABLE });
        onRoute(null);
      });
    return () => ctrl.abort();
  }, [walk, attempt, onRoute]);
  useEffect(() => () => onRoute(null), [onRoute]);

  return (
    <section className="parked-car" aria-labelledby="arrival-walk-title">
      <header className="parked-car-head">
        <span className="parked-car-icon" aria-hidden>
          <Footprints size={18} />
        </span>
        <div>
          <span className="parked-car-eyebrow">PE JOS</span>
          <h2 id="arrival-walk-title">Până la {walk.to.name}</h2>
          <p>De la {walk.from.name}.</p>
        </div>
        <button className="parked-car-close" onClick={onClose} aria-label="Închide mersul pe jos">
          <X size={17} />
        </button>
      </header>
      {state.state === 'loading' && (
        <p className="parked-car-walk-result" role="status">
          <LoaderCircle className="spin" size={14} /> Calculăm traseul pe jos…
        </p>
      )}
      {state.state === 'ok' && (
        <p className="parked-car-walk-result" role="status">
          <strong>~{Math.max(1, Math.round(state.route.duration / 60))} min</strong>,{' '}
          {formatDistance(state.route.distance)} <QualityBadge quality={state.route.quality} /> ·{' '}
          {state.route.source}. Traseul e pe hartă.
        </p>
      )}
      {state.state === 'error' && (
        <div className="parked-car-walk-result" role="alert">
          <p>{state.message}</p>
          <button className="parked-car-walk" onClick={() => setAttempt((a) => a + 1)}>
            <RotateCcw size={15} /> Încearcă din nou
          </button>
        </div>
      )}
    </section>
  );
}
