import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bike,
  Car,
  Check,
  ChevronDown,
  CircleHelp,
  Footprints,
  Leaf,
  LoaderCircle,
  MapPin,
  Navigation2,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CompleteJourneyRequest,
  type CompleteJourney,
  type Coordinate,
  type Destination,
  type JourneyCategory,
  type JourneyPreference,
  type ActiveJourneyContext,
} from '@vlaiq/shared';
import { useCompleteJourneys } from './useCompleteJourneys';
import { JourneyTimeline } from './JourneyTimeline';
import {
  carNavigationHref,
  journeyDistance,
  journeyMinutes,
  plannedActivity,
} from './journeyPresentation';
import './journey.css';
export type { ActiveJourneyContext } from '@vlaiq/shared';
export interface JourneyMapSelection {
  value: CompleteJourney;
  legId: string | null;
}
interface Props {
  origin: Coordinate | null;
  destination: Destination;
  onJourney: (selection: JourneyMapSelection | null) => void;
  onInspectRoute?: () => void;
  onStartActivity: (mode: 'walk' | 'cycle', journey?: ActiveJourneyContext) => void;
}
const names: Record<JourneyCategory, string> = {
  car_park_walk: 'Auto + parcare + mers',
  cycle: 'Cu bicicleta',
  walk: 'Pe jos',
};
const icons = { car_park_walk: Car, cycle: Bike, walk: Footprints };
const preferences: { id: JourneyPreference; label: string; icon: typeof Leaf }[] = [
  { id: 'fastest', label: 'Cea mai rapidă', icon: Navigation2 },
  { id: 'balanced', label: 'Echilibrată', icon: SlidersHorizontal },
  { id: 'green', label: 'Mai ecologică', icon: Leaf },
];
export function GreenSwitch({
  origin,
  destination,
  onJourney,
  onStartActivity,
  onInspectRoute,
}: Props) {
  const [preference, setPreference] = useState<JourneyPreference>('balanced');
  const [manualId, setManualId] = useState<string | null>(null);
  const [legId, setLegId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stay, setStay] = useState(120),
    [maxWalk, setMaxWalk] = useState(12);
  const [parkingPreference, setParkingPreference] = useState<'balanced' | 'cheap' | 'less_walk'>(
    'balanced',
  );
  const [tariffTime, setTariffTime] = useState('');
  const [parkingOpen, setParkingOpen] = useState(false);
  const callback = useRef(onJourney);
  callback.current = onJourney;
  const loc = destination.location;
  const result = useCompleteJourneys(
    origin && loc
      ? CompleteJourneyRequest.parse({
          origin,
          destination: [loc.lng, loc.lat],
          stayMinutes: stay,
          maxWalkMinutes: maxWalk,
          parkingPreference,
          ...(tariffTime ? { arriveAt: new Date(tariffTime).toISOString() } : {}),
        })
      : null,
    attempt,
  );
  const value = result.state === 'ok' ? result.value : null;
  const selected = value?.journeys.find(
    (j) => j.id === (manualId ?? value.rankings[preference].recommendedId),
  );
  useEffect(() => {
    setManualId(null);
    setLegId(null);
    setParkingOpen(false);
  }, [value]);
  useEffect(() => {
    callback.current(selected ? { value: selected, legId } : null);
  }, [selected, legId]);
  useEffect(() => () => callback.current(null), []);
  function select(j: CompleteJourney) {
    setManualId(j.id);
    setLegId(null);
    setParkingOpen(false);
  }
  const opportunity = value?.opportunity;
  const alternative = value?.journeys.find((j) => j.id === opportunity?.journeyId);
  const navHref = selected ? carNavigationHref(selected) : null;
  return (
    <section
      className="green-switch"
      aria-labelledby="green-switch-title"
      aria-busy={result.state === 'loading'}
    >
      <div className="green-switch-heading">
        <span className="green-switch-icon">
          <Leaf size={20} />
        </span>
        <div>
          <span className="green-switch-eyebrow">FLOW SMART JOURNEY</span>
          <h2 id="green-switch-title">Un drum. Mai multe posibilități.</h2>
        </div>
      </div>
      <p className="green-switch-description">
        De la plecare până la destinație. Compară rutele, parcarea și mersul final într-o singură
        alegere.
      </p>
      <div
        className="journey-preferences"
        role="group"
        aria-label="Green Switch · preferința călătoriei"
      >
        <span
          className="journey-preference-indicator"
          style={{
            transform: `translateX(${preferences.findIndex((p) => p.id === preference) * 100}%)`,
          }}
          aria-hidden
        />
        {preferences.map((p) => (
          <button
            key={p.id}
            aria-pressed={preference === p.id}
            onClick={() => {
              setPreference(p.id);
              setManualId(null);
              setLegId(null);
            }}
          >
            <p.icon size={14} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <details className="journey-settings">
        <summary>
          <SlidersHorizontal size={14} /> Opțiuni pentru parcare <ChevronDown size={14} />
        </summary>
        <div>
          <label>
            Durata parcării
            <select
              aria-label="Durata parcării"
              value={stay}
              onChange={(e) => setStay(+e.target.value)}
            >
              {[30, 60, 120, 240, 480].map((n) => (
                <option key={n} value={n}>
                  {n < 60 ? `${n} min` : `${n / 60} h`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mers după parcare
            <select
              aria-label="Mers după parcare"
              value={maxWalk}
              onChange={(e) => setMaxWalk(+e.target.value)}
            >
              {[5, 8, 12, 15, 20].map((n) => (
                <option key={n} value={n}>
                  maximum {n} min
                </option>
              ))}
            </select>
          </label>
          <label>
            Preferința parcării
            <select
              aria-label="Preferința parcării"
              value={parkingPreference}
              onChange={(e) => setParkingPreference(e.target.value as typeof parkingPreference)}
            >
              <option value="balanced">Echilibrat</option>
              <option value="cheap">Cost cunoscut mai mic</option>
              <option value="less_walk">Mai puțin mers</option>
            </select>
          </label>
          <label>
            Ora pentru tarif · ora dispozitivului
            <input
              type="datetime-local"
              value={tariffTime}
              min="2020-01-01T00:00"
              max="2100-12-31T23:59"
              onChange={(e) => {
                const next = e.target.value;
                if (
                  !next ||
                  (Number.isFinite(new Date(next).getTime()) &&
                    next.slice(0, 4) >= '2020' &&
                    next.slice(0, 4) <= '2100')
                )
                  setTariffTime(next);
              }}
            />
          </label>
          <p>
            Fără oră aleasă, tariful este calculat pentru acum. Ora nu este o predicție a sosirii.
          </p>
        </div>
      </details>
      {!origin && (
        <div className="journey-empty">
          <MapPin size={18} />
          <p>Alege plecarea mai sus. Nu folosim automat o locație demonstrativă.</p>
        </div>
      )}
      {result.state === 'loading' && (
        <div className="journey-loading" role="status">
          <LoaderCircle size={20} />
          <div>
            <strong>Construim drumul complet…</strong>
            <small>Verificăm parcările și rutele disponibile.</small>
            <span className="journey-loading-track" />
          </div>
        </div>
      )}
      {result.state === 'error' && (
        <div className="journey-error" role="alert">
          <CircleHelp size={19} />
          <div>
            <p>{result.message}</p>
            <button onClick={() => setAttempt(attempt + 1)}>
              <RotateCcw size={14} /> Încearcă din nou
            </button>
          </div>
        </div>
      )}
      {value && (
        <>
          <p className="journey-preference-hint">{value.rankings[preference].explanation}</p>
          <div className="journey-options" role="group" aria-label="Călătorii calculate">
            {value.journeys.map((j) => {
              const Icon = icons[j.category];
              const active = selected?.id === j.id;
              return (
                <button
                  key={j.id}
                  data-category={j.category}
                  className={`journey-option ${active ? 'selected' : ''}`}
                  aria-pressed={active}
                  onClick={() => select(j)}
                >
                  <span className="journey-option-icon">
                    <Icon size={20} />
                  </span>
                  <span className="journey-option-name">
                    {names[j.category]}
                    <small>
                      {j.parking?.name ?? journeyDistance(j.distance.value!)}
                      {!j.practical && ' · drum lung'}
                    </small>
                    <span className="journey-option-quality">
                      {active ? <Check size={11} /> : null} Timp estimat pe trasee
                    </span>
                  </span>
                  <strong>
                    {journeyMinutes(j.travelSeconds.value!)}
                    <span> min</span>
                  </strong>
                </button>
              );
            })}
          </div>
          <p className="journey-live-status" role="status" aria-live="polite">
            {selected
              ? `${names[selected.category]} selectat · ${journeyMinutes(selected.travelSeconds.value!)} min pe trasee calculate.`
              : 'Nicio călătorie completă nu poate fi calculată acum.'}
          </p>
          {selected && (
            <article className="selected-journey" key={selected.id}>
              <div className="journey-summary-heading">
                <span>
                  {selected.parking
                    ? 'AUTO → PARCARE → PE JOS'
                    : selected.category === 'cycle'
                      ? 'BICICLETĂ → DESTINAȚIE'
                      : 'PE JOS → DESTINAȚIE'}
                </span>
                <h3>{destination.name}</h3>
              </div>
              <div className="journey-summary-metrics">
                <div>
                  <strong>{journeyMinutes(selected.travelSeconds.value!)}</strong>
                  <span>min pe trasee</span>
                </div>
                <div>
                  <strong>{journeyDistance(selected.distance.value!)}</strong>
                  <span>distanță calculată</span>
                </div>
              </div>
              {selected.parking && (
                <p className="journey-uncertainty">
                  Timpul de căutare și manevrare a parcării este necunoscut și nu este inclus.
                  Disponibilitate neconfirmată.
                </p>
              )}
              <JourneyTimeline
                journey={selected}
                selectedLeg={legId}
                onSelect={(id) => {
                  setLegId(id);
                  onInspectRoute?.();
                }}
              />
              {selected.parking && (
                <div className="journey-parking-actions">
                  <button
                    onClick={() => {
                      setLegId(null);
                      onInspectRoute?.();
                      callback.current({ value: selected, legId: null });
                    }}
                  >
                    Vezi traseul
                  </button>
                  <button aria-expanded={parkingOpen} onClick={() => setParkingOpen(!parkingOpen)}>
                    Detalii parcare <ChevronDown size={14} />
                  </button>
                </div>
              )}
              {selected.parking && parkingOpen && (
                <section className="journey-parking-details" aria-label="Parcarea din călătorie">
                  <h4>{selected.parking.name}</h4>
                  <p>
                    Disponibilitate neconfirmată ·{' '}
                    {selected.parking.access === 'unknown'
                      ? 'Acces neconfirmat'
                      : 'Acces public în sursă'}
                  </p>
                  <p>
                    {selected.parking.fee.minorUnits === null
                      ? 'Preț necunoscut'
                      : `Tarif orientativ: ${(selected.parking.fee.minorUnits / 100).toLocaleString('ro-RO')} ${selected.parking.fee.currency ?? ''}`}{' '}
                    · {selected.parking.stayMinutes} min
                  </p>
                  <p>{selected.parking.fee.note}</p>
                  <small>
                    {selected.parking.fee.source} · tarif pentru{' '}
                    {new Date(selected.parking.tariffAt).toLocaleString('ro-RO')}. Combustibilul nu
                    este inclus.
                  </small>
                  {selected.parking.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </section>
              )}
              {selected.category !== 'car_park_walk' ? (
                <button
                  className="journey-primary-action"
                  onClick={() => {
                    const context = plannedActivity(selected, destination);
                    if (context) onStartActivity(context.mode, context);
                  }}
                >
                  <span>Pornește această călătorie</span>
                  <ArrowRight size={17} />
                </button>
              ) : (
                navHref && (
                  <a className="journey-primary-action" href={navHref}>
                    <span>Navighează până la parcare</span>
                    <Navigation2 size={17} />
                  </a>
                )
              )}
              <small>
                {selected.category === 'car_park_walk'
                  ? 'Navigația auto se oprește la parcare. Etapa pietonală rămâne aici, în planificator.'
                  : 'Se deschide Motion. GPS-ul pornește doar la cerere; alegerea rutei acordă zero coins.'}
              </small>
            </article>
          )}
          {alternative && opportunity && (
            <aside className="flow-opportunity">
              <div className="flow-opportunity-badge">
                <Leaf size={14} /> FLOW OPPORTUNITY
              </div>
              <h3>Un drum bun și pentru mișcare.</h3>
              <p>
                {names[alternative.category]} · {journeyMinutes(alternative.travelSeconds.value!)}{' '}
                min · {journeyDistance(alternative.distance.value!)}.
              </p>
              <p>
                {opportunity.extraSeconds <= 0
                  ? `${Math.abs(Math.round(opportunity.extraSeconds / 60))} min mai puțin pe trasee`
                  : `+${Math.ceil(opportunity.extraSeconds / 60)} min pe trasee`}{' '}
                față de auto + mers final.
              </p>
              <button
                onClick={() => {
                  setPreference('green');
                  select(alternative);
                }}
              >
                Vezi alternativa <ArrowRight size={15} />
              </button>
              <small>{opportunity.explanation}</small>
            </aside>
          )}
          {!!value.unavailable.length && (
            <div className="journey-unavailable">
              <strong>Variante indisponibile acum</strong>
              {value.unavailable.map((u) => (
                <p key={u.category}>
                  <span>{names[u.category]}</span>
                  {u.reason}
                </p>
              ))}
            </div>
          )}
          {!value.journeys.length && (
            <button className="journey-retry" onClick={() => setAttempt(attempt + 1)}>
              <RotateCcw size={14} /> Reîncearcă planificarea
            </button>
          )}
          <details className="journey-data-details">
            <summary>
              Surse și limitele comparației <ChevronDown size={14} />
            </summary>
            <div>
              <p>{value.coverage}</p>
              <p>
                Calcul: {new Date(value.calculatedAt).toLocaleString('ro-RO')}. Timpii sunt
                estimați, nu sosiri garantate.
              </p>
              {selected?.legs
                .filter((l) => l.type !== 'parking')
                .map((l) => (
                  <p key={l.id}>
                    {l.type}: {l.route.source} · profil {l.profile}
                  </p>
                ))}
              {[...new Set([...value.limitations, ...(selected?.limitations ?? [])])].map((l) => (
                <p key={l}>{l}</p>
              ))}
              <a href="/data">Vezi proveniența datelor</a>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
