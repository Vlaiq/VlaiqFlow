import { useEffect, useMemo, useState } from 'react';
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
import { TARIFF_LABEL_RO, type Coordinate, type NavigationRoute, type RecommendationOption } from '@vlaiq/shared';
import { QualityBadge } from '../../components/QualityBadge';
import { api } from '../../services/api';
import { cumulative, formatDistance, instruction } from '../navigation/geometry';
import { ACCESS_LABEL, KIND_LABEL, fmt1, pct, priceText, stayLabel } from './recommendationLabels';

export interface Origin {
  name: string;
  coordinate: Coordinate;
}

/** Same limit as live navigation: laptops locate by Wi-Fi at ±100–300 m. */
const MAX_ORIGIN_ACCURACY_M = 300;

type RouteState =
  | { state: 'loading' }
  | { state: 'ok'; route: NavigationRoute }
  | { state: 'error'; message: string };

type OriginChoice = { kind: 'demo' } | { kind: 'gps'; origin: Origin; accuracy: number };

interface Props {
  option: RecommendationOption;
  rank: number;
  destinationName: string;
  stayMinutes: number;
  smsNumber: string | null;
  demoOrigin: Origin | null;
  onBack: () => void;
  /** Driving route geometry for the map (provider geometry only), or null to clear it. */
  onRoute: (geometry: Coordinate[] | null) => void;
}

function StepIcon({ step }: { step: NavigationRoute['steps'][number] }) {
  const cls = 'h-4 w-4 shrink-0 text-primary';
  if (step.type === 'arrive') return <Flag className={cls} aria-hidden />;
  if (step.type.includes('roundabout') || step.type === 'rotary') return <RotateCw className={cls} aria-hidden />;
  if (step.modifier === 'uturn') return <RotateCcw className={cls} aria-hidden />;
  if (step.modifier?.includes('sharp left') || step.modifier === 'left') return <ArrowLeft className={cls} aria-hidden />;
  if (step.modifier?.includes('sharp right') || step.modifier === 'right') return <ArrowRight className={cls} aria-hidden />;
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
export function ParkingDetail({ option: o, rank, destinationName, stayMinutes, smsNumber, demoOrigin, onBack, onRoute }: Props) {
  const [choice, setChoice] = useState<OriginChoice>({ kind: 'demo' });
  const [locating, setLocating] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<RouteState>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const origin: Origin | null = choice.kind === 'gps' ? choice.origin : demoOrigin;

  useEffect(() => {
    if (!origin) {
      setRouteState({ state: 'error', message: 'Nu avem un punct de plecare. Folosește „Locația mea”.' });
      onRoute(null);
      return;
    }
    const ctrl = new AbortController();
    setRouteState({ state: 'loading' });
    api.routes(origin.coordinate, o.coordinate, AbortSignal.any([ctrl.signal, AbortSignal.timeout(20000)])).then(
      (routes) => {
        const route = routes[0]!;
        setRouteState({ state: 'ok', route });
        onRoute(route.geometry);
      },
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        setRouteState({ state: 'error', message: e instanceof Error ? e.message : 'Nu am putut calcula ruta.' });
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
          setGpsMessage(`Poziția are o precizie de ±${Math.round(p.coords.accuracy)} m, prea mare. Rămânem la plecarea de exemplu.`);
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
            : 'Nu am putut obține poziția. Rămânem la plecarea de exemplu.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const turns = useMemo(() => (routeState.state === 'ok' ? turnList(routeState.route, o.name) : []), [routeState, o.name]);
  const navHref = `/navigation?${new URLSearchParams({
    to: `${o.coordinate[0].toFixed(6)},${o.coordinate[1].toFixed(6)}`,
    name: o.name,
    area: `Parcare pentru ${destinationName}`,
  }).toString()}`;
  const pFull = 1 - o.pFree.value;
  const walkMin = Math.max(1, Math.round(o.walk.minutes));

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
          <h2 id="parking-detail-title" className="text-base font-semibold leading-tight">{o.name}</h2>
          <p className="text-xs text-muted">
            {KIND_LABEL[o.kind]}
            {o.tariff ? ` · tarif ${TARIFF_LABEL_RO[o.tariff]}` : ''} · {ACCESS_LABEL[o.access]}
          </p>
        </div>
      </header>

      {/* Key facts */}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-muted">Șanse să găsești loc</dt>
          <dd className="text-lg font-semibold tabular-nums">~{pct(o.pFree.value)}</dd>
          <dd className="text-muted">Risc să fie plină: ~{pct(pFull)}</dd>
          <dd className="mt-1"><QualityBadge quality={o.pFree.quality} /></dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-muted">Pe jos până la {destinationName}</dt>
          <dd className="flex items-center gap-1 text-lg font-semibold tabular-nums">
            <Footprints className="h-4 w-4" aria-hidden /> {walkMin} min
          </dd>
          <dd className="text-muted tabular-nums">{formatDistance(o.walk.meters)}</dd>
          <dd className="mt-1"><QualityBadge quality={o.walk.quality} /></dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-muted">Cost pentru {stayLabel(stayMinutes)}</dt>
          <dd className="text-lg font-semibold tabular-nums">{priceText(o)}</dd>
          <dd className="mt-1"><QualityBadge quality={o.price.quality} /></dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <dt className="text-muted">Capacitate</dt>
          <dd className="text-lg font-semibold tabular-nums">{o.capacity.value != null ? `~${o.capacity.value} locuri` : 'Necunoscută'}</dd>
          <dd className="mt-1"><QualityBadge quality={o.capacity.quality} /></dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">{o.price.note}</p>

      {o.flags.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-warning">
          {o.flags.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}

      {/* Driving directions */}
      <section aria-labelledby="drive-title" className="mt-4">
        <h3 id="drive-title" className="flex items-center gap-2 text-sm font-semibold">
          <Car className="h-4 w-4 text-primary" aria-hidden /> Cum ajungi cu mașina
        </h3>
        <div role="radiogroup" aria-label="Punct de plecare" className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          <button
            type="button"
            role="radio"
            aria-checked={choice.kind === 'demo'}
            disabled={!demoOrigin}
            onClick={() => setChoice({ kind: 'demo' })}
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold ${choice.kind === 'demo' ? 'bg-primary text-primary-fg' : 'text-muted hover:text-text'}`}
          >
            Din {demoOrigin?.name ?? 'exemplu'} (exemplu)
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice.kind === 'gps'}
            onClick={useMyLocation}
            disabled={locating}
            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold ${choice.kind === 'gps' ? 'bg-primary text-primary-fg' : 'text-muted hover:text-text'}`}
          >
            <LocateFixed className="h-3 w-3" aria-hidden /> {locating ? 'Se caută…' : 'Din locația mea'}
          </button>
        </div>
        {choice.kind === 'gps' && (
          <p className="mt-1 text-xs text-muted">Plecare din poziția ta (precizie ±{Math.round(choice.accuracy)} m).</p>
        )}
        {gpsMessage && <p role="alert" className="mt-1 text-xs text-warning">{gpsMessage}</p>}

        <div className="mt-2" aria-live="polite">
          {routeState.state === 'loading' && <p role="status" className="text-xs text-muted">Calculăm traseul…</p>}
          {routeState.state === 'error' && (
            <div role="alert" className="rounded-xl border border-border p-3 text-xs">
              <p className="text-warning">{routeState.message}</p>
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className="mt-2 min-h-11 rounded-lg border border-border px-3 font-semibold">
                Încearcă din nou
              </button>
            </div>
          )}
          {routeState.state === 'ok' && (
            <>
              <p className="text-sm">
                <strong className="tabular-nums">{formatDistance(routeState.route.distance)}</strong> ·{' '}
                <strong className="tabular-nums">~{Math.max(1, Math.round(routeState.route.duration / 60))} min</strong>
                <span className="text-muted"> fără trafic live</span>
              </p>
              <p className="text-xs text-muted">Sursa traseului: {routeState.route.source}. Traseul este desenat pe hartă.</p>
              <ol className="mt-2 divide-y divide-border rounded-xl border border-border text-xs">
                {turns.map((t, i) => (
                  <li key={`${t.step.index}-${i}`} className="flex items-center gap-2 px-3 py-2">
                    <StepIcon step={t.step} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{t.text}</span>
                      {t.road && <span className="text-muted"> pe {t.road}</span>}
                    </span>
                    {t.meters > 0 && <span className="shrink-0 tabular-nums text-muted">{formatDistance(t.meters)}</span>}
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
          <Footprints className="h-4 w-4 text-primary" aria-hidden /> Apoi pe jos până la {destinationName}
        </h3>
        <p className="mt-1 text-xs">
          ~{walkMin} min, {formatDistance(o.walk.meters)}.
        </p>
        <p className="text-xs text-muted">
          Sursa: {o.walk.source}.
          {o.walk.source.startsWith('estimat') && ' Traseul pe jos nu este desenat: avem nevoie de un router pietonal (cheie openrouteservice).'}
        </p>
      </section>

      {o.smsCode && smsNumber && o.price.total !== 0 && (
        <section className="mt-4 rounded-xl border border-border p-3 text-xs">
          <h3 className="text-sm font-semibold">Plată</h3>
          <p className="mt-1">
            Trimite SMS cu <strong>{o.smsCode}</strong> la <strong>{smsNumber}</strong> (o oră) sau plătește în CityApp.
          </p>
        </section>
      )}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted hover:text-text">De ce e pe locul {rank}?</summary>
        <ul className="mt-1 space-y-0.5 text-muted">
          <li>Șanse de loc estimate din: {o.pFree.factors.join('; ')}. Nu e o măsurătoare în timp real.</li>
          <li>
            Scor: mers {fmt1(o.cost.walk)} + risc de plin {fmt1(o.cost.risk)} + preț {fmt1(o.cost.price)} ={' '}
            <strong className="text-text">{fmt1(o.cost.total)} min echivalente</strong> (mai puțin = mai bine).
          </li>
          <li>Capacitate: {o.capacity.value != null ? `${o.capacity.value} locuri (${o.capacity.source})` : 'necunoscută'}.</li>
        </ul>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={navHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Navigation className="h-4 w-4" aria-hidden /> Pornește navigația GPS
        </a>
        <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
          Alege altă parcare
        </button>
      </div>
    </article>
  );
}
