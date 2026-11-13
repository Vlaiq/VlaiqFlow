import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bike,
  Car,
  ChevronDown,
  CircleHelp,
  Footprints,
  Leaf,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react';
import type { Coordinate, Destination } from '@vlaiq/shared';
import {
  JourneyComparisonResponse,
  chooseJourney,
  type JourneyMode,
  type JourneyOption,
  type JourneyPreference,
} from '../../../../shared/src/schemas/journey';
import './journey.css';

export interface ActiveJourneyContext {
  id: string;
  mode: 'walk' | 'cycle';
  destinationId: string;
  destinationName: string;
  distance: number;
  duration: number;
}
interface Props {
  origin: Coordinate | null;
  destination: Destination;
  onRoute: (geometry: Coordinate[] | null) => void;
  onStartActivity: (mode: 'walk' | 'cycle', journey?: ActiveJourneyContext) => void;
}
type ComparisonState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ok'; value: JourneyComparisonResponse };
const modeNames: Record<JourneyMode, string> = {
  drive: 'Cu mașina',
  walk: 'Pe jos',
  cycle: 'Cu bicicleta',
};
const modeIcons = { drive: Car, walk: Footprints, cycle: Bike };
const preferences: { id: JourneyPreference; label: string; hint: string }[] = [
  {
    id: 'fastest',
    label: 'Cea mai rapidă',
    hint: 'Alege cea mai scurtă durată dintre rutele calculate.',
  },
  {
    id: 'balanced',
    label: 'Echilibrată',
    hint: 'Preferă o variantă activă când adaugă cel mult 5 minute.',
  },
  {
    id: 'green',
    label: 'Mai ecologică',
    hint: 'Preferă o rută activă practică. Nu calculăm emisii evitate fără o sursă.',
  },
];
const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
const meters = (distance: number) =>
  distance >= 1000
    ? `${(distance / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`
    : `${Math.round(distance)} m`;
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function GreenSwitch({ origin, destination, onRoute, onStartActivity }: Props) {
  const [result, setResult] = useState<ComparisonState>({ state: 'idle' });
  const [preference, setPreference] = useState<JourneyPreference>('balanced');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const callback = useRef(onRoute);
  callback.current = onRoute;
  const selected =
    result.state === 'ok'
      ? result.value.options.find((option) => option.id === selectedId)
      : undefined;
  const loc = destination.location;

  useEffect(() => {
    if (!origin || !loc) {
      setResult({ state: 'idle' });
      callback.current(null);
      return;
    }
    const controller = new AbortController();
    setResult({ state: 'loading' });
    setSelectedId(null);
    callback.current(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new AbortController();
    timer = setTimeout(() => timeout.abort(), 20000);
    void fetch(`${BASE}/api/journeys/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination: [loc.lng, loc.lat] }),
      signal: AbortSignal.any([controller.signal, timeout.signal]),
    })
      .then(async (response) => {
        const json = await response.json().catch(() => {
          throw new Error('Serviciul de comparație nu a returnat un răspuns valid.');
        });
        if (!response.ok)
          throw new Error(json.error?.message ?? 'Comparația rutelor nu este disponibilă.');
        const parsed = JourneyComparisonResponse.safeParse(json);
        if (!parsed.success)
          throw new Error('Rutele primite nu pot fi verificate. Încearcă din nou.');
        return parsed.data;
      })
      .then((value) => {
        if (!controller.signal.aborted) setResult({ state: 'ok', value });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({
          state: 'error',
          message: timeout.signal.aborted
            ? 'Furnizorul de rute răspunde prea lent. Reîncearcă.'
            : error instanceof Error
              ? error.message
              : 'Nu am putut compara rutele.',
        });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [origin?.[0], origin?.[1], loc?.lng, loc?.lat, attempt]);

  useEffect(() => {
    if (result.state !== 'ok') return;
    setSelectedId(chooseJourney(result.value.options, preference)?.id ?? null);
  }, [result, preference]);
  useEffect(() => {
    if (selected) callback.current(selected.route.geometry);
  }, [selected]);
  useEffect(() => () => callback.current(null), []);

  const start = (option: JourneyOption) => {
    if (option.mode === 'drive') {
      callback.current(option.route.geometry);
      return;
    }
    onStartActivity(option.mode, {
      id: `${destination.id}:${option.id}`,
      mode: option.mode,
      destinationId: destination.id,
      destinationName: destination.name,
      distance: option.route.distance,
      duration: option.route.duration,
    });
  };
  const opportunity = result.state === 'ok' ? result.value.opportunity : null;
  const opportunityOption =
    opportunity && result.state === 'ok'
      ? result.value.options.find((option) => option.id === opportunity.optionId)
      : undefined;

  return (
    <section className="green-switch" aria-labelledby="green-switch-title">
      <div className="green-switch-heading">
        <span className="green-switch-icon">
          <Leaf size={19} />
        </span>
        <div>
          <span className="green-switch-eyebrow">GREEN SWITCH</span>
          <h2 id="green-switch-title">Compară felul în care ajungi.</h2>
        </div>
      </div>
      <p className="green-switch-description">
        Aceeași destinație. Variante calculate pentru drumul tău.
      </p>
      <div className="journey-preferences" role="group" aria-label="Preferința călătoriei">
        <span
          className="journey-preference-indicator"
          aria-hidden="true"
          style={{
            transform: `translateX(${preferences.findIndex((p) => p.id === preference) * 100}%)`,
          }}
        />
        {preferences.map((item) => (
          <button
            key={item.id}
            onClick={() => setPreference(item.id)}
            aria-pressed={preference === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="journey-preference-hint">
        {preferences.find((item) => item.id === preference)?.hint}
      </p>

      {result.state === 'idle' && (
        <div className="journey-empty">
          <CircleHelp size={19} />
          <p>
            {!loc
              ? 'Destinația nu are o poziție suficient de precisă pentru rutare.'
              : 'Alege un punct de plecare sau folosește locația ta pentru a compara rutele. Nu presupunem că pleci dintr-un punct demo.'}
          </p>
        </div>
      )}
      {result.state === 'loading' && (
        <div className="journey-loading" role="status">
          <LoaderCircle size={18} />
          <span>Comparăm rutele disponibile…</span>
        </div>
      )}
      {result.state === 'error' && (
        <div className="journey-error" role="alert">
          <CircleHelp size={18} />
          <div>
            <p>{result.message}</p>
            <button onClick={() => setAttempt((n) => n + 1)}>
              <RotateCcw size={14} /> Reîncearcă
            </button>
          </div>
        </div>
      )}
      {result.state === 'ok' && (
        <>
          {preference !== 'fastest' && result.value.options.length > 0 && !result.value.options.some(option => option.mode !== 'drive' && option.practical) && <p className="journey-preference-hint" role="status">Nu avem o alternativă activă practică de comparat acum. Păstrăm ruta disponibilă.</p>}
          {result.value.options.length === 0 && (
            <div className="journey-empty">
              <CircleHelp size={19} />
              <p>
                Nu avem acum o rută validă de comparat. Parcările și căutarea rămân disponibile.
              </p>
              <button onClick={() => setAttempt((n) => n + 1)}>Reîncearcă</button>
            </div>
          )}
          <div className="journey-options">
            {result.value.options.map((option) => {
              const Icon = modeIcons[option.mode];
              return (
                <button
                  key={option.id}
                  className={`journey-option ${selectedId === option.id ? 'selected' : ''}`}
                  aria-pressed={selectedId === option.id}
                  onClick={() => setSelectedId(option.id)}
                >
                  <span className="journey-option-icon">
                    <Icon size={20} />
                  </span>
                  <span className="journey-option-name">
                    {modeNames[option.mode]}
                    <small>
                      {meters(option.route.distance)} · estimat
                      {!option.practical ? ' · drum lung' : ''}
                    </small>
                  </span>
                  <strong>
                    {minutes(option.route.duration)}
                    <span> min</span>
                  </strong>
                </button>
              );
            })}
          </div>
          {selected && (
            <div className="selected-journey" aria-live="polite">
              <p>{selected.note}</p>
              <button className="journey-primary-action" onClick={() => start(selected)}>
                {selected.mode === 'drive' ? 'Vezi traseul auto' : 'Pornește activitatea'}
                <ArrowRight size={17} />
              </button>
              {selected.mode !== 'drive' && (
                <small>
                  Alegerea rutei nu acordă coins. Recompensa urmează doar după o activitate
                  eligibilă.
                </small>
              )}
            </div>
          )}
          {opportunity && opportunityOption && (
            <aside className="flow-opportunity" aria-label="FLOW Opportunity">
              <span className="flow-opportunity-badge">
                <Leaf size={13} /> FLOW OPPORTUNITY
              </span>
              <h3>
                {opportunity.mode === 'cycle'
                  ? 'Poți face acest drum și cu bicicleta.'
                  : 'Poți face acest drum și pe jos.'}
              </h3>
              <p>
                {opportunity.extraSeconds > 0
                  ? `Aproximativ ${minutes(opportunity.extraSeconds)} min în plus`
                  : opportunity.extraSeconds < -30
                    ? `Aproximativ ${minutes(-opportunity.extraSeconds)} min mai puțin`
                    : 'Durată apropiată de ruta auto'}{' '}
                · {meters(opportunity.activeMeters)} de mișcare.
              </p>
              <button onClick={() => setSelectedId(opportunity.optionId)}>
                Vezi alternativa <ArrowRight size={14} />
              </button>
              <small>
                Estimare pe rute calculate, fără căutarea parcării. Nu este o evaluare a siguranței.
              </small>
            </aside>
          )}
          <details className="journey-data-details">
            <summary>
              Disponibilitate și surse <ChevronDown size={14} />
            </summary>
            <div>
              {result.value.unavailable.map((item) => (
                <p key={item.mode}>
                  <strong>{modeNames[item.mode]}:</strong> {item.reason}
                </p>
              ))}
              {result.value.options.map((option) => (
                <p key={option.id}>
                  <strong>{modeNames[option.mode]}:</strong> {option.route.source}. Distanță și
                  durată estimate.
                </p>
              ))}
              <p>{result.value.coverage}</p>
              <p>Calculat: {new Date(result.value.fetchedAt).toLocaleString('ro-RO')}.</p>
              <p>
                Costul parcării se vede separat în SmartMatch. Nu presupunem costuri auto sau emisii
                evitate. Transportul public nu este comparat fără date și rutare potrivite.
              </p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
