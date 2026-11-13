import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import type { Coordinate, NavigationRoute } from '@vlaiq/shared';
import type { Fix, Mode } from './useNavigation';
import { sample } from './geometry';
import {
  addCountyScope,
  CountyControl,
  isInTimisCounty,
  TIMIS_COUNTY_BOUNDS,
} from '../map/countyScope';
import { localFallbackStyle } from '../map/localStyle';

interface Props {
  route?: NavigationRoute;
  routes: NavigationRoute[];
  fix: Fix | null;
  progress: number;
  lengths: number[];
  mode: Mode;
  perspective: boolean;
  follow: boolean;
  onDetach: () => void;
  onPick: (coordinate: Coordinate) => void;
  pickOrigin: boolean;
  recenter: number;
  theme?: 'dark' | 'light';
}
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
/**
 * A style change (theme switch or local fallback) removes our sources until 'style.load' adds them
 * again; updates arriving in between are skipped instead of crashing the screen.
 */
function setSourceData(m: maplibregl.Map, id: string, data: GeoJSON.GeoJSON) {
  (m.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}
const line = (coordinates: Coordinate[]): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: {},
});

export function NavigationMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map>();
  const vehicle = useRef<maplibregl.Marker>();
  const destination = useRef<maplibregl.Marker>();
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [styleRevision, setStyleRevision] = useState(0);
  const [localFallback, setLocalFallback] = useState(false);
  const fallbackRef = useRef(false);
  /** True once the provider style has loaded: later tile/sprite errors must not swap in the fallback. */
  const providerLoaded = useRef(false);
  const lastCamera = useRef(0);
  const cameraControls = useRef('');
  const previousTheme = useRef(props.theme ?? 'dark');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!container.current) return;
    setReady(false);
    setMapError(false);
    fallbackRef.current = false;
    providerLoaded.current = false;
    setLocalFallback(false);
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style:
          latest.current.theme === 'light'
            ? 'https://tiles.openfreemap.org/styles/liberty'
            : 'https://tiles.openfreemap.org/styles/dark',
        maxBounds: TIMIS_COUNTY_BOUNDS,
        center: [21.22, 45.755],
        zoom: 13.5,
        pitch: 0,
        attributionControl: { compact: true },
        maxPitch: 60,
        antialias: window.devicePixelRatio <= 2,
        maxZoom: 19,
      });
    } catch {
      setMapError(true);
      return;
    }
    map.current = m;
    m.once('idle', () => {
      const attribution = m
        .getContainer()
        .querySelector<HTMLDetailsElement>('details.maplibregl-ctrl-attrib');
      if (attribution) {
        attribution.open = false;
        attribution.classList.remove('maplibregl-compact-show');
      }
    });
    const showLocalFallback = () => {
      if (fallbackRef.current) return;
      fallbackRef.current = true;
      setLocalFallback(true);
      setReady(false);
      setMapError(false);
      m.setStyle(localFallbackStyle(latest.current.theme ?? 'dark'), { diff: false });
    };
    // Fall back only when the provider style never loaded. A single failed tile or sprite on a busy
    // network fires 'error' while isStyleLoaded() is still false; that is not an outage.
    const timeout = window.setTimeout(() => {
      if (!providerLoaded.current) showLocalFallback();
    }, 12000);
    m.on('error', (e) => {
      if (providerLoaded.current || fallbackRef.current) return;
      const failed = (e as { error?: { url?: string } }).error?.url ?? '';
      // Only a failure of the style document itself means the provider is unavailable.
      if (failed.includes('/styles/') || !m.getStyle()) showLocalFallback();
    });
    m.on('style.load', () => {
      if (map.current !== m) return;
      if (!fallbackRef.current) providerLoaded.current = true;
      clearTimeout(timeout);
      setMapError(false);
      addCountyScope(m, latest.current.theme ?? 'dark');
      // Keep the licensed provider's real streets, labels, parks and water.
      const layers = m.getStyle().layers ?? [];
      const label = layers.find((l) => l.type === 'symbol' && l.layout?.['text-field'])?.id;
      const building = layers.find(
        (l) => 'source-layer' in l && l['source-layer'] === 'building' && 'source' in l,
      );
      if (building && 'source' in building) {
        m.addLayer(
          {
            id: 'nav-buildings',
            type: 'fill-extrusion',
            source: building.source as string,
            'source-layer': 'building',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': '#343e49',
              'fill-extrusion-opacity': 0.72,
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 0],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'render_min_height'],
                ['get', 'min_height'],
                0,
              ],
            },
          },
          label,
        );
      }
      ['nav-alternatives', 'nav-upcoming', 'nav-traveled', 'nav-accuracy'].forEach((id) =>
        m.addSource(id, { type: 'geojson', data: empty, attribution: id === 'nav-upcoming' ? '© OpenStreetMap contributors (ODbL)' : undefined }),
      );
      const pathLayers = [
        ['alternatives', 'nav-alternatives', '#69788d', 5, 0.65],
        ['traveled', 'nav-traveled', '#66798c', 5, 0.8],
        ['halo', 'nav-upcoming', '#081d30', 13, 0.85],
        ['separation', 'nav-upcoming', '#b7edff', 8, 0.9],
        ['route', 'nav-upcoming', '#1dbbff', 5, 1],
      ] as const;
      for (const [id, source, color, width, opacity] of pathLayers) {
        m.addLayer(
          {
            id: `nav-${id}-line`,
            type: 'line',
            source,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': color,
              'line-width': ['interpolate', ['linear'], ['zoom'], 11, width * 0.6, 17, width],
              'line-opacity': opacity,
            },
          },
          undefined,
        );
      }
      m.addLayer({
        id: 'nav-accuracy-fill',
        type: 'fill',
        source: 'nav-accuracy',
        paint: { 'fill-color': '#65caff', 'fill-opacity': 0.1 },
      });
      setReady(true);
      setStyleRevision((v) => v + 1);
    });
    m.on('dragstart', () => latest.current.onDetach());
    m.on('rotatestart', (e) => {
      if (e.originalEvent) latest.current.onDetach();
    });
    m.on('zoomstart', (e) => {
      if (e.originalEvent) latest.current.onDetach();
    });
    m.on('click', (e) => {
      if (isInTimisCounty([e.lngLat.lng, e.lngLat.lat]))
        latest.current.onPick([e.lngLat.lng, e.lngLat.lat]);
    });
    m.addControl(
      new CountyControl(() => ({ top: 100, left: 60, bottom: 200, right: 60 }), 190),
      'bottom-left',
    );
    const observer = new ResizeObserver(() => {
      m.resize();
      const p = latest.current;
      if (p.follow && p.fix && ['live', 'demo'].includes(p.mode)) {
        m.easeTo({
          center: p.fix.coordinate,
          offset: [0, m.getContainer().clientHeight * 0.17],
          duration: 0,
        });
      }
    });
    observer.observe(container.current);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
      vehicle.current?.remove();
      destination.current?.remove();
      m.remove();
      map.current = undefined;
    };
  }, [attempt]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const alternatives =
      props.mode === 'preview' ? props.routes.filter((r) => r !== props.route) : [];
    setSourceData(m, 'nav-alternatives', {
      type: 'FeatureCollection',
      features: alternatives.map((r) => line(r.geometry)),
    });
    destination.current?.remove();
    if (props.route && isInTimisCounty(props.route.geometry.at(-1)!)) {
      const element = document.createElement('div');
      element.className = 'nav-destination-marker';
      element.textContent = 'P';
      element.title = 'Destinație';
      destination.current = new maplibregl.Marker({ element })
        .setLngLat(props.route.geometry.at(-1)!)
        .addTo(m);
    }
  }, [ready, styleRevision, props.routes, props.route, props.mode]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!props.route) {
      setSourceData(m, 'nav-upcoming', empty);
      setSourceData(m, 'nav-traveled', empty);
      return;
    }
    const { route, progress, lengths } = props;
    const p = sample(route.geometry, lengths, progress);
    const upcoming = [p.coordinate, ...route.geometry.slice(p.index)];
    const traveled = [...route.geometry.slice(0, p.index), p.coordinate];
    setSourceData(m, 'nav-upcoming', line(upcoming));
    setSourceData(m, 'nav-traveled', progress > 0 ? line(traveled) : empty);
  }, [ready, styleRevision, props.route, props.progress, props.lengths]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!props.fix || props.mode === 'preview' || props.mode === 'acquiring') {
      vehicle.current?.remove();
      vehicle.current = undefined;
      setSourceData(m, 'nav-accuracy', empty);
      return;
    }
    if (!vehicle.current) {
      const element = document.createElement('div');
      element.className = 'nav-vehicle';
      // Original vector artwork, nose points north; MapLibre owns rotation and projection.
      element.innerHTML =
        '<svg width="54" height="62" viewBox="0 0 54 62" aria-hidden="true"><path d="M27 5 47 53 27 43 7 53Z" fill="#f2faff" stroke="#118bdb" stroke-width="3" stroke-linejoin="round"/><path d="M27 17 36 41 27 36 18 41Z" fill="#1daeff"/></svg>';
      element.setAttribute(
        'aria-label',
        props.mode === 'demo' ? 'Vechicul demonstrativ' : 'Poziția GPS',
      );
      vehicle.current = new maplibregl.Marker({
        element,
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat(props.fix.coordinate)
        .addTo(m);
    }
    vehicle.current.setLngLat(props.fix.coordinate).setRotation(props.fix.heading ?? 0);
    vehicle.current.getElement().classList.toggle('heading-unknown', props.fix.heading == null);
    const { coordinate: c, accuracy } = props.fix;
    const ring: Coordinate[] = Array.from({ length: 33 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      return [
        c[0] + (Math.cos(angle) * accuracy) / (111195 * Math.cos((c[1] * Math.PI) / 180)),
        c[1] + (Math.sin(angle) * accuracy) / 111195,
      ];
    });
    setSourceData(m, 'nav-accuracy', 
      accuracy > 15
        ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
        : empty,
    );
  }, [ready, styleRevision, props.fix, props.mode]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !props.route) return;
    if (props.mode === 'preview' || props.mode === 'acquiring') {
      const bounds = props.route.geometry.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(),
      );
      const desktop = m.getContainer().clientWidth > 800;
      m.fitBounds(bounds, {
        padding: desktop
          ? { top: 110, bottom: 100, left: 450, right: 150 }
          : { top: 160, bottom: 330, left: 55, right: 65 },
        maxZoom: 15.5,
        duration: reduced ? 0 : 900,
        pitch: 0,
        bearing: 0,
      });
    }
  }, [ready, props.route, props.mode, reduced, props.recenter]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !props.follow || !props.fix || !['live', 'demo'].includes(props.mode))
      return;
    const controls = `${props.recenter}-${props.perspective}-${props.follow}-${props.mode}`;
    if (cameraControls.current === controls && performance.now() - lastCamera.current < 280) return;
    cameraControls.current = controls;
    lastCamera.current = performance.now();
    const metricsDistance = props.route?.steps.find(
      (s) => props.lengths[s.index]! > props.progress + 8,
    );
    const nearTurn =
      metricsDistance && props.lengths[metricsDistance.index]! - props.progress < 140;
    m.easeTo({
      center: props.fix.coordinate,
      bearing: props.perspective ? (props.fix.heading ?? m.getBearing()) : 0,
      pitch: props.perspective ? (m.getContainer().clientWidth < 600 ? 52 : 56) : 0,
      zoom: nearTurn ? 17.2 : 16.6,
      offset: [0, m.getContainer().clientHeight * 0.17],
      duration: reduced ? 0 : 400,
      essential: false,
    });
  }, [
    ready,
    props.fix,
    props.follow,
    props.perspective,
    props.mode,
    props.recenter,
    props.route,
    props.lengths,
    props.progress,
    reduced,
  ]);

  useEffect(() => {
    const m = map.current;
    if (!m || previousTheme.current === (props.theme ?? 'dark')) return;
    previousTheme.current = props.theme ?? 'dark';
    setReady(false);
    m.setStyle(
      fallbackRef.current
        ? localFallbackStyle(props.theme ?? 'dark')
        : `https://tiles.openfreemap.org/styles/${props.theme === 'light' ? 'liberty' : 'dark'}`,
      // A diffed style change does not fire 'style.load', so our sources and layers would never come back.
      { diff: false },
    );
  }, [props.theme]);

  return (
    <div className={`navigation-map ${props.pickOrigin ? 'picking-origin' : ''}`}>
      <div
        ref={container}
        className="navigation-map-canvas"
        role="region"
        aria-label="Hartă de navigație Timișoara"
      />
      {localFallback && (
        <p
          role="status"
          className="pointer-events-none absolute bottom-5 left-3 z-10 max-w-[210px] rounded-lg border border-border bg-surface px-3 py-2 text-[11px] leading-relaxed text-muted"
        >
          Hartă locală de rezervă · acoperire parțială Timpark
        </p>
      )}
      {mapError && (
        <div className="map-unavailable" role="status">
          <span className="status-dot warning" />
          <span>Harta nu este disponibilă. Verifică conexiunea.</span>
          <button onClick={() => setAttempt((a) => a + 1)}>Reîncearcă</button>
        </div>
      )}
    </div>
  );
}
