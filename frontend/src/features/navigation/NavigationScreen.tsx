import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Compass,
  Flag,
  Layers,
  Leaf,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Navigation2,
  Pause,
  Play,
  RotateCcw,
  Route,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { NavigationRoute } from '@vlaiq/shared';
import { brand } from '@vlaiq/shared';
import { useNavigation } from './useNavigation';
import { loadNavPlaces, type NavPlaces } from './places';
import { handoffFromUrl } from './scenario';
import { formatDistance, instruction } from './geometry';
import { NavigationMap } from './NavigationMap';
import { saveCar } from '../car/carStore';
import { useTheme } from '../../app/theme';
import './navigation.css';

function TurnIcon({ step }: { step?: NavigationRoute['steps'][number] }) {
  if (step?.type === 'arrive') return <Flag />;
  if (step?.type.includes('roundabout') || step?.type === 'rotary') return <RotateCcw />;
  if (step?.modifier === 'uturn') return <ArrowDown />;
  if (step?.modifier === 'slight left') return <ArrowUpLeft />;
  if (step?.modifier === 'slight right') return <ArrowUpRight />;
  if (step?.modifier?.includes('left')) return <ArrowLeft />;
  if (step?.modifier?.includes('right')) return <ArrowRight />;
  return <ArrowUp />;
}
const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
const percent = (share: number) => `${Math.round(share * 100)}%`;
const walkLabel = (m: number) => `${Math.max(1, Math.round(m))} min`;
/** Seconds the "parking full" offer stays up before it keeps the current route (spec §6.9). */
const OFFER_SECONDS = 15;

/** Loads the destinations from the data snapshots, then shows the navigation view. */
export function NavigationScreen() {
  const [places, setPlaces] = useState<NavPlaces | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(null);
    loadNavPlaces(window.location.search).then(
      (p) => alive && setPlaces(p),
      (e: unknown) =>
        alive && setFailed(e instanceof Error ? e.message : 'Destinațiile nu sunt disponibile.'),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (failed) {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <section role="alert" className="max-w-sm rounded-card border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold">Navigația nu poate porni</h1>
          <p className="mt-2 text-sm text-muted">{failed} Verifică dacă backend-ul rulează.</p>
          <button
            className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Încearcă din nou
          </button>
          <a href="/" className="ml-4 inline-flex min-h-11 items-center text-sm text-primary">
            Înapoi la hartă
          </a>
        </section>
      </main>
    );
  }
  if (!places) {
    return (
      <div role="status" className="flex h-full items-center justify-center text-muted">
        Se încarcă destinațiile…
      </div>
    );
  }
  return <NavigationView places={places} />;
}

function NavigationView({ places }: { places: NavPlaces }) {
  const { theme } = useTheme();
  const nav = useNavigation(places);
  const [expanded, setExpanded] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const active = nav.mode === 'live' || nav.mode === 'demo';
  const demo = nav.mode === 'demo';
  const handoff = useMemo(() => handoffFromUrl(window.location.search), []);
  const backup = handoff.backup;
  // DEMO "parking full" offer: null = not shown, otherwise seconds left before it keeps the current route.
  const [offer, setOffer] = useState<number | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [carSaved, setCarSaved] = useState<'ok' | 'blocked' | null>(null);
  useEffect(() => {
    if (!demo) {
      setOffer(null);
      setFullName(null);
    }
  }, [demo]);
  useEffect(() => {
    if (offer == null) return;
    if (offer <= 0) {
      setOffer(null);
      return;
    }
    const t = window.setTimeout(() => setOffer((s) => (s == null ? s : s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [offer]);
  const showFull = () => {
    if (!backup) return;
    setFullName(nav.destination.name);
    setOffer(OFFER_SECONDS);
    if (!nav.muted && 'speechSynthesis' in window) {
      const text = new SpeechSynthesisUtterance(
        `Simulare: ${nav.destination.name} s-a umplut. ${backup.place.name} are șanse estimate de ${percent(backup.chance)}. Schimbi?`,
      );
      text.lang = 'ro-RO';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(text);
    }
  };
  const acceptSwitch = () => {
    if (!backup) return;
    setOffer(null);
    nav.switchTarget(backup.place);
  };
  const finalWalk = nav.switched ? backup?.walkMinutes : handoff.current.walkMinutes;
  const arrival = nav.metrics
    ? new Intl.DateTimeFormat('ro-RO', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Bucharest',
      }).format(Date.now() + nav.metrics.seconds * 1000)
    : '—';
  const currentStep = nav.arrived ? nav.route?.steps.at(-1) : nav.metrics?.step;
  const nextStep = nav.route?.steps.find((s) => s.index > (currentStep?.index ?? 0));
  const speed =
    demo && (nav.arrived || nav.paused)
      ? 0
      : nav.fix?.speed != null
        ? Math.round(nav.fix.speed * 3.6)
        : null;

  return (
    <main className={`navigation-screen ${active ? 'is-navigating' : 'is-preview'}`}>
      <NavigationMap
        theme={theme}
        route={nav.route}
        routes={nav.routes}
        fix={nav.fix}
        mode={nav.mode}
        progress={nav.progress}
        lengths={nav.lengths}
        perspective={nav.perspective}
        follow={nav.follow}
        onDetach={() => nav.setFollow(false)}
        onPick={nav.mapPick}
        pickOrigin={nav.pickOrigin}
        recenter={recenter}
      />

      <header className="nav-topline">
        {!active && (
          <a className="nav-back icon-button" href="/" aria-label="Înapoi la explorare">
            <ArrowLeft />
          </a>
        )}
        <a href="/" className="nav-wordmark" aria-label={`${brand.product} — explorare`}>
          <span className="brand-mark">
            <Navigation2 size={17} fill="currentColor" />
          </span>{' '}
          {brand.team}
          <span className="wordmark-light">FLOW</span>
        </a>
        {!active && (
          <span className="nav-location-label">
            TIMIȘOARA <span>/</span> PREVIZUALIZARE RUTĂ
          </span>
        )}
        {active && (
          <span className={`mode-chip ${demo ? 'is-demo' : ''}`}>
            <i />
            {demo ? 'DEMO' : 'GPS LIVE'}
            {demo && <span>· poziție simulată</span>}
          </span>
        )}
      </header>

      {!active && (
        <section className="route-preview panel" aria-label="Previzualizare rută">
          <div className="preview-eyebrow">
            <span className="tiny-route-icon">
              <Route size={16} />
            </span>{' '}
            CĂLĂTORIA TA <span className="preview-mode">AUTO</span>
          </div>
          <h1>
            Drumul tău.
            <br />
            <span>Mai simplu.</span>
          </h1>
          <p className="preview-description">Alege destinația. Noi îți arătăm drumul.</p>
          <div className="journey-inputs">
            <div className="journey-line">
              <span className="origin-dot" />
              <div>
                <small>PLECARE PENTRU PREVIZUALIZARE</small>
                <button
                  className="origin-select"
                  onClick={() => nav.setPickOrigin(!nav.pickOrigin)}
                >
                  {nav.manualOrigin ? 'Punct ales pe hartă' : nav.originName}
                  <ChevronDown size={15} />
                </button>
              </div>
            </div>
            <div className="journey-connector" />
            <div className="journey-line">
              <MapPin size={19} className="destination-pin" />
              <div>
                <label htmlFor="nav-destination">DESTINAȚIE</label>
                <select
                  id="nav-destination"
                  value={nav.destination.id}
                  onChange={(e) =>
                    nav.setDestination(nav.destinations.find((d) => d.id === e.target.value)!)
                  }
                >
                  {nav.destinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="route-options" aria-label="Rute disponibile">
            {nav.loading && (
              <div className="route-loading" role="status">
                <LoaderCircle className="spin" size={19} /> Calculăm ruta pe drumuri reale…
              </div>
            )}
            {!nav.loading &&
              nav.routes.map((route, index) => (
                <button
                  key={route.id}
                  className={`route-option ${index === nav.selected ? 'selected' : ''}`}
                  onClick={() => nav.selectRoute(index)}
                  aria-pressed={index === nav.selected}
                >
                  <span className="route-option-radio">
                    {index === nav.selected && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="route-option-title">
                    {index === 0 ? 'Ruta principală' : `Alternativa ${index}`}
                    <small>{formatDistance(route.distance)} · estimare fără trafic live</small>
                  </span>
                  <strong>
                    {minutes(route.duration)}
                    <small>min</small>
                  </strong>
                </button>
              ))}
            {!nav.loading && !nav.route && (
              <div className="route-empty">
                <Route size={22} />
                <span>
                  Ruta apare aici după conectarea
                  <br />
                  la serviciul de navigație.
                </span>
              </div>
            )}
          </div>
          <div className="preview-footnote">
            <Leaf size={15} />
            <span>Un drum mai clar. Un oraș mai respirabil.</span>
          </div>
          <button
            className="start-navigation"
            disabled={nav.loading || nav.mode === 'acquiring'}
            onClick={nav.startLive}
          >
            {nav.mode === 'acquiring' ? (
              <LoaderCircle className="spin" size={20} />
            ) : (
              <Navigation2 size={19} fill="currentColor" />
            )}
            {nav.mode === 'acquiring' ? 'Conectare GPS…' : 'Start navigație'}
            <ArrowRight size={18} />
          </button>
          <button
            className="demo-start"
            disabled={!nav.route || nav.loading || nav.mode === 'acquiring'}
            onClick={nav.startDemo}
          >
            <Play size={15} fill="currentColor" /> Încearcă experiența DEMO <span>Fără GPS</span>
          </button>
          <p className="gps-disclosure">
            Start folosește poziția ta reală. DEMO simulează deplasarea pe ruta selectată.
          </p>
        </section>
      )}

      {active && (
        <>
          <section
            className={`maneuver-panel panel ${nav.arrived ? 'has-arrived' : ''}`}
            aria-label="Următoarea manevră"
            aria-live="polite"
          >
            <div className="maneuver-primary">
              <span className="maneuver-symbol">
                {nav.arrived ? <Check /> : <TurnIcon step={currentStep} />}
              </span>
              <div>
                <strong>
                  {nav.arrived ? 'Ai ajuns' : formatDistance(nav.metrics?.maneuverDistance ?? 0)}
                </strong>
                <p>{nav.arrived ? nav.destination.name : instruction(currentStep)}</p>
              </div>
            </div>
            {!nav.arrived && (
              <div className="maneuver-road">{currentStep?.road || 'Urmează traseul marcat'}</div>
            )}
            {!nav.arrived && nextStep && (
              <div className="next-maneuver">
                <span>Apoi</span>
                <TurnIcon step={nextStep} />
                <span>{nextStep.road || instruction(nextStep)}</span>
              </div>
            )}
          </section>
          <div
            className={`speedometer ${demo ? 'demo-speed' : ''}`}
            aria-label={
              speed != null
                ? `${speed} kilometri pe oră${demo ? ', simulat' : nav.fix?.speedSource === 'estimated' ? ', estimat' : ''}`
                : 'Viteză indisponibilă'
            }
          >
            <strong>{speed ?? '—'}</strong>
            <span>km/h</span>
            {demo ? (
              <small>DEMO</small>
            ) : (
              nav.fix?.speedSource === 'estimated' && <small>ESTIMAT</small>
            )}
          </div>
          {demo && (
            <div className="demo-playback panel">
              <span className="demo-live-dot" />
              <span>SIMULARE PE TRASEU REAL</span>
              <button
                className="icon-button demo-speed-toggle"
                onClick={() =>
                  nav.setPlayback(nav.playback === 1 ? 2 : nav.playback === 2 ? 4 : 1)
                }
                aria-label={`Viteza simulării: ${nav.playback}×. Apasă pentru a schimba`}
              >
                {nav.playback}×
              </button>
              <button
                className="icon-button"
                onClick={() => nav.setPaused(!nav.paused)}
                disabled={nav.arrived}
                aria-label={nav.paused ? 'Continuă demonstrația' : 'Pauză demonstrație'}
              >
                {nav.paused ? (
                  <Play size={17} fill="currentColor" />
                ) : (
                  <Pause size={17} fill="currentColor" />
                )}
              </button>
              <button
                className="icon-button"
                onClick={nav.switched ? nav.stop : nav.startDemo}
                aria-label={
                  nav.switched
                    ? 'Oprește demonstrația și revino la ruta inițială'
                    : 'Repornește demonstrația'
                }
              >
                <RotateCcw size={17} />
              </button>
              {backup && !nav.switched && !nav.arrived && offer == null && (
                <button className="demo-scenario" onClick={showFull}>
                  Simulează: parcarea s-a umplut
                </button>
              )}
            </div>
          )}
          {demo && offer != null && backup && (
            <section className="full-offer panel" role="alert" aria-label="Parcarea s-a umplut">
              <span className="full-offer-tag">SIMULARE</span>
              <h2>{fullName} s-a umplut.</h2>
              <p>
                <strong>{backup.place.name}</strong>: ~{percent(backup.chance)} șanse estimate de loc
                {handoff.current.chance != null && ` (față de ~${percent(handoff.current.chance)})`},{' '}
                {walkLabel(backup.walkMinutes)} pe jos
                {handoff.final ? ` până la ${handoff.final.name}` : ''}
                {handoff.current.walkMinutes != null &&
                  ` (acum ${walkLabel(handoff.current.walkMinutes)})`}
                . Cifre SmartMatch, estimate; ruta nouă se calculează din poziția simulată.
              </p>
              <button className="full-offer-switch" onClick={acceptSwitch}>
                Schimbă spre {backup.place.name}
              </button>
              <button className="full-offer-keep" onClick={() => setOffer(null)}>
                Rămân pe ruta actuală · {offer} s
              </button>
            </section>
          )}
          {nav.arrived && handoff.final && (
            <section className="walk-handoff panel" aria-label="Continuă pe jos">
              <strong>Ai parcat. Continuă pe jos până la {handoff.final.name}.</strong>
              <p>
                {finalWalk != null
                  ? `Aproximativ ${walkLabel(finalWalk)} pe jos (estimat). `
                  : ''}
                {nav.switched && backup
                  ? `În planificator, deschide „${backup.place.name}” ca să vezi ruta pe jos pe hartă.`
                  : 'În planificator vezi ruta pe jos de la parcare, desenată pe hartă.'}
              </p>
              <div className="walk-handoff-actions">
                <button
                  onClick={() =>
                    setCarSaved(
                      saveCar({
                        version: 1,
                        name: nav.destination.name.slice(0, 120),
                        coordinate: nav.destination.coordinate,
                        parkedAt: new Date().toISOString(),
                        // A DEMO switch goes to the backup, whose Timpark facts we were not given.
                        tariff: nav.switched ? null : handoff.parking.tariff,
                        smsCode: nav.switched ? null : handoff.parking.smsCode,
                        paidUntil: null,
                        destination: handoff.final,
                        walkMinutes: finalWalk ?? null,
                        stayMinutes: handoff.parking.stayMinutes,
                      })
                        ? 'ok'
                        : 'blocked',
                    )
                  }
                  disabled={carSaved === 'ok'}
                >
                  <Car size={15} /> {carSaved === 'ok' ? 'Loc salvat' : 'Am parcat aici'}
                </button>
                <a href="/" onClick={nav.stop}>
                  Vezi mersul pe jos <ArrowRight size={15} />
                </a>
              </div>
              {carSaved && (
                <p role="status">
                  {carSaved === 'ok'
                    ? `Locul mașinii e salvat pe acest dispozitiv${demo ? ' (DEMO: poziție simulată)' : ''}. Pe ecranul principal: drumul înapoi și ora la care expiră plata.`
                    : 'Browserul nu permite salvarea. Locul nu a fost salvat.'}
                </p>
              )}
            </section>
          )}
          <section
            className={`trip-bar panel ${expanded ? 'expanded' : ''}`}
            aria-label="Detalii călătorie"
          >
            <button
              className="trip-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              aria-label={
                expanded ? 'Restrânge detaliile călătoriei' : 'Extinde detaliile călătoriei'
              }
            >
              {expanded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
            </button>
            <div className="trip-summary">
              <div className="trip-metric arrival">
                <strong>{arrival}</strong>
                <small>sosire{demo ? ' · demo' : ''}</small>
              </div>
              <div className="trip-metric">
                <strong>
                  {nav.arrived ? 0 : minutes(nav.metrics?.seconds ?? 0)}
                  <span> min</span>
                </strong>
                <small>rămase · estimat</small>
              </div>
              <div className="trip-metric">
                <strong>{formatDistance(nav.metrics?.remaining ?? 0)}</strong>
                <small>distanță rămasă</small>
              </div>
              <button className="exit-navigation" onClick={nav.stop} aria-label="Oprește navigația">
                <X size={19} />
                <span>Ieșire</span>
              </button>
            </div>
            {expanded && (
              <div className="trip-details">
                <div>
                  <MapPin size={18} />
                  <div>
                    <strong>{nav.destination.name}</strong>
                    <p>{nav.destination.area}</p>
                  </div>
                </div>
                <p>{nav.route?.source} · durată estimată, fără trafic live.</p>
                <p>Navigație în prim-plan · prototip. Respectă indicatoarele rutiere.</p>
              </div>
            )}
          </section>
        </>
      )}

      <aside className="map-tools" aria-label="Comenzi hartă">
        <button
          className={`icon-button map-tool ${nav.follow && active ? 'enabled' : ''}`}
          aria-label="Recentrează harta și urmărește vehiculul"
          onClick={() => {
            nav.setFollow(true);
            setRecenter((v) => v + 1);
          }}
        >
          <LocateFixed size={21} />
        </button>
        <button
          className="icon-button map-tool compass-tool"
          aria-label="Nord în sus și perspectivă 2D"
          onClick={() => {
            nav.setPerspective(false);
            nav.setFollow(true);
            setRecenter((v) => v + 1);
          }}
        >
          <Compass size={22} />
          <span>N</span>
        </button>
        <button
          className={`icon-button map-tool ${nav.perspective && active ? 'enabled' : ''}`}
          aria-label={nav.perspective ? 'Activează perspectiva 2D' : 'Activează perspectiva 3D'}
          onClick={() => {
            nav.setPerspective(!nav.perspective);
            nav.setFollow(true);
            setRecenter((v) => v + 1);
          }}
        >
          <Layers size={19} />
          <span>{nav.perspective && active ? '3D' : '2D'}</span>
        </button>
        {active && (
          <button
            className="icon-button map-tool"
            aria-label={
              nav.muted ? 'Activează indicațiile vocale' : 'Dezactivează indicațiile vocale'
            }
            aria-pressed={!nav.muted}
            onClick={() => nav.setMuted(!nav.muted)}
          >
            {nav.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        )}
      </aside>

      {!nav.follow && active && (
        <button
          className="resume-follow panel"
          onClick={() => {
            nav.setFollow(true);
            setRecenter((v) => v + 1);
          }}
        >
          <Navigation2 size={16} /> Recentrează
        </button>
      )}
      {nav.pickOrigin && (
        <div className="pick-origin-hint panel" role="status">
          <MapPin size={18} /> Atinge harta pentru punctul de plecare.
          <button
            className="icon-button"
            onClick={() => nav.setPickOrigin(false)}
            aria-label="Anulează alegerea punctului"
          >
            <X size={18} />
          </button>
        </div>
      )}
      {(nav.error || nav.notice) && (
        <div
          className={`navigation-notice panel ${nav.error ? 'has-error' : ''}`}
          role={nav.error ? 'alert' : 'status'}
        >
          {nav.mode === 'acquiring' ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <CircleHelp size={18} />
          )}
          <span>{nav.error ?? nav.notice}</span>
          {nav.error && !active && (
            <button onClick={() => void nav.retry()} disabled={nav.loading}>
              Reîncearcă
            </button>
          )}
          {nav.mode === 'acquiring' && <button onClick={nav.stop}>Anulează</button>}
        </div>
      )}
      <div className="nav-map-caption">
        <span className="status-dot" />
        {active ? 'FĂRĂ DATE DE TRAFIC LIVE' : 'OPENSTREETMAP · RUTE REALE'}
      </div>
    </main>
  );
}
