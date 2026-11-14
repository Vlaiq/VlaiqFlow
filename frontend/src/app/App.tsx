import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  ChevronDown,
  Layers,
  Leaf,
  LocateFixed,
  MapPin,
  Navigation2,
  ParkingSquare,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ActiveJourneyContext,
  type Destination,
  type DestinationsResponse,
  type ParkingsResponse,
  type Coordinate,
  type RecommendationResponse,
  zoneCircles,
  type TimparkSnapshot,
} from '@vlaiq/shared';
import { isInTimisCounty } from '../../../shared/src/county';
import { MapView } from '../features/map/MapView';
import { TariffLegend } from '../features/parking/TariffLegend';
import { ParkingRecommendations } from '../features/parking/ParkingRecommendations';
import { ParkingDetail, type Origin } from '../features/parking/ParkingDetail';
import {
  DEFAULT_PARKING_SETTINGS,
  localInputValue,
  nextWeekdayAt10,
  type ParkingSettings,
} from '../features/parking/settings';
import { DestinationSearch } from '../features/search/DestinationSearch';
import { GreenSwitch, type JourneyMapSelection } from '../features/journey/GreenSwitch';
import { InstallPrompt } from '../components/InstallPrompt';
import { ParkedCarCard } from '../features/car/ParkedCarCard';
import { useParkedCar } from '../features/car/carStore';
import { FavouriteShortcuts, SaveFavourite, SLOTS } from '../features/car/favourites';
import { StopPicker } from '../features/parking/StopPicker';
import type { TourStop } from '../features/parking/ParkingRecommendations';
import { motionApi } from '../features/motion/motionApi';
import { api } from '../services/api';
import { AppShell } from './AppShell';
import { useAppRouter } from './router';
import { useTheme } from './theme';

type Load<T> =
  { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };
function useLoad<T>(fn: () => Promise<T>, attempt = 0): Load<T> {
  const [value, setValue] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    setValue((v) => (v.state === 'error' ? { state: 'loading' } : v));
    fn().then(
      (data) => alive && setValue({ state: 'ok', data }),
      (e: unknown) =>
        alive &&
        setValue({
          state: 'error',
          message: e instanceof Error ? e.message : 'Serviciul nu este disponibil.',
        }),
    );
    return () => {
      alive = false;
    };
  }, [fn, attempt]);
  return value;
}
const NavigationScreen = lazy(() =>
  import('../features/navigation/NavigationScreen').then((m) => ({ default: m.NavigationScreen })),
);
const MotionScreen = lazy(() =>
  import('../features/motion/MotionScreen').then((m) => ({ default: m.MotionScreen })),
);
const CityScreen = lazy(() =>
  import('../features/city/CityScreen').then((m) => ({ default: m.CityScreen })),
);
const DataTrustScreen = lazy(() =>
  import('../features/trust/DataTrustScreen').then((m) => ({ default: m.DataTrustScreen })),
);
const ParkingDataScreen = lazy(() =>
  import('../features/trust/ParkingDataScreen').then((m) => ({ default: m.ParkingDataScreen })),
);
const parkingDataPaths = ['/date-parcari', '/parking-data'];
const ChanceScreen = lazy(() =>
  import('../features/trust/ChanceScreen').then((m) => ({ default: m.ChanceScreen })),
);
const chancePaths = ['/sanse-parcare', '/parking-chance'];
const PrivacyScreen = lazy(() =>
  import('../features/trust/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })),
);
const privacyPaths = ['/confidentialitate', '/privacy'];
/** DEMO scenario: real places from the local snapshot, never invented coordinates. */
const DEMO_ORIGIN = { id: 'place-osm-node-9322434969', name: 'Timișoara Nord' }; // railway station, OSM
const DEMO_DESTINATION = { id: 'street-11784', name: 'Piața Victoriei' }; // City Hall street register
const findPlace = (list: Destination[] | null, ref: { id: string; name: string }) =>
  list?.find((d) => d.id === ref.id && d.location) ??
  list?.find((d) => d.name === ref.name && d.location) ??
  null;
const motionPaths = ['/motion', '/challenges', '/community', '/wallet'];

export function App() {
  const { location, navigate } = useAppRouter();
  const path = location.pathname;
  const motionVisible = motionPaths.includes(path);
  const [motionVisited, setMotionVisited] = useState(motionVisible);
  const [balance, setBalance] = useState<number | null>(null);
  const [activityActive, setActivityActive] = useState(false);
  const [journey, setJourney] = useState<ActiveJourneyContext | null>(null);
  const [journeyIntent, setJourneyIntent] = useState(0);
  useEffect(() => {
    if (motionVisible) setMotionVisited(true);
  }, [motionVisible]);
  useEffect(() => {
    let alive = true;
    void motionApi
      .wallet()
      .then((w) => {
        if (alive) setBalance(w.balance);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const startActivity = useCallback(
    (mode: 'walk' | 'cycle', context?: ActiveJourneyContext) => {
      if (activityActive) {
        navigate('/motion');
        return;
      }
      setJourney(context ? ActiveJourneyContext.parse(context) : null);
      setJourneyIntent((current) => current + 1);
      navigate(`/motion?mode=${mode}`);
    },
    [navigate, activityActive],
  );
  const tab =
    path === '/wallet'
      ? 'wallet'
      : path === '/challenges'
        ? 'missions'
        : path === '/community'
          ? 'league'
          : 'home';
  const initialMode = new URLSearchParams(location.search).get('mode');
  const loading = (
    <div className="flow-page" role="status">
      Pregătim experiența FLOW…
    </div>
  );
  return (
    <AppShell balance={balance} activityActive={activityActive}>
      <div hidden={path !== '/'}>
        <Explore onStartActivity={startActivity} />
      </div>
      {(motionVisited || motionVisible) && (
        <div hidden={!motionVisible}>
          {journey && (
            <div className="flow-journey-context">
              <Leaf size={20} />
              <span>
                <strong>
                  {journey.mode === 'cycle' ? 'Cu bicicleta' : 'Pe jos'} spre{' '}
                  {journey.destinationName}
                </strong>
                Alegerea rutei nu acordă coins. Pornește și încheie o activitate eligibilă.
              </span>
            </div>
          )}
          <Suspense fallback={loading}>
            <MotionScreen
              embedded
              tab={tab}
              onTabChange={(value) =>
                navigate(
                  value === 'wallet'
                    ? '/wallet'
                    : value === 'missions'
                      ? '/challenges'
                      : value === 'league'
                        ? '/community'
                        : '/motion',
                )
              }
              onWalletChange={setBalance}
              onActivityChange={setActivityActive}
              initialModeRequest={journeyIntent}
              onModeChange={(mode) =>
                setJourney((current) => (current?.mode === mode ? current : null))
              }
              initialMode={
                initialMode === 'walk' || initialMode === 'cycle' || initialMode === 'run'
                  ? initialMode
                  : undefined
              }
            />
          </Suspense>
        </div>
      )}
      {path === '/navigation' && (
        <Suspense fallback={loading}>
          <NavigationScreen key={location.search} />
        </Suspense>
      )}
      {path === '/city' && (
        <Suspense fallback={loading}>
          <CityScreen />
        </Suspense>
      )}
      {(path === '/data' || path === '/sources') && (
        <Suspense fallback={loading}>
          <DataTrustScreen />
        </Suspense>
      )}
      {chancePaths.includes(path) && (
        <Suspense fallback={loading}>
          <ChanceScreen />
        </Suspense>
      )}
      {parkingDataPaths.includes(path) && (
        <Suspense fallback={loading}>
          <ParkingDataScreen />
        </Suspense>
      )}
      {privacyPaths.includes(path) && (
        <Suspense fallback={loading}>
          <PrivacyScreen />
        </Suspense>
      )}
      {path === '/help' && <Help />}
      {![
        '/',
        ...motionPaths,
        ...privacyPaths,
        ...parkingDataPaths,
        ...chancePaths,
        '/navigation',
        '/city',
        '/data',
        '/sources',
        '/help',
      ].includes(path) && (
        <section className="flow-unknown">
          <strong>404</strong>
          <h1>Drumul acesta nu duce nicăieri.</h1>
          <p>Pagina nu există. Harta, activitățile și portofelul sunt la un pas distanță.</p>
          <a href="/">
            Înapoi la explorare <ArrowRight size={17} />
          </a>
        </section>
      )}
    </AppShell>
  );
}

function Explore({
  onStartActivity,
}: {
  onStartActivity: (mode: 'walk' | 'cycle', journey?: ActiveJourneyContext) => void;
}) {
  const { theme } = useTheme();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const parkings = useLoad<ParkingsResponse>(api.parkings, loadAttempt),
    timpark = useLoad<TimparkSnapshot>(api.timpark, loadAttempt),
    destinations = useLoad<DestinationsResponse>(api.destinations, loadAttempt);
  const loadFailed =
    parkings.state === 'error' || timpark.state === 'error' || destinations.state === 'error';
  const [destination, setDestination] = useState<Destination | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [reco, setReco] = useState<RecommendationResponse | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [driveRoute, setDriveRoute] = useState<Coordinate[] | null>(null);
  const [walkRoute, setWalkRoute] = useState<Coordinate[] | null>(null);
  const [parkingSettings, setParkingSettings] = useState<ParkingSettings>(DEFAULT_PARKING_SETTINGS);
  const [journeySelection, setJourneySelection] = useState<JourneyMapSelection | null>(null);
  const [stops, setStops] = useState<TourStop[]>([]);
  const [carWalk, setCarWalk] = useState<Coordinate[] | null>(null);
  const car = useParkedCar();
  const [expanded, setExpanded] = useState(false);
  const [layers, setLayers] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [locating, setLocating] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);
  /** The DEMO arrival value while the DEMO origin is in use; null outside the scenario. */
  const [demo, setDemo] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const locateTicket = useRef(0);
  useEffect(
    () => () => {
      locateTicket.current++;
    },
    [],
  );
  const options = reco?.options ?? [];
  const zone = reco?.protectedZone ?? null;
  const avoidZones = useMemo(() => (zone?.applied ? zoneCircles(zone) : []), [zone]);
  const parkingList = parkings.state === 'ok' ? parkings.data.parkings : [];
  const timparkData = timpark.state === 'ok' ? timpark.data : null;
  const knownPlaces =
    destinations.state === 'ok'
      ? destinations.data.destinations.filter(
          (d) => !d.location || isInTimisCounty([d.location.lng, d.location.lat]),
        )
      : null;
  const onResult = useCallback((value: RecommendationResponse | null) => {
    setReco(value);
    // A new list (e.g. after choosing the origin from the preview) keeps the open parking if it is still listed.
    setDetailId((id) => (id && value?.options.some((o) => o.id === id) ? id : null));
  }, []);
  const pickOption = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  }, []);
  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setDetailId(id);
    setExpanded(true);
    setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    panelRef.current?.scrollTo({ top: 0 });
  }, []);
  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDriveRoute(null);
    setWalkRoute(null);
  }, []);
  /** From a Smart Journey car option: open the same parking's preview when the SmartMatch list has it. */
  const openParkingFromJourney = useCallback(
    (id: string) => {
      if (options.some((o) => o.id === id)) openDetail(id);
    },
    [options, openDetail],
  );
  const selectDestination = useCallback((value: Destination) => {
    setDestination(value);
    setStops([]);
    setDetailId(null);
    setDriveRoute(null);
    setJourneySelection(null);
    setExpanded(true);
    panelRef.current?.scrollTo({ top: 0 });
  }, []);
  /** A real origin replaces the DEMO one; the DEMO arrival goes back to "now" unless the user changed it. */
  const leaveDemo = useCallback(() => {
    if (!demo) return;
    setParkingSettings((s) => (s.arrive === demo ? { ...s, arrive: null } : s));
    setDemo(null);
  }, [demo]);
  const pickOrigin = useCallback(
    (coordinate: Coordinate) => {
      if (!isInTimisCounty(coordinate)) return;
      locateTicket.current++;
      setLocating(false);
      setOrigin({ name: 'Punct ales pe hartă', coordinate });
      leaveDemo();
      setPickingOrigin(false);
      setOriginError(null);
      setExpanded(true);
    },
    [leaveDemo],
  );
  const demoOrigin = findPlace(knownPlaces, DEMO_ORIGIN);
  const demoDestination = findPlace(knownPlaces, DEMO_DESTINATION);
  const startDemo = () => {
    if (!demoOrigin?.location || !demoDestination) return;
    locateTicket.current++;
    setLocating(false);
    setPickingOrigin(false);
    setOriginError(null);
    setOrigin({
      name: `DEMO · plecare fixă: gara ${demoOrigin.name}`,
      coordinate: [demoOrigin.location.lng, demoOrigin.location.lat],
    });
    const arrive = nextWeekdayAt10(new Date());
    setParkingSettings((s) => ({ ...s, arrive }));
    setDemo(arrive);
    selectDestination(demoDestination);
  };
  const requestGps = useCallback(() => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setOriginError('Localizarea necesită HTTPS. Poți alege plecarea pe hartă.');
      return;
    }
    setLocating(true);
    setOriginError(null);
    const current = ++locateTicket.current;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (current !== locateTicket.current) return;
        setLocating(false);
        const coordinate: Coordinate = [p.coords.longitude, p.coords.latitude];
        if (p.coords.accuracy > 300) {
          setOriginError('Poziția este prea imprecisă. Alege un punct pe hartă.');
          return;
        }
        if (!isInTimisCounty(coordinate)) {
          setOriginError(
            'Poziția este în afara județului Timiș. Alege o plecare din zona acoperită.',
          );
          return;
        }
        setOrigin({ name: `Locația mea · ±${Math.round(p.coords.accuracy)} m`, coordinate });
        leaveDemo();
      },
      (e) => {
        if (current !== locateTicket.current) return;
        setLocating(false);
        setOriginError(
          e.code === 1
            ? 'Locația a fost refuzată. Alege punctul de plecare pe hartă.'
            : 'Nu am putut obține poziția. Poți alege plecarea manual.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }, [leaveDemo]);
  const manualOrigin = useCallback(() => {
    locateTicket.current++;
    setLocating(false);
    setPickingOrigin(true);
    setExpanded(false);
    setOriginError(null);
  }, []);
  const detailIndex = detailId ? options.findIndex((o) => o.id === detailId) : -1;
  const detail = detailIndex >= 0 ? options[detailIndex]! : null;
  return (
    <section className="explore-screen" aria-label="Explorează Timișul">
      <MapView
        parkings={parkingList}
        timpark={timparkData}
        destination={destination}
        recommendations={options}
        route={detail ? driveRoute : null}
        walkRoute={detail ? walkRoute : carWalk}
        car={car?.coordinate ?? null}
        journey={detail ? null : journeySelection}
        selectedRecommendationId={selectedId}
        focusRecommendation={focus}
        onSelectRecommendation={openDetail}
        theme={theme}
        origin={origin?.coordinate ?? null}
        pickingOrigin={pickingOrigin}
        onPickOrigin={pickOrigin}
        protectedZone={zone}
      />
      <div className="explore-sidebar">
        <header className="explore-search">
          <div className="explore-search-title">
            <span>
              <MapPin size={13} /> PLANIFICĂ UN DRUM MAI BUN
            </span>
            <span>TIMIȘ</span>
          </div>
          <DestinationSearch
            destinations={knownPlaces}
            unavailable={destinations.state === 'error'}
            onSelect={selectDestination}
          />
        </header>
        <section
          className={`explore-panel ${expanded ? 'expanded' : ''}`}
          ref={panelRef}
          aria-label="Planificator de călătorie"
        >
          <button
            className="explore-sheet-handle"
            aria-label={expanded ? 'Restrânge planificatorul' : 'Extinde planificatorul'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <span />
          </button>
          <div className="explore-panel-inner">
            {car && !detail && (
              <ParkedCarCard
                key={car.parkedAt}
                car={car}
                tariffs={timparkData?.data.tariffs ?? null}
                onWalkRoute={setCarWalk}
              />
            )}
            {!destination && (
              <div className="explore-welcome">
                <span className="explore-welcome-eyebrow">
                  <Leaf size={13} /> PARK SMARTER. MOVE GREENER.
                </span>
                <h1>
                  Mai puțin căutat.
                  <br />
                  <span>Mai mult oraș.</span>
                </h1>
                <p>
                  Găsește parcarea potrivită și descoperă când merită să continui pe jos sau cu
                  bicicleta.
                </p>
                <FavouriteShortcuts places={knownPlaces} verb="Mergi la" onPick={selectDestination} />
                <div className="explore-steps">
                  <div>
                    <span className="explore-step-icon">
                      <MapPin size={18} />
                    </span>
                    <span>
                      <strong>Alege unde vrei să ajungi</strong>
                      <p>Străzi și locuri din surse verificate.</p>
                    </span>
                  </div>
                  <div>
                    <span className="explore-step-icon">
                      <ParkingSquare size={18} />
                    </span>
                    <span>
                      <strong>Compară drumul complet</strong>
                      <p>Parcare, cost și mers pe jos, într-un singur loc.</p>
                    </span>
                  </div>
                  <div>
                    <span className="explore-step-icon">
                      <Leaf size={18} />
                    </span>
                    <span>
                      <strong>Alege o variantă mai verde</strong>
                      <p>Rute reale când sunt disponibile, cu limite explicite.</p>
                    </span>
                  </div>
                </div>
                <button
                  className="explore-primary"
                  onClick={() => {
                    document.querySelector<HTMLInputElement>('.explore-search input')?.focus();
                  }}
                >
                  <MapPin size={16} /> Unde vrei să ajungi? <ArrowRight size={17} />
                </button>
                {demoOrigin && demoDestination && (
                  <button className="explore-demo" onClick={startDemo}>
                    <Play size={15} aria-hidden="true" />
                    <span>
                      <strong>Încearcă DEMO</strong>
                      Gara de Nord → {demoDestination.name}, fără GPS
                    </span>
                  </button>
                )}
                <div className="explore-coverage">
                  <ShieldCheck size={14} />
                  <span>
                    Județul Timiș, pe hartă. Date Timpark disponibile în zona municipiului
                    Timișoara. Ocuparea în timp real nu este disponibilă.
                  </span>
                </div>
                <a className="explore-secondary-link" href="/motion">
                  <span>Mișcarea ta poate aduce FLOW Coins</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            )}
            {destination && (
              <>
                {!detail && (
                  <>
                    <div className="explore-destination-heading">
                      <span>DRUMUL TĂU PRIN ORAȘ</span>
                      <h1>{destination.name}</h1>
                      <p>
                        {destination.location
                          ? `${destination.precision === 'exact' ? 'Poziție exactă în sursă.' : destination.precision === 'street' ? 'Poziție la nivel de stradă, nu de număr poștal.' : 'Poziție aproximativă la nivel de cartier.'} Sursa: ${destination.locationSource ?? 'date locale'}.`
                          : 'Poziția exactă nu este cunoscută. Nu calculăm rute pentru o locație inventată.'}
                      </p>
                      {demo && (
                        <p className="explore-demo-note" role="note">
                          <strong>DEMO</strong>
                          <span>
                            Plecare fixă din gara Timișoara Nord și sosire într-o zi lucrătoare la
                            10:00, ca să vezi tarifele din programul plătit. Parcările, tarifele și
                            rutele sunt reale; șansele de loc rămân estimate. Alege „Locația mea”
                            sau un punct pe hartă ca să ieși din DEMO.
                          </span>
                        </p>
                      )}
                      <SaveFavourite place={destination} />
                      <button
                        onClick={() => {
                          setStops([]);
                          setDestination(null);
                          setReco(null);
                          setDriveRoute(null);
                          setWalkRoute(null);
                          setJourneySelection(null);
                          setDetailId(null);
                        }}
                      >
                        <ArrowLeft size={13} /> Schimbă destinația
                      </button>
                    </div>
                  </>
                )}
                {detail && reco && (
                  <ParkingDetail
                    key={detail.id}
                    option={detail}
                    rank={detailIndex + 1}
                    destinationName={destination.name}
                    destination={
                      destination.location
                        ? [destination.location.lng, destination.location.lat]
                        : null
                    }
                    stayMinutes={reco.stayMinutes}
                    params={reco.params}
                    smsNumber={timparkData?.data.tariffs.smsNumber ?? null}
                    selectedOrigin={origin}
                    onOriginRequest={requestGps}
                    originError={originError}
                    locatingOrigin={locating}
                    onManualOrigin={manualOrigin}
                    onBack={closeDetail}
                    onRoute={setDriveRoute}
                    onWalkRoute={setWalkRoute}
                    backup={
                      options.find((o) => o.id !== detail.id && o.access !== 'customers') ?? null
                    }
                    avoidZones={avoidZones}
                    arriveTarget={parkingSettings.arrive ? reco.arriveAt : null}
                    arriveUsed={reco.arriveAt}
                    schedule={timparkData?.data.tariffs.schedule ?? null}
                    onArrive={(at) => setParkingSettings((s) => ({ ...s, arrive: localInputValue(at) }))}
                  />
                )}
                {destination.location && (
                  <div hidden={!!detail}>
                    <ParkingRecommendations
                      key={destination.id}
                      destination={destination}
                      origin={origin?.coordinate ?? null}
                      settings={parkingSettings}
                      onSettings={setParkingSettings}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onPick={pickOption}
                      onOpen={openDetail}
                      onResult={onResult}
                      stops={stops}
                      stopsSlot={
                        <StopPicker
                          destination={[destination.location.lng, destination.location.lat]}
                          places={knownPlaces}
                          stops={stops}
                          onChange={setStops}
                        />
                      }
                    />
                    <div className="explore-origin">
                      <div className="explore-origin-label">
                        <LocateFixed size={13} /> PUNCTUL DE PLECARE
                      </div>
                      <strong>{origin?.name ?? 'Alege de unde pornești'}</strong>
                      <FavouriteShortcuts
                        places={knownPlaces}
                        verb="Plec de la"
                        hideEmpty
                        onPick={(d, slot) => {
                          if (!d.location || d.id === destination.id) return;
                          locateTicket.current++;
                          setLocating(false);
                          setOriginError(null);
                          setOrigin({
                            name: `${SLOTS.find((x) => x.id === slot)!.label}: ${d.name}`,
                            coordinate: [d.location.lng, d.location.lat],
                          });
                          leaveDemo();
                        }}
                      />
                      <div className="explore-origin-actions">
                        <button onClick={requestGps} disabled={locating}>
                          <LocateFixed size={14} />
                          {locating ? 'Căutăm poziția…' : 'Locația mea'}
                        </button>
                        <button onClick={manualOrigin}>
                          <MapPin size={14} /> Alege pe hartă
                        </button>
                      </div>
                      {originError && (
                        <p className="explore-origin-error" role="alert">
                          {originError}
                        </p>
                      )}
                    </div>
                    <GreenSwitch
                      origin={origin?.coordinate ?? null}
                      destination={destination}
                      parkingSettings={parkingSettings}
                      onJourney={setJourneySelection}
                      onInspectRoute={() => setExpanded(false)}
                      onOpenParking={openParkingFromJourney}
                      onStartActivity={onStartActivity}
                    />
                  </div>
                )}
                <a href="/data" className="explore-data-link">
                  <ShieldCheck size={13} /> De unde provin datele?
                </a>
              </>
            )}
            {loadFailed && (
              <div role="alert" className="explore-alert">
                <p>
                  {destinations.state === 'error'
                    ? 'Căutarea nu poate încărca datele acum.'
                    : 'Parcările sau tarifele nu au putut fi încărcate acum.'}{' '}
                  Harta și celelalte secțiuni rămân disponibile.
                </p>
                <button onClick={() => setLoadAttempt((n) => n + 1)}>Încearcă din nou</button>
              </div>
            )}
          </div>
        </section>
      </div>
      <button
        className="explore-layer-toggle"
        onClick={() => setLayers(!layers)}
        aria-expanded={layers}
        aria-label="Afișează straturile și tarifele hărții"
      >
        <Layers size={17} />
        <span>Straturi și tarife</span>
        <ChevronDown size={13} />
      </button>
      {layers && (
        <aside className="explore-legend" aria-label="Straturi și tarife">
          {timparkData ? (
            <TariffLegend snapshot={timparkData} />
          ) : (
            <p>Tarifele nu sunt disponibile acum.</p>
          )}
          <a href="/data" className="explore-data-link">
            Surse și actualizări <ArrowRight size={13} />
          </a>
        </aside>
      )}
      {pickingOrigin && (
        <div className="explore-origin-pick-hint" role="status">
          <MapPin size={17} />
          <span>Atinge harta în județul Timiș pentru a alege plecarea.</span>
          <button aria-label="Anulează alegerea plecării" onClick={() => setPickingOrigin(false)}>
            <X size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
function Help() {
  return (
    <div className="flow-page">
      <div className="flow-page-intro">
        <span className="flow-eyebrow">UN SINGUR DRUM. MAI MULTE ALEGERI.</span>
        <h1>Mai simplu, cu FLOW.</h1>
        <p>
          Parcare, călătorii și mișcare, într-o aplicație care spune clar ce știe și ce nu știe.
        </p>
      </div>
      <div className="flow-help-grid">
        <section className="flow-help-card">
          <h2>Încearcă drumul complet</h2>
          <ol>
            <li>
              <strong>Caută o destinație</strong> din registrul local și alege plecarea prin GPS sau
              pe hartă.
            </li>
            <li>
              <strong>Compară variantele</strong> de parcare și călătorie. Rutele pietonale și de
              bicicletă apar doar când furnizorul le poate calcula.
            </li>
            <li>
              <strong>Pornește o activitate</strong> în Motion. Alegerea unei rute nu acordă
              recompense; activitatea este evaluată pe server.
            </li>
            <li>
              <strong>Vezi progresul</strong> în portofel și în provocările tale. Pentru
              demonstrație există un mod separat, etichetat DEMO.
            </li>
          </ol>
        </section>
        <section className="flow-help-card">
          <h2>Instalează sau continuă în browser</h2>
          <InstallPrompt showHelp />
          <p>
            GPS-ul necesită HTTPS. Activitățile se înregistrează în prim-plan; trecerea aplicației
            în fundal le pune în pauză.
          </p>
          <p>
            Portofelul de prototip este legat de browser și nu este un cont sincronizat. Traseele
            GPS nu sunt publicate.
          </p>
          <p>
            <a href="/confidentialitate">Ce date folosim și cum le poți șterge</a>
          </p>
          <a href="/data">Vezi sursele, acoperirea și limitele datelor</a>
        </section>
        <section className="flow-help-card">
          <h2>Completează serviciile orașului</h2>
          <p>
            Plata parcării rămâne în{' '}
            <a href="https://www.timpark.ro/" target="_blank" rel="noreferrer">
              Timpark
            </a>{' '}
            sau CityApp. Problemele din spațiul public ajung la{' '}
            <a href="https://sesizari.primariatm.ro/" target="_blank" rel="noreferrer">
              Sesizări
            </a>
            .
          </p>
          <p>
            Nu promitem locuri libere, trafic live sau reduceri de emisii fără o sursă. Pentru
            administratori: <a href="/city">FLOW City</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
