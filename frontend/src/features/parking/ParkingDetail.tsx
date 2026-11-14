import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Car,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  LocateFixed,
  Navigation,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import {
  CompleteJourneyRequest,
  TARIFF_LABEL_RO,
  type Coordinate,
  type NavigationRoute,
  type RecommendationOption,
} from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { api } from '../../services/api';
import { cumulative, formatDistance, instruction } from '../navigation/geometry';
import { fetchCompleteJourneys } from '../journey/useCompleteJourneys';
import { ACCESS_LABEL, KIND_LABEL, priceText, stayLabel } from './recommendationLabels';
import { FreeChance, ScoreBreakdown } from './ParkingFacts';

type WalkState =
  | { state: 'loading' }
  | { state: 'ok'; route: NavigationRoute }
  | { state: 'error'; message: string };

export interface Origin {
  name: string;
  coordinate: Coordinate;
}

/** Same limit as live navigation: laptops locate by Wi-Fi at ±100–300 m. */
const MAX_ORIGIN_ACCURACY_M = 300;

type RouteState =
  | { state: 'no-origin' }
  | { state: 'loading' }
  | { state: 'ok'; route: NavigationRoute }
  | { state: 'error'; message: string };

type OriginChoice =
  | { kind: 'pending' }
  | { kind: 'gps'; origin: Origin; accuracy: number };

interface Props {
  option: RecommendationOption;
  rank: number;
  destinationName: string;
  /** Destination point, for the real walking route from the parking (provider geometry only). */
  destination?: Coordinate | null;
  stayMinutes: number;
  smsNumber: string | null;
  selectedOrigin?: Origin | null;
  onOriginRequest?: () => void;
  originError?: string | null;
  locatingOrigin?: boolean;
  onManualOrigin?: () => void;
  onBack: () => void;
  /** Driving route geometry for the map (provider geometry only), or null to clear it. */
  onRoute: (geometry: Coordinate[] | null) => void;
  /** Walking route parking → destination for the map, or null to clear it. */
  onWalkRoute?: (geometry: Coordinate[] | null) => void;
}

function StepIcon({ step }: { step: NavigationRoute['steps'][number] }) {
  const cls = 'h-4 w-4 shrink-0 text-primary';
  if (step.type === 'arrive') return <Flag className={cls} aria-hidden />;
  if (step.type.includes('roundabout') || step.type === 'rotary')
    return <RotateCw className={cls} aria-hidden />;
  if (step.modifier === 'uturn') return <RotateCcw className={cls} aria-hidden />;
  if (step.modifier?.includes('sharp left') || step.modifier === 'left')
    return <ArrowLeft className={cls} aria-hidden />;
  if (step.modifier?.includes('sharp right') || step.modifier === 'right')
    return <ArrowRight className={cls} aria-hidden />;
  if (step.modifier?.includes('left')) return <CornerUpLeft className={cls} aria-hidden />;
  if (step.modifier?.includes('right')) return <CornerUpRight className={cls} aria-hidden />;
  return <ArrowUp className={cls} aria-hidden />;
}

/** Turn list from the provider's maneuvers: each step with the distance until the next one. */
function turnList(route: NavigationRoute, parkingName: string) {
  const lengths = cumulative(route.geometry);
  const steps = route.steps.filter((s) => s.type !== 'depart' || s.road);
  return steps.map((s, i) => {
    const next = steps[i + 1];
    const meters = next ? (lengths[next.index] ?? 0) - (lengths[s.index] ?? 0) : 0;
    const text =
      s.type === 'arrive'
        ? `Ajungi la ${parkingName}`
        : s.type === 'depart'
          ? 'Pornește'
          : instruction(s);
    return { step: s, text, road: s.type === 'arrive' ? '' : s.road, meters };
  });
}

/**
 * Presentation of one recommended parking (spec §6.6 details panel): availability, walking distance,
 * price and the driving directions to it, before the user decides to start GPS navigation.
 */
export function ParkingDetail({
  option: o,
  rank,
  destinationName,
  destination = null,
  stayMinutes,
  smsNumber,
  selectedOrigin,
  onOriginRequest,
  originError,
  locatingOrigin,
  onManualOrigin,
  onBack,
  onRoute,
  onWalkRoute,
}: Props) {
  const [choice, setChoice] = useState<OriginChoice>({ kind: 'pending' });
  const [locating, setLocating] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<RouteState>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const origin: Origin | null =
    selectedOrigin ??
    (choice.kind === 'gps' ? choice.origin : null);

  const [walkState, setWalkState] = useState<WalkState>({ state: 'loading' });
  const [walkAttempt, setWalkAttempt] = useState(0);
  const walkCallback = useRef(onWalkRoute);
  walkCallback.current = onWalkRoute;

  // Real walking route parking → destination. It does not need the user's origin, so the preview always has it.
  useEffect(() => {
    if (!destination) {
      setWalkState({ state: 'error', message: 'Destinația nu are o poziție cunoscută.' });
      return;
    }
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 30000);
    setWalkState({ state: 'loading' });
    fetchCompleteJourneys(
      CompleteJourneyRequest.parse({ origin: o.coordinate, destination, modes: ['walk'] }),
      ctrl.signal,
    )
      .then((value) => {
        const leg = value.journeys.find((j) => j.category === 'walk')?.legs[0];
        if (!leg || leg.type === 'parking') throw new Error('Ruta pietonală nu este disponibilă acum.');
        setWalkState({ state: 'ok', route: leg.route });
        walkCallback.current?.(leg.route.geometry);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted && !timedOut) return;
        setWalkState({
          state: 'error',
          message: timedOut
            ? 'Ruta pietonală durează prea mult.'
            : e instanceof Error
              ? e.message
              : 'Ruta pietonală nu este disponibilă acum.',
        });
        walkCallback.current?.(null);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.coordinate[0], o.coordinate[1], destination?.[0], destination?.[1], walkAttempt]);
  useEffect(() => () => walkCallback.current?.(null), []);

  useEffect(() => {
    if (!origin) {
      setRouteState({ state: 'no-origin' });
      onRoute(null);
      return;
    }
    const ctrl = new AbortController();
    setRouteState({ state: 'loading' });
    api
      .routes(
        origin.coordinate,
        o.coordinate,
        AbortSignal.any([ctrl.signal, AbortSignal.timeout(20000)]),
      )
      .then(
        (routes) => {
          const route = routes[0]!;
          setRouteState({ state: 'ok', route });
          onRoute(route.geometry);
        },
        (e: unknown) => {
          if (ctrl.signal.aborted) return;
          setRouteState({
            state: 'error',
            message: e instanceof Error ? e.message : 'Nu am putut calcula ruta.',
          });
          onRoute(null);
        },
      );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.coordinate[0], origin?.coordinate[1], o.coordinate[0], o.coordinate[1], attempt]);

  useEffect(() => () => onRoute(null), [onRoute]);

  const useMyLocation = () => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setGpsMessage('Locația necesită HTTPS și un browser cu localizare.');
      return;
    }
    setLocating(true);
    setGpsMessage(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        if (p.coords.accuracy > MAX_ORIGIN_ACCURACY_M) {
          setGpsMessage(
            `Poziția are o precizie de ±${Math.round(p.coords.accuracy)} m, prea mare. Poți alege plecarea pe hartă.`,
          );
          return;
        }
        setChoice({
          kind: 'gps',
          origin: { name: 'Locația ta', coordinate: [p.coords.longitude, p.coords.latitude] },
          accuracy: p.coords.accuracy,
        });
      },
      (e) => {
        setLocating(false);
        setGpsMessage(
          e.code === 1
            ? 'Accesul la locație este blocat. Permite Locația din iconița de lângă adresa site-ului.'
            : 'Nu am putut obține poziția. Poți alege plecarea pe hartă.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const turns = useMemo(
    () => (routeState.state === 'ok' ? turnList(routeState.route, o.name) : []),
    [routeState, o.name],
  );
  const navHref = `/navigation?${new URLSearchParams({
    to: `${o.coordinate[0].toFixed(6)},${o.coordinate[1].toFixed(6)}`,
    name: o.name,
    area: `Parcare pentru ${destinationName}`,
  }).toString()}`;
  const walkRoute = walkState.state === 'ok' ? walkState.route : null;
  const walkMin = Math.max(1, Math.round(walkRoute ? walkRoute.duration / 60 : o.walk.minutes));
  const walkMeters = walkRoute ? walkRoute.distance : o.walk.meters;

  return (
    <article aria-labelledby="parking-detail-title" className="mb-3 border-b border-border pb-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Toate parcările
      </button>

      <header className="flex items-start gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rank === 1 ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-text'}`}
          aria-label={`Locul ${rank} în clasament`}
        >
          {rank}
        </span>
        <div className="min-w-0">
          <h2 id="parking-detail-title" className="text-base font-semibold leading-tight">
            {o.name}
          </h2>
          <p className="text-xs text-muted">
            {KIND_LABEL[o.kind]}
            {o.tariff ? ` · tarif ${TARIFF_LABEL_RO[o.tariff]}` : ''} · {ACCESS_LABEL[o.access]}
          </p>
        </div>
      </header>

      {/* Key facts */}
      <FreeChance value={o.pFree.value} quality={o.pFree.quality} />
      <dl className="parking-detail-facts mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-muted">Pe jos până la {destinationName}</dt>
          <dd className="flex items-center gap-1 text-lg font-semibold tabular-nums">
            <Footprints className="h-4 w-4" aria-hidden /> {walkMin} min
          </dd>
          <dd className="text-muted tabular-nums">{formatDistance(walkMeters)}</dd>
          <dd className="mt-1">
            <QualityBadge quality={walkRoute ? walkRoute.quality : o.walk.quality} />
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-muted">Cost pentru {stayLabel(stayMinutes)}</dt>
          <dd className="text-lg font-semibold tabular-nums">{priceText(o)}</dd>
          <dd className="mt-1">
            <QualityBadge quality={o.price.quality} />
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-muted">Capacitate</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {o.capacity.value != null ? `~${o.capacity.value} locuri` : 'Necunoscută'}
          </dd>
          <dd className="mt-1">
            <QualityBadge quality={o.capacity.quality} />
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">{o.price.note}</p>

      {o.flags.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-warning">
          {o.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}

      {o.smsCode && smsNumber && o.price.total !== 0 && (
        <section className="mt-3 rounded-xl border border-border p-3 text-xs">
          <h3 className="text-sm font-semibold">Plată</h3>
          <p className="mt-1">
            Trimite SMS cu <strong>{o.smsCode}</strong> la <strong>{smsNumber}</strong> (o oră) sau
            plătește în CityApp.
          </p>
        </section>
      )}

      <section aria-labelledby="score-title" className="parking-detail-score">
        <h3 id="score-title">De ce e pe locul {rank}</h3>
        <ScoreBreakdown score={o.cost} />
        <p className="text-xs text-muted">
          Mai puțin = mai bine. Șansele de loc vin din: {o.pFree.factors.join('; ')}. Nu sunt o
          măsurătoare în timp real.
        </p>
      </section>

      {/* Driving directions */}
      <section aria-labelledby="drive-title" className="mt-4">
        <h3 id="drive-title" className="flex items-center gap-2 text-sm font-semibold">
          <Car className="h-4 w-4 text-primary" aria-hidden /> Cum ajungi cu mașina
        </h3>
        {origin && <p className="mt-2 text-xs text-muted">Plecare: {origin.name}.</p>}
        <div
          role="group"
          aria-label="Punct de plecare"
          className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1"
        >
          <button
            type="button"
            onClick={onManualOrigin}
            disabled={!onManualOrigin}
            className="min-h-11 rounded-lg border border-border px-2 text-xs font-semibold"
          >
            Alege pe hartă
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice.kind === 'gps'}
            onClick={onOriginRequest ?? useMyLocation}
            disabled={locating || locatingOrigin}
            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold ${choice.kind === 'gps' ? 'bg-primary text-primary-fg' : 'text-muted hover:text-text'}`}
          >
            <LocateFixed className="h-3 w-3" aria-hidden />{' '}
            {locating || locatingOrigin ? 'Se caută…' : 'Din locația mea'}
          </button>
        </div>
        {choice.kind === 'gps' && (
          <p className="mt-1 text-xs text-muted">
            Plecare din poziția ta (precizie ±{Math.round(choice.accuracy)} m).
          </p>
        )}
        {(gpsMessage || originError) && (
          <p role="alert" className="mt-1 text-xs text-warning">
            {gpsMessage || originError}
          </p>
        )}

        <div className="mt-2" aria-live="polite">
          {routeState.state === 'no-origin' && (
            <p className="rounded-xl border border-border p-3 text-xs text-muted">
              Alege de unde pornești (locația ta sau un punct pe hartă) ca să calculăm drumul cu
              mașina până aici. Restul previzualizării nu are nevoie de plecare.
            </p>
          )}
          {routeState.state === 'loading' && (
            <p role="status" className="text-xs text-muted">
              Calculăm traseul…
            </p>
          )}
          {routeState.state === 'error' && (
            <div role="alert" className="rounded-xl border border-border p-3 text-xs">
              <p className="text-warning">{routeState.message}</p>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="mt-2 min-h-11 rounded-lg border border-border px-3 font-semibold"
              >
                Încearcă din nou
              </button>
            </div>
          )}
          {routeState.state === 'ok' && (
            <>
              <p className="text-sm">
                <strong className="tabular-nums">
                  {formatDistance(routeState.route.distance)}
                </strong>{' '}
                ·{' '}
                <strong className="tabular-nums">
                  ~{Math.max(1, Math.round(routeState.route.duration / 60))} min
                </strong>
                <span className="text-muted"> fără trafic live</span>
              </p>
              <p className="text-xs text-muted">
                Sursa traseului: {routeState.route.source}. Traseul este desenat pe hartă.
              </p>
              <ol className="mt-2 divide-y divide-border rounded-xl border border-border text-xs">
                {turns.map((t, i) => (
                  <li key={`${t.step.index}-${i}`} className="flex items-center gap-2 px-3 py-2">
                    <StepIcon step={t.step} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{t.text}</span>
                      {t.road && <span className="text-muted"> pe {t.road}</span>}
                    </span>
                    {t.meters > 0 && (
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatDistance(t.meters)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </section>

      {/* Walking leg */}
      <section aria-labelledby="walk-title" className="mt-4">
        <h3 id="walk-title" className="flex items-center gap-2 text-sm font-semibold">
          <Footprints className="h-4 w-4 text-primary" aria-hidden /> Apoi pe jos până la{' '}
          {destinationName}
        </h3>
        <div aria-live="polite">
          {walkState.state === 'loading' && (
            <p role="status" className="mt-1 text-xs text-muted">
              Calculăm traseul pietonal… Până atunci: ~{Math.max(1, Math.round(o.walk.minutes))} min
              estimat.
            </p>
          )}
          {walkState.state === 'ok' && (
            <>
              <p className="mt-1 text-sm">
                <strong className="tabular-nums">{formatDistance(walkState.route.distance)}</strong>{' '}
                ·{' '}
                <strong className="tabular-nums">
                  ~{Math.max(1, Math.round(walkState.route.duration / 60))} min
                </strong>
              </p>
              <p className="text-xs text-muted">
                Sursa traseului: {walkState.route.source}. Traseul pietonal este desenat pe hartă,
                punctat.
              </p>
            </>
          )}
          {walkState.state === 'error' && (
            <div className="mt-1 text-xs">
              <p>
                ~{walkMin} min, {formatDistance(o.walk.meters)} (estimare: {o.walk.source}).
              </p>
              <p className="text-muted">
                {walkState.message} Nu desenăm o linie dreaptă în locul traseului.
              </p>
              <button
                type="button"
                onClick={() => setWalkAttempt((a) => a + 1)}
                className="mt-1 min-h-11 rounded-lg border border-border px-3 font-semibold"
              >
                Încearcă din nou
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={navHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Navigation className="h-4 w-4" aria-hidden /> Pornește navigația GPS
        </a>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold"
        >
          Alege altă parcare
        </button>
      </div>
    </article>
  );
}
