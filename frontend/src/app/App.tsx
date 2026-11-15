import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
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
  type CompleteJourney,
  type Destination,
  type DestinationsResponse,
  type ParkingsResponse,
  type Coordinate,
  type RecommendationResponse,
  zoneCircles,
  type TimparkSnapshot,
} from '@vlaiq/shared';
import { isInTimisCounty } from '../../../shared/src/county';
import { accuracyLabel, locate, locateMessage } from '../services/locate';
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
import { ArrivalWalkCard } from '../features/journey/ArrivalWalkCard';
import { arrivalWalkFromUrl } from '../features/navigation/scenario';
import { useParkedCar } from '../features/car/carStore';
import { FavouriteShortcuts, SaveFavourite, SLOTS } from '../features/car/favourites';
import { StopPicker } from '../features/parking/StopPicker';
import type { TourStop } from '../features/parking/ParkingRecommendations';
import { useIdentity } from '../features/identity/IdentityProvider';
import { AuthGateway } from '../features/identity/AuthGateway';
import { isProtectedRoute } from '../features/identity/redirects';
import { motionApi } from '../features/motion/motionApi';
import { api } from '../services/api';
import { AppShell } from './AppShell';
import { useAppRouter } from './router';
import { useTheme } from './theme';
import {
  FlowVoiceProvider,
  VoiceFloating,
  VoiceMicButton,
  VoicePanel,
  useVoiceHeard,
  useVoiceRegistration,
  useVoiceTell,
} from '../features/voice/FlowVoice';
import { readIntent } from '../features/voice/intents';
import { useFlowPlanner } from '../features/voice/useFlowPlanner';
import { AutoNavigate } from '../features/voice/AutoNavigate';
import { carNavigationHref, plannedActivity } from '../features/journey/journeyPresentation';

type Load<T> =
  | { state: 'loading' }
  | { state: 'ok'; data: T }
  | { state: 'error'; message: string };
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
const BuddyRoute = lazy(() => import('../features/buddy/BuddyRoute').then(m => ({ default: m.BuddyRoute })));
const BuddyDiscovery = lazy(() => import('../features/buddy/BuddyDiscovery').then(m => ({ default: m.BuddyDiscovery })));
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
const Passport = lazy(() => import('../features/identity/Passport').then(m => ({ default: m.Passport })));
const TeamPage = lazy(() => import('../features/identity/TeamPage').then(m => ({ default: m.TeamPage })));
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
  return (
    <FlowVoiceProvider>
      <AppContent />
    </FlowVoiceProvider>
  );
}

function AppContent() {
  const identity = useIdentity();
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
    if (!identity.authenticated) { setBalance(null); return; }
    void motionApi
      .wallet()
      .then((w) => {
        if (alive) setBalance(w.balance);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [identity.authenticated, identity.accountKey]);
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
  if (isProtectedRoute(path) && (!identity.authenticated || identity.loading)) return (
    <AppShell balance={null} activityActive={false}><AuthGateway /></AppShell>
  );
  return (
    <AppShell balance={balance} activityActive={activityActive}>
      {path !== '/' && path !== '/navigation' && <VoiceFloating />}
      <div hidden={path !== '/'}>
        <Explore onStartActivity={startActivity} />
      </div>
      {path === '/challenges' && <Suspense fallback={loading}><BuddyDiscovery onOpen={() => navigate('/buddy')} /></Suspense>}
      {path === '/buddy' && <Suspense fallback={loading}><BuddyRoute onWalletChange={setBalance} /></Suspense>}
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
      {['/profile', '/profile/edit', '/settings', '/activities'].includes(path) && (
        <Suspense fallback={loading}>
          <Passport key={path} editing={path === '/profile/edit' || path === '/settings'} activitiesOnly={path === '/activities'} />
        </Suspense>
      )}
      {path === '/team' && <Suspense fallback={loading}><TeamPage /></Suspense>}
      {path === '/auth/callback' && <div className="flow-page" role="status">{identity.error ?? 'Încheiem autentificarea…'}</div>}
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
        '/help', '/team', '/auth/callback', '/profile', '/profile/edit', '/settings', '/activities', '/buddy',
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
  const identity = useIdentity();
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
  useEffect(() => {
    if (identity.profile) setParkingSettings(s => ({ ...s, ...identity.profile!.preferences }));
  }, [identity.profile?.preferences.mode, identity.profile?.preferences.maxWalkMinutes, identity.profile?.preferences.schoolZone]);
  const [journeySelection, setJourneySelection] = useState<JourneyMapSelection | null>(null);
  const [stops, setStops] = useState<TourStop[]>([]);
  const [carWalk, setCarWalk] = useState<Coordinate[] | null>(null);
  // The walking leg after arriving at the parking (from the navigation screen's link).
  const { location, navigate } = useAppRouter();
  const arrivalWalk = useMemo(
    () => (location.pathname === '/' ? arrivalWalkFromUrl(location.search) : null),
    [location.pathname, location.search],
  );
  const [arrivalRoute, setArrivalRoute] = useState<Coordinate[] | null>(null);
  const [autoNav, setAutoNav] = useState<{ href: string; parking: string } | null>(null);
  const car = useParkedCar();
  const [expanded, setExpanded] = useState(false);
  const [plannerView, setPlannerView] = useState<'parking' | 'journey'>('parking');
  const [pendingParkingId, setPendingParkingId] = useState<string | null>(null);
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
  /** Open the requested parking after SmartMatch remounts and delivers fresh results. */
  const openParkingFromJourney = useCallback((id: string) => {
    setPendingParkingId(id);
    setJourneySelection(null);
    setPlannerView('parking');
  }, []);
  useEffect(() => {
    if (!pendingParkingId || !reco) return;
    if (reco.options.some((option) => option.id === pendingParkingId)) {
      openDetail(pendingParkingId);
    }
    setPendingParkingId(null);
  }, [pendingParkingId, reco, openDetail]);
  const selectDestination = useCallback((value: Destination) => {
    // A new destination replaces the walking leg from the last navigation.
    if (new URLSearchParams(window.location.search).has('walkFrom')) navigate('/', true);
    setDestination(value);
    setStops([]);
    setDetailId(null);
    setDriveRoute(null);
    setJourneySelection(null);
    setPlannerView('parking');
    setPendingParkingId(null);
    setExpanded(true);
    panelRef.current?.scrollTo({ top: 0 });
  }, [navigate]);
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
    planner.changed();
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
    planner.changed();
    setLocating(true);
    setOriginError(null);
    const current = ++locateTicket.current;
    void locate().then((result) => {
      if (current !== locateTicket.current) return;
      setLocating(false);
      if (!result.ok) {
        setOriginError(locateMessage(result, 'Poți alege plecarea pe hartă.'));
        return;
      }
      if (!isInTimisCounty(result.coordinate)) {
        setOriginError(
          result.accuracy > 1000
            ? `Poziția aproximativă (${accuracyLabel(result.accuracy)}) iese în afara județului Timiș, probabil după adresa de internet. Alege plecarea pe hartă.`
            : 'Poziția este în afara județului Timiș. Alege o plecare din zona acoperită.',
        );
        return;
      }
      planner.changed();
      setOrigin({
        name: `Locația mea · ${result.accuracy > 100 ? 'aproximativ ' : ''}${accuracyLabel(result.accuracy)}`,
        coordinate: result.coordinate,
      });
      leaveDemo();
    });
  }, [leaveDemo]);
  const manualOrigin = useCallback(() => {
    planner.changed();
    locateTicket.current++;
    setLocating(false);
    setPickingOrigin(true);
    setExpanded(false);
    setOriginError(null);
  }, []);
  useEffect(() => {
    if (!arrivalWalk) return;
    closeDetail();
    setExpanded(true);
    panelRef.current?.scrollTo({ top: 0 });
  }, [arrivalWalk, closeDetail]);
  const planner = useFlowPlanner({
    origin,
    destination,
    places: knownPlaces,
    settings: parkingSettings,
    demo: !!demo,
    setOrigin,
    setDestination: selectDestination,
    setSettings: setParkingSettings,
    showJourney: (selection) => {
      setDetailId(null);
      // A journey chosen by voice must be visible: open the routes view.
      setPlannerView('journey');
      setJourneySelection(selection);
      setExpanded(true);
      // A car route chosen by voice starts navigation hands-free after a short countdown.
      const journey = selection?.value;
      const href =
        journey?.parking &&
        carNavigationHref(journey, journeysRef.current, destinationRef.current?.name);
      // The driver already said "hai să mergem", or is driving and asked for another route: go now.
      const driving = window.location.pathname === '/navigation';
      if (href && journey?.parking && (driving || Date.now() - pendingGo.current < 60_000)) {
        pendingGo.current = 0;
        navigate(`${href}&start=${demoRef.current ? 'demo' : 'live'}`);
        return;
      }
      setAutoNav(
        href && journey?.parking
          ? { href: `${href}&start=${demoRef.current ? 'demo' : 'live'}`, parking: journey.parking.name }
          : null,
      );
    },
  });
  const journeysRef = useRef<CompleteJourney[]>([]);
  journeysRef.current = planner.result.state === 'ok' ? planner.result.value.journeys : [];
  const destinationRef = useRef(destination);
  destinationRef.current = destination;
  const demoRef = useRef(demo);
  demoRef.current = demo;
  // A new destination (spoken or typed) cancels a pending hands-free start.
  useEffect(() => setAutoNav(null), [destination?.id]);
  const autoNavRef = useRef(autoNav);
  autoNavRef.current = autoNav;
  const goNavigate = useCallback(() => {
    const pending = autoNavRef.current;
    setAutoNav(null);
    if (pending) navigate(pending.href);
  }, [navigate]);
  useVoiceRegistration(planner.tools, planner.begin, planner.summary);
  /** When the driver said "hai să mergem" before a route existed (cleared after a minute). */
  const pendingGo = useRef(0);
  const tell = useVoiceTell();
  const startJourney = useCallback(
    (journey: CompleteJourney) => {
      const place = destinationRef.current;
      if (journey.parking) {
        const href = carNavigationHref(journey, journeysRef.current, place?.name);
        if (!href) return false;
        setAutoNav(null);
        navigate(`${href}&start=${demoRef.current ? 'demo' : 'live'}`);
        return true;
      }
      const context = place ? plannedActivity(journey, place) : null;
      if (!context) return false;
      onStartActivity(context.mode, context);
      return true;
    },
    [navigate, onStartActivity],
  );
  const selectedJourney = () => {
    const journeys = journeysRef.current;
    return journeys.find((j) => j.id === planner.selectedId) ?? journeys[0] ?? null;
  };
  // Navigation tells FLOW Voice when it starts, arrives or stops, so the agent follows the trip.
  useEffect(() => {
    const onNavigation = (e: Event) => {
      const { state, name } = (e as CustomEvent<{ state: string; name: string }>).detail;
      tell(
        state === 'started'
          ? `Navigația a pornit spre ${name}.`
          : state === 'arrived'
            ? `Șoferul a ajuns la ${name}.`
            : 'Navigația s-a oprit.',
      );
    };
    window.addEventListener('flow-navigation', onNavigation);
    return () => window.removeEventListener('flow-navigation', onNavigation);
  }, [tell]);
  // The driver's own words: a travel mode they want, and permission to start ("hai să mergem").
  useVoiceHeard((text) => {
    const intent = readIntent(text);
    if (intent.mode) {
      planner.setSpokenMode(intent.mode);
      const label =
        intent.mode === 'driving' ? 'cu mașina' : intent.mode === 'cycling' ? 'cu bicicleta' : 'pe jos';
      tell(`Șoferul vrea doar ${label}. Compară și propune numai această variantă.`);
    }
    if (!intent.go) return;
    if (window.location.pathname === '/navigation') {
      window.dispatchEvent(new CustomEvent('flow-voice-go', { detail: { demo: !!demoRef.current } }));
      return;
    }
    if (autoNavRef.current) return goNavigate();
    const journey = selectedJourney();
    if (journey && startJourney(journey)) return;
    // No route yet: calculate it (from GPS if needed), show it, and start as soon as it is ready.
    pendingGo.current = Date.now();
    setPlannerView('journey');
    setExpanded(true);
    if (destinationRef.current)
      void planner.ensureOrigin().catch(() =>
        tell('Nu pot afla unde este șoferul. Cere-i punctul de plecare.'),
      );
  });
  useEffect(() => {
    if (!pendingGo.current || Date.now() - pendingGo.current > 60_000) return;
    if (planner.result.state !== 'ok' || !planner.result.value.journeys.length) return;
    const journey = selectedJourney();
    if (journey && startJourney(journey)) pendingGo.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planner.result, planner.selectedId, startJourney]);
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
        walkRoute={detail ? walkRoute : (arrivalRoute ?? carWalk)}
        car={car?.coordinate ?? null}
        journey={detail || arrivalRoute ? null : journeySelection}
        onJourneyRendered={planner.acknowledge}
        selectedRecommendationId={selectedId}
        focusRecommendation={focus}
        onSelectRecommendation={(id) => {
          planner.changed();
          openDetail(id);
        }}
        theme={theme}
        origin={origin?.coordinate ?? null}
        pickingOrigin={pickingOrigin}
        onPickOrigin={(next) => {
          planner.changed();
          pickOrigin(next);
        }}
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
          <div className="explore-search-row">
            <DestinationSearch
              destinations={knownPlaces}
              unavailable={destinations.state === 'error'}
              onSelect={(next) => {
                planner.changed();
                selectDestination(next);
              }}
            />
            {/* Optional (menu → FLOW Voice): one mic next to the search, nothing in the planner. */}
            <VoiceMicButton className="is-inline" />
          </div>
          <VoicePanel
            environment={demo ? 'demo' : 'live'}
            choices={planner.choices.map((d) => ({
              id: d.id,
              label: `${d.name}${d.detail ? ` · ${d.detail}` : ''}`,
              place: d,
            }))}
            onChoose={planner.choose}
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
            {arrivalWalk && !detail && (
              <ArrivalWalkCard
                walk={arrivalWalk}
                onRoute={setArrivalRoute}
                onClose={() => navigate('/', true)}
              />
            )}
            {car && !detail && (
              <ParkedCarCard
                key={car.parkedAt}
                car={car}
                tariffs={timparkData?.data.tariffs ?? null}
                onWalkRoute={setCarWalk}
              />
            )}
            {destination && autoNav && (
              <AutoNavigate
                key={autoNav.href}
                parking={autoNav.parking}
                onGo={goNavigate}
                onCancel={() => setAutoNav(null)}
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
                      {/* Precision stays one short line; the source opens on tap. */}
                      {destination.location ? (
                        <details className="explore-place-source">
                          <summary>
                            {destination.precision === 'exact'
                              ? 'Poziție exactă'
                              : destination.precision === 'street'
                                ? 'Poziție la nivel de stradă'
                                : 'Poziție aproximativă (cartier)'}
                          </summary>
                          <p>
                            {destination.precision === 'street'
                              ? 'Nu la nivel de număr poștal. '
                              : ''}
                            Sursa: {destination.locationSource ?? 'date locale'}.
                          </p>
                        </details>
                      ) : (
                        <p>
                          Poziția exactă nu este cunoscută. Nu calculăm rute pentru o locație
                          inventată.
                        </p>
                      )}
                      {demo && (
                        <details className="explore-demo-note">
                          <summary>
                            <strong>DEMO</strong>
                            <span>Din Gara de Nord, zi lucrătoare la 10:00</span>
                          </summary>
                          <p>
                            Parcările, tarifele și rutele sunt reale; șansele de loc rămân
                            estimate. Alege „Locația mea” sau un punct pe hartă ca să ieși din
                            DEMO.
                          </p>
                        </details>
                      )}
                      <SaveFavourite place={destination} />
                      <button
                        onClick={() => {
                          setStops([]);
                          planner.changed();
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
                    <div className="flow-planner-switch" role="group" aria-label="Compară parcări sau trasee">
                      <button type="button" aria-pressed={plannerView === 'parking'} className={plannerView === 'parking' ? 'active' : ''} onClick={() => { setPlannerView('parking'); setJourneySelection(null); }}>
                        <ParkingSquare size={17} aria-hidden="true" /> Parcări
                      </button>
                      <button type="button" aria-pressed={plannerView === 'journey'} className={plannerView === 'journey' ? 'active' : ''} onClick={() => { setPlannerView('journey'); setSelectedId(null); }}>
                        <Navigation2 size={17} aria-hidden="true" /> Trasee
                      </button>
                    </div>
                    {plannerView === 'parking' && <ParkingRecommendations
                      key={destination.id}
                      destination={destination}
                      origin={origin?.coordinate ?? null}
                      settings={parkingSettings}
                      onSettings={(next) => {
                        planner.changed();
                        setParkingSettings(next);
                      }}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onPick={(id) => {
                        planner.changed();
                        pickOption(id);
                      }}
                      onOpen={(id) => {
                        planner.changed();
                        openDetail(id);
                      }}
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
                    />}
                    {plannerView === 'journey' && <GreenSwitch
                      result={planner.result}
                      preference={planner.preference}
                      onPreference={planner.onPreference}
                      selectedId={planner.selectedId}
                      onSelect={planner.onSelect}
                      onRetry={planner.retry}
                      comparisonId={planner.comparisonId}
                      origin={origin?.coordinate ?? null}
                      destination={destination}
                      parkingSettings={parkingSettings}
                      onJourney={setJourneySelection}
                      onInspectRoute={() => setExpanded(false)}
                      onOpenParking={openParkingFromJourney}
                      onStartActivity={onStartActivity}
                    />}
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
            Portofelul FLOW este legat de contul verificat și sincronizat prin baza de date. Traseele
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
