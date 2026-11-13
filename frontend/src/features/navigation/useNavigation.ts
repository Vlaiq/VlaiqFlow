import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coordinate, NavigationRoute } from '@vlaiq/shared';
import { api } from '../../services/api';
import {
  bearing,
  cumulative,
  distance,
  instruction,
  project,
  sample,
  tripMetrics,
} from './geometry';

import type { NavPlace, NavPlaces } from './places';

// Destinations and the demo origin come from the data snapshots (places.ts), never typed in by hand.
export type Mode = 'preview' | 'acquiring' | 'live' | 'demo';
export interface Fix {
  coordinate: Coordinate;
  heading: number | null;
  speed: number | null;
  speedSource: 'gps' | 'estimated' | 'simulated' | null;
  accuracy: number;
  timestamp: number;
}

export function useNavigation(places: NavPlaces) {
  const DEMO_ORIGIN = places.origin.coordinate;
  const [mode, setMode] = useState<Mode>('preview');
  const [destination, setDestination] = useState<NavPlace>(places.destinations[0]!);
  const [routes, setRoutes] = useState<NavigationRoute[]>([]);
  const [selected, setSelected] = useState(0);
  const route = routes[selected];
  const [origin, setOrigin] = useState<Coordinate>(DEMO_ORIGIN);
  const [manualOrigin, setManualOrigin] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [muted, setMuted] = useState(true);
  const [follow, setFollow] = useState(true);
  const [perspective, setPerspective] = useState(true);
  const [pickOrigin, setPickOrigin] = useState(false);
  const lengths = useMemo(() => (route ? cumulative(route.geometry) : []), [route]);
  const metrics = route ? tripMetrics(route, lengths, progress) : null;
  const request = useRef<AbortController>();
  const session = useRef(0);
  const watcher = useRef<number>();
  const lastFix = useRef<Fix | null>(null);
  const progressRef = useRef(0);
  const lastReroute = useRef(0);
  const deviationCount = useRef(0);
  const rerouting = useRef(false);
  const spoken = useRef('');

  const stopWatcher = useCallback(() => {
    if (watcher.current != null) navigator.geolocation?.clearWatch(watcher.current);
    watcher.current = undefined;
  }, []);
  const loadRoutes = useCallback(async (from: Coordinate, to: Coordinate) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await api.routes(
        from,
        to,
        AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      );
      if (controller.signal.aborted) return false;
      setRoutes(result);
      setSelected(0);
      setProgress(0);
      progressRef.current = 0;
      return true;
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Rutarea nu este disponibilă.');
      return false;
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRoutes([]);
    setFix(null);
    setArrived(false);
    void loadRoutes(origin, destination.coordinate);
    return () => request.current?.abort();
  }, [destination, origin, loadRoutes]);

  const stop = useCallback(() => {
    session.current++;
    stopWatcher();
    request.current?.abort();
    setLoading(false);
    setMode('preview');
    setFix(null);
    setProgress(0);
    progressRef.current = 0;
    setArrived(false);
    setPaused(false);
    setNotice(null);
    setFollow(true);
    lastFix.current = null;
    deviationCount.current = 0;
    rerouting.current = false;
    spoken.current = '';
    window.speechSynthesis?.cancel();
  }, [stopWatcher]);
  useEffect(
    () => () => {
      session.current++;
      stopWatcher();
      request.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [stopWatcher],
  );

  const startLive = useCallback(() => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setError('GPS necesită HTTPS și un browser cu localizare. Poți folosi modul DEMO.');
      return;
    }
    session.current++;
    const ticket = session.current;
    stopWatcher();
    request.current?.abort();
    setLoading(false);
    setMode('acquiring');
    setError(null);
    setNotice('Căutăm o poziție GPS precisă…');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (ticket !== session.current) return;
        if (position.coords.accuracy > 65) {
          setMode('preview');
          setNotice(null);
          setError(
            'Poziția GPS este prea imprecisă. Încearcă dintr-un spațiu deschis sau folosește DEMO.',
          );
          return;
        }
        const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude];
        setNotice('Calculăm ruta din poziția ta…');
        if (!(await loadRoutes(coordinate, destination.coordinate)) || ticket !== session.current) {
          if (ticket === session.current) {
            setMode('preview');
            setNotice(null);
          }
          return;
        }
        setFix({
          coordinate,
          heading: null,
          speed: null,
          speedSource: null,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        lastFix.current = null;
        progressRef.current = 0;
        deviationCount.current = 0;
        setMode('live');
        setNotice(null);
        setFollow(true);
        setPerspective(true);
        setArrived(false);
      },
      (e) => {
        if (ticket !== session.current) return;
        setMode('preview');
        setNotice(null);
        setError(
          e.code === 1
            ? 'Accesul la locație a fost refuzat. Alege un punct de plecare pe hartă sau încearcă DEMO.'
            : 'Nu am putut obține poziția GPS. Încearcă din nou sau folosește DEMO.',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }, [destination, loadRoutes, stopWatcher]);

  useEffect(() => {
    if (mode !== 'live' || !route || arrived) return;
    const ticket = session.current;
    watcher.current = navigator.geolocation.watchPosition(
      (position) => {
        if (ticket !== session.current) return;
        const c = position.coords;
        if (c.accuracy > 65 || Date.now() - position.timestamp > 15000) {
          setNotice('Semnal GPS slab · păstrăm ultima poziție validă');
          setFix((f) => (f ? { ...f, speed: null, speedSource: null } : f));
          return;
        }
        const coordinate: Coordinate = [c.longitude, c.latitude];
        const previous = lastFix.current;
        if (previous && position.timestamp <= previous.timestamp) return;
        const movement = previous ? distance(previous.coordinate, coordinate) : 0;
        const seconds = previous ? (position.timestamp - previous.timestamp) / 1000 : 0;
        const estimated =
          seconds >= 1 &&
          seconds <= 10 &&
          movement > Math.max(10, c.accuracy + (previous?.accuracy ?? 0))
            ? movement / seconds
            : null;
        const speed =
          c.speed != null && c.speed >= 0 && c.speed < 70
            ? c.speed
            : estimated != null && estimated < 55
              ? estimated
              : null;
        const heading =
          c.heading != null && Number.isFinite(c.heading) && (speed ?? 0) > 1.5
            ? c.heading
            : previous && movement > Math.max(5, c.accuracy + previous.accuracy)
              ? bearing(previous.coordinate, coordinate)
              : (previous?.heading ?? null);
        const next: Fix = {
          coordinate,
          speed,
          speedSource:
            speed == null
              ? null
              : c.speed != null && c.speed >= 0 && c.speed < 70
                ? 'gps'
                : 'estimated',
          heading,
          accuracy: c.accuracy,
          timestamp: position.timestamp,
        };
        lastFix.current = next;
        const projection = project(
          coordinate,
          route.geometry,
          lengths,
          previous ? progressRef.current : undefined,
        );
        const onRoute = projection.distance < Math.max(25, c.accuracy) && c.accuracy <= 30;
        const along = onRoute
          ? Math.max(progressRef.current - 15, projection.progress)
          : progressRef.current;
        if (onRoute) {
          progressRef.current = along;
          setProgress(along);
        }
        setFix({ ...next, coordinate: onRoute ? projection.coordinate : coordinate });
        setNotice(
          c.accuracy > 30 ? `Precizie GPS ±${Math.round(c.accuracy)} m · poziție nealiniată` : null,
        );
        const offRoute = projection.distance > Math.max(50, c.accuracy * 1.5);
        deviationCount.current = offRoute ? deviationCount.current + 1 : 0;
        if (
          deviationCount.current >= 3 &&
          !rerouting.current &&
          Date.now() - lastReroute.current > 30000
        ) {
          lastReroute.current = Date.now();
          rerouting.current = true;
          setNotice('Recalculăm ruta…');
          void loadRoutes(coordinate, destination.coordinate).then((ok) => {
            if (ticket !== session.current) return;
            rerouting.current = false;
            deviationCount.current = 0;
            setNotice(
              ok ? 'Ruta a fost actualizată' : 'Recalcularea a eșuat · păstrăm ruta anterioară',
            );
          });
        }
        if (
          c.accuracy <= 25 &&
          distance(coordinate, route.geometry.at(-1)!) < 25 &&
          lengths.at(-1)! - along < 40
        ) {
          setArrived(true);
          setProgress(lengths.at(-1)!);
          setFix((f) => (f ? { ...f, speed: null, speedSource: null } : f));
          stopWatcher();
        }
      },
      () => {
        if (ticket === session.current) {
          setNotice('Urmărirea GPS este întreruptă · verifică permisiunile');
          setFix((f) => (f ? { ...f, speed: null, speedSource: null } : f));
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );
    return stopWatcher;
  }, [mode, route, lengths, destination, arrived, loadRoutes, stopWatcher]);

  const startDemo = useCallback(() => {
    if (!route) return;
    session.current++;
    stopWatcher();
    request.current?.abort();
    setLoading(false);
    setMode('demo');
    setProgress(0);
    progressRef.current = 0;
    setPaused(false);
    setArrived(false);
    setError(null);
    setNotice(null);
    setFollow(true);
    setPerspective(true);
    spoken.current = '';
    const p = sample(route.geometry, lengths, 0);
    setFix({
      coordinate: p.coordinate,
      heading: p.heading,
      speed: route.distance / route.duration,
      speedSource: 'simulated',
      accuracy: 0,
      timestamp: Date.now(),
    });
  }, [route, lengths, stopWatcher]);
  useEffect(() => {
    if (mode !== 'demo' || paused || arrived || !route) return;
    let previous = performance.now(),
      frame = 0,
      lastPaint = 0;
    const speed = (lengths.at(-1) ?? 0) / route.duration;
    const tick = (now: number) => {
      progressRef.current = Math.min(
        lengths.at(-1)!,
        progressRef.current + Math.min((now - previous) / 1000, 0.25) * speed,
      );
      previous = now;
      if (now - lastPaint >= 100) {
        const p = sample(route.geometry, lengths, progressRef.current);
        const ahead = sample(route.geometry, lengths, progressRef.current + 18);
        setFix({
          coordinate: p.coordinate,
          heading:
            distance(p.coordinate, ahead.coordinate) > 2
              ? bearing(p.coordinate, ahead.coordinate)
              : p.heading,
          speed,
          speedSource: 'simulated',
          accuracy: 0,
          timestamp: Date.now(),
        });
        setProgress(progressRef.current);
        lastPaint = now;
      }
      if (progressRef.current >= lengths.at(-1)!) {
        const p = sample(route.geometry, lengths, lengths.at(-1)!);
        setProgress(lengths.at(-1)!);
        setFix({
          coordinate: p.coordinate,
          heading: p.heading,
          speed: 0,
          speedSource: 'simulated',
          accuracy: 0,
          timestamp: Date.now(),
        });
        setArrived(true);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode, paused, arrived, route, lengths]);

  useEffect(() => {
    if (muted || !metrics || !['live', 'demo'].includes(mode) || !('speechSynthesis' in window))
      return;
    const key = `${route?.id}-${route?.geometry[0]?.join(',')}-${metrics.step.index}-${metrics.step.road}`;
    if (key === spoken.current) return;
    spoken.current = key;
    const text = new SpeechSynthesisUtterance(`${instruction(metrics.step)}. ${metrics.step.road}`);
    text.lang = 'ro-RO';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(text);
  }, [metrics, muted, mode, route?.id]);
  useEffect(() => {
    if (muted) window.speechSynthesis?.cancel();
  }, [muted]);

  useEffect(() => {
    if (!['live', 'demo'].includes(mode) || arrived || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined,
      disposed = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const held = await navigator.wakeLock.request('screen');
        if (disposed) {
          void held.release();
          return;
        }
        lock = held;
      } catch {
        /* Foreground navigation still works when battery policy denies wake lock. */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      void lock?.release();
      document.removeEventListener('visibilitychange', acquire);
    };
  }, [mode, arrived]);

  const mapPick = useCallback(
    (coordinate: Coordinate) => {
      if (!pickOrigin || mode !== 'preview') return;
      setManualOrigin(true);
      setOrigin(coordinate);
      setPickOrigin(false);
      setError(null);
    },
    [pickOrigin, mode],
  );

  return {
    mode,
    destinations: places.destinations,
    originName: places.origin.name,
    destination,
    setDestination,
    routes,
    route,
    selected,
    selectRoute: (index: number) => {
      setSelected(index);
      setProgress(0);
      progressRef.current = 0;
    },
    fix,
    progress,
    lengths,
    metrics,
    loading,
    error,
    notice,
    paused,
    setPaused,
    arrived,
    muted,
    setMuted,
    follow,
    setFollow,
    perspective,
    setPerspective,
    origin,
    manualOrigin,
    pickOrigin,
    setPickOrigin,
    mapPick,
    startLive,
    startDemo,
    stop,
    retry: () => loadRoutes(origin, destination.coordinate),
  };
}
