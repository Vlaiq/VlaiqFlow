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
  formatAmountRo,
} from '@vlaiq/shared';
import { useCompleteJourneys } from './useCompleteJourneys';
import { JourneyTimeline } from './JourneyTimeline';
import {
  carNavigationHref,
  journeyDistance,
  journeyMinutes,
  missingRanks,
  plannedActivity,
} from './journeyPresentation';
import { FreeChance, ScoreBreakdown } from '../parking/ParkingFacts';
import { pct, stayLabel } from '../parking/recommendationLabels';
import { PARKING_MODE_LABEL, arriveIso, type ParkingSettings } from '../parking/settings';
import './journey.css';
export type { ActiveJourneyContext } from '@vlaiq/shared';
export interface JourneyMapSelection {
  value: CompleteJourney;
  legId: string | null;
}
interface Props {
  origin: Coordinate | null;
  destination: Destination;
  /** Same settings as the "Unde parchezi" list, so both show the same SmartMatch parkings. */
  parkingSettings: ParkingSettings;
  onJourney: (selection: JourneyMapSelection | null) => void;
  onInspectRoute?: () => void;
  /** Opens the parking preview for a SmartMatch option id, when the list has it. */
  onOpenParking?: (parkingId: string) => void;
  onStartActivity: (mode: 'walk' | 'cycle', journey?: ActiveJourneyContext) => void;
}
const amount = (p: NonNullable<CompleteJourney['parking']>) =>
  `${formatAmountRo(p.fee.minorUnits! / 100)} ${p.fee.currency ?? ''}`.trim();
const fee = (p: NonNullable<CompleteJourney['parking']>) =>
  p.fee.minorUnits === null ? 'Preț necunoscut' : p.fee.minorUnits === 0 ? 'Gratuit' : amount(p);
/** "luni, 16 noiembrie, 10:00": no seconds, the weekday matters for Timpark's schedule. */
const when = (iso: string) =>
  new Date(iso).toLocaleString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  parkingSettings,
  onJourney,
  onStartActivity,
  onInspectRoute,
  onOpenParking,
}: Props) {
  const [preference, setPreference] = useState<JourneyPreference>('balanced');
  const [manualId, setManualId] = useState<string | null>(null);
  const [legId, setLegId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [parkingOpen, setParkingOpen] = useState(false);
  const callback = useRef(onJourney);
  callback.current = onJourney;
  const loc = destination.location;
  const arriveAt = arriveIso(parkingSettings);
  const result = useCompleteJourneys(
    origin && loc
      ? CompleteJourneyRequest.parse({
          origin,
          destination: [loc.lng, loc.lat],
          stayMinutes: parkingSettings.stayMinutes,
          maxWalkMinutes: parkingSettings.maxWalkMinutes,
          parkingPreference: parkingSettings.mode,
          ...(arriveAt ? { arriveAt } : {}),
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
  const navHref = selected
    ? carNavigationHref(selected, value?.journeys ?? [], destination.name)
    : null;
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
      <p className="journey-parking-settings">
        <SlidersHorizontal size={14} aria-hidden />
        <span>
          Parcare: {stayLabel(parkingSettings.stayMinutes)} · maximum {parkingSettings.maxWalkMinutes}{' '}
          min pe jos · {PARKING_MODE_LABEL[parkingSettings.mode]}
          {arriveAt ? ` · sosire ${when(arriveAt)}` : ' · acum'}. Se
          schimbă din „Unde parchezi”.
        </span>
      </p>
      {!origin && (
        <div className="journey-empty">
          <MapPin size={18} />
          <p>
            Alege plecarea mai sus ca să compari auto + parcare cu mersul pe jos și bicicleta. Nu
            folosim automat o locație demonstrativă.
          </p>
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
                    {j.parking ? (
                      <>
                        <small className="journey-option-parking">
                          P{j.parking.match.rank} · {j.parking.name}
                        </small>
                        <small>
                          ~{pct(j.parking.match.freeChance.value)} șanse estimate de loc ·{' '}
                          {fee(j.parking)}
                        </small>
                      </>
                    ) : (
                      <small>
                        {journeyDistance(j.distance.value!)}
                        {!j.practical && ' · drum lung'}
                      </small>
                    )}
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
          {missingRanks(value.journeys).length > 0 && (
            <p className="journey-missing-note">
              {missingRanks(value.journeys)
                .map((r) => `P${r}`)
                .join(', ')}{' '}
              {missingRanks(value.journeys).length === 1 ? 'nu apare' : 'nu apar'} aici: traseul
              calculat pe jos de la parcare depășește {parkingSettings.maxWalkMinutes} min sau nu a
              putut fi calculat acum. Lista „Unde parchezi” poate folosi o estimare a mersului.
            </p>
          )}
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
                <section className="journey-parking-focus" aria-label="Parcarea aleasă">
                  <div className="journey-parking-focus-head">
                    <span className="journey-parking-focus-rank" aria-hidden>
                      P{selected.parking.match.rank}
                    </span>
                    <div>
                      <span>PARCHEZI AICI · LOCUL {selected.parking.match.rank}</span>
                      <h4>{selected.parking.name}</h4>
                    </div>
                  </div>
                  <FreeChance
                    value={selected.parking.match.freeChance.value}
                    quality={selected.parking.match.freeChance.quality}
                    compact
                  />
                  <dl>
                    <div>
                      <dt>Cost pentru {stayLabel(selected.parking.stayMinutes)}</dt>
                      <dd>{fee(selected.parking)}</dd>
                    </div>
                    <div>
                      <dt>Apoi pe jos</dt>
                      <dd>
                        {(() => {
                          const walk = selected.legs.find((l) => l.type === 'walk');
                          return walk && walk.type === 'walk'
                            ? `${journeyMinutes(walk.route.duration)} min`
                            : 'Necunoscut';
                        })()}
                      </dd>
                    </div>
                    <div>
                      <dt>Capacitate</dt>
                      <dd>
                        {selected.parking.match.capacity.value != null
                          ? `~${selected.parking.match.capacity.value} locuri`
                          : 'Necunoscută'}
                      </dd>
                    </div>
                    {selected.parking.match.smsCode && (
                      <div>
                        <dt>Cod SMS Timpark</dt>
                        <dd>{selected.parking.match.smsCode}</dd>
                      </div>
                    )}
                  </dl>
                  <p className="journey-uncertainty">
                    Timpul de căutare și manevrare a parcării este necunoscut și nu este inclus.
                    Ocupare live: necunoscută.
                  </p>
                  {onOpenParking && (
                    <button
                      className="journey-parking-open"
                      onClick={() => onOpenParking(selected.parking!.id)}
                    >
                      Previzualizează parcarea <ArrowRight size={15} />
                    </button>
                  )}
                </section>
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
                      : selected.parking.fee.minorUnits === 0
                        ? 'Gratuit la ora aleasă'
                        : `Tarif orientativ: ${amount(selected.parking)}`}{' '}
                    · {selected.parking.stayMinutes} min
                  </p>
                  <p>{selected.parking.fee.note}</p>
                  <small>
                    {selected.parking.fee.source} · tarif pentru{' '}
                    {when(selected.parking.tariffAt)}. Combustibilul nu
                    este inclus.
                  </small>
                  {selected.parking.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                  <ScoreBreakdown
                    score={selected.parking.match.score}
                    price={{
                      amount:
                        selected.parking.fee.minorUnits === null
                          ? null
                          : selected.parking.fee.minorUnits / 100,
                      currency: selected.parking.fee.currency,
                    }}
                    freeChance={selected.parking.match.freeChance.value}
                    params={selected.parking.match.params}
                  />
                  <small>
                    Șanse estimate din: {selected.parking.match.freeChance.factors.join('; ')}.{' '}
                    {selected.parking.match.freeChance.source}
                  </small>
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
