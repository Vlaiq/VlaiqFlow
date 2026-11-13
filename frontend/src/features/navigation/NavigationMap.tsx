import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import type { Coordinate, NavigationRoute } from '@vlaiq/shared';
import type { Fix, Mode } from './useNavigation';
import { sample } from './geometry';

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
}
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
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
  const lastCamera = useRef(0);
  const cameraControls = useRef('');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!container.current) return;
    setReady(false);
    setMapError(false);
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: 'https://tiles.openfreemap.org/styles/dark',
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
    const timeout = window.setTimeout(() => {
      if (!m.isStyleLoaded()) setMapError(true);
    }, 12000);
    m.on('error', () => {
      if (!m.isStyleLoaded()) setMapError(true);
    });
    m.on('load', () => {
      clearTimeout(timeout);
      setMapError(false);
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
        m.addSource(id, { type: 'geojson', data: empty }),
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
          label,
        );
      }
      m.addLayer({
        id: 'nav-accuracy-fill',
        type: 'fill',
        source: 'nav-accuracy',
        paint: { 'fill-color': '#65caff', 'fill-opacity': 0.1 },
      });
      setReady(true);
    });
    m.on('dragstart', () => latest.current.onDetach());
    m.on('rotatestart', (e) => {
      if (e.originalEvent) latest.current.onDetach();
    });
    m.on('zoomstart', (e) => {
      if (e.originalEvent) latest.current.onDetach();
    });
    m.on('click', (e) => latest.current.onPick([e.lngLat.lng, e.lngLat.lat]));
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
    (m.getSource('nav-alternatives') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: alternatives.map((r) => line(r.geometry)),
    });
    destination.current?.remove();
    if (props.route) {
      const element = document.createElement('div');
      element.className = 'nav-destination-marker';
      element.textContent = 'P';
      element.title = 'Destinație';
      destination.current = new maplibregl.Marker({ element })
        .setLngLat(props.route.geometry.at(-1)!)
        .addTo(m);
    }
  }, [ready, props.routes, props.route, props.mode]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!props.route) {
      (m.getSource('nav-upcoming') as GeoJSONSource).setData(empty);
      (m.getSource('nav-traveled') as GeoJSONSource).setData(empty);
      return;
    }
    const { route, progress, lengths } = props;
    const p = sample(route.geometry, lengths, progress);
    const upcoming = [p.coordinate, ...route.geometry.slice(p.index)];
    const traveled = [...route.geometry.slice(0, p.index), p.coordinate];
    (m.getSource('nav-upcoming') as GeoJSONSource).setData(line(upcoming));
    (m.getSource('nav-traveled') as GeoJSONSource).setData(progress > 0 ? line(traveled) : empty);
  }, [ready, props.route, props.progress, props.lengths]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!props.fix || props.mode === 'preview' || props.mode === 'acquiring') {
      vehicle.current?.remove();
      vehicle.current = undefined;
      (m.getSource('nav-accuracy') as GeoJSONSource).setData(empty);
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
    (m.getSource('nav-accuracy') as GeoJSONSource).setData(
      accuracy > 15
        ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
        : empty,
    );
  }, [ready, props.fix, props.mode]);

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

  return (
    <div className={`navigation-map ${props.pickOrigin ? 'picking-origin' : ''}`}>
      <div
        ref={container}
        className="navigation-map-canvas"
        role="region"
        aria-label="Hartă de navigație Timișoara"
      />
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
