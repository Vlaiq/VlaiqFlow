import { useEffect, useRef, useState } from 'react';
import { FIX_THE_MAP } from './attribution';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import {
  TIMISOARA_CENTER,
  type Coordinate,
  type Destination,
  type Parking,
  type RecommendationOption,
  type TimparkSnapshot,
  circleRing,
  schoolLabel,
  type ProtectedZone,
} from '@vlaiq/shared';
import {
  addTimparkLayers,
  TIMPARK_CLICKABLE_LAYERS,
  TIMPARK_DETAIL_LAYERS,
  TIMPARK_SOURCE,
  timparkPopupContent,
} from './timparkLayers';

import { osmParkingPopupContent } from './osmParkingPopup';
import { addCountyScope, CountyControl, isInTimisCounty, TIMIS_COUNTY_BOUNDS } from './countyScope';
import { localFallbackStyle } from './localStyle';
import type { JourneyMapSelection } from '../journey/GreenSwitch';
import { journeyFeatures, JOURNEY_SOURCE } from './journeyLayers';

const TAP_TOLERANCE_PX = 8;

// OpenFreeMap: free vector tiles, no API key. Its style carries the OSM/OpenMapTiles attribution.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const PARKINGS_SOURCE = 'parkings';
const PARKINGS_LAYER = 'parkings-circle';
const ROUTE_SOURCE = 'drive-route';
const ROUTE_LAYER = 'drive-route-line';
const WALK_SOURCE = 'parking-walk-route';
const WALK_LAYER = 'parking-walk-route-line';
const ZONE_SOURCE = 'school-zone';
const ZONE_LAYER = 'school-zone-fill';

function parkingsToGeoJSON(parkings: Parking[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: parkings
      .filter((p) => isInTimisCounty([p.lng, p.lat]))
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, name: p.name, access: p.access },
      })),
  };
}

interface Props {
  parkings: Parking[];
  timpark: TimparkSnapshot | null;
  destination: Destination | null;
  recommendations?: RecommendationOption[];
  selectedRecommendationId?: string | null;
  /** Bumped by the panel when the user picks an option: the map flies to it. */
  focusRecommendation?: { id: string; n: number } | null;
  onSelectRecommendation?: (id: string) => void;
  /** Driving route to the open parking, exactly as returned by the routing provider. */
  route?: Coordinate[] | null;
  /** Walking route parking → destination for the open parking, provider geometry only. */
  walkRoute?: Coordinate[] | null;
  theme?: 'dark' | 'light';
  pickingOrigin?: boolean;
  onPickOrigin?: (coordinate: Coordinate) => void;
  origin?: Coordinate | null;
  journey?: JourneyMapSelection | null;
  /** School drop-off zone next to the destination (§6.16), drawn while it is active. */
  protectedZone?: ProtectedZone | null;
  /** Where the user saved their parked car (this device only). */
  car?: Coordinate | null;
}

const FLY_ZOOM: Record<Destination['precision'], number> = {
  exact: 16.5,
  street: 16,
  neighbourhood: 14.5,
  none: 14,
};

/**
 * Keeps a flown-to point in the part of the map the panels leave visible:
 * left of the 440 px side panel on laptops, above the bottom sheet on phones. Matches App.tsx.
 */
function visibleMapPadding(): maplibregl.PaddingOptions {
  if (window.matchMedia('(min-width: 1024px)').matches) {
    // Keep fitted routes and parkings clear of the sidebar, whose width grows with the screen.
    const side = document.querySelector('.explore-sidebar')?.getBoundingClientRect();
    const canvas = document.querySelector('.explore-screen')?.getBoundingClientRect();
    const left = side && canvas ? Math.round(side.right - canvas.left + 40) : 460;
    return { left, top: 20, right: 60, bottom: 20 };
  }
  const sheet = document.querySelector('.explore-panel')?.getBoundingClientRect();
  const canvas = document.querySelector('.explore-screen')?.getBoundingClientRect();
  const bottom = sheet && canvas ? canvas.bottom - sheet.top + 16 : window.innerHeight * 0.42;
  return {
    left: 22,
    top: 100,
    right: 55,
    bottom: Math.round(Math.min(bottom, (canvas?.height ?? window.innerHeight) - 160)),
  };
}

function recommendationMarkerElement(
  rank: number,
  name: string,
  selected: boolean,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = String(rank);
  el.setAttribute('aria-label', `Parcarea recomandată ${rank}: ${name}`);
  const size = selected ? 32 : 26;
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:9999px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font:700 13px/1 system-ui,sans-serif',
    'cursor:pointer',
    // Rank 1 = green with dark text (white on green fails contrast); others = dark with mint text.
    rank === 1 ? 'background:#22C55E;color:#0B1410' : 'background:#16221D;color:#EAF6ED',
    `border:${selected ? 3 : 2}px solid #EAF6ED`,
    'box-shadow:0 0 0 2px #101916',
  ].join(';');
  return el;
}

function destinationMarkerElement(approximate: boolean): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'width:22px',
    'height:22px',
    'border-radius:50% 50% 50% 0',
    'transform:rotate(-45deg)',
    `background:${approximate ? 'transparent' : '#EAF6ED'}`,
    'border:3px solid #EAF6ED',
    'box-shadow:0 0 0 2px #101916',
  ].join(';');
  return el;
}

export function MapView({
  parkings,
  timpark,
  destination,
  recommendations = [],
  selectedRecommendationId = null,
  focusRecommendation = null,
  onSelectRecommendation,
  route = null,
  walkRoute = null,
  theme = 'dark',
  pickingOrigin = false,
  onPickOrigin,
  origin = null,
  journey = null,
  protectedZone = null,
  car = null,
}: Props) {
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [styleRevision, setStyleRevision] = useState(0);
  const [localFallback, setLocalFallback] = useState(false);
  const fallbackRef = useRef(false);
  const previousTheme = useRef(theme);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const pickingRef = useRef({ pickingOrigin, onPickOrigin });
  pickingRef.current = { pickingOrigin, onPickOrigin };
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  /** True once the provider style has loaded: later tile/sprite errors never swap in the fallback. */
  const providerLoadedRef = useRef(false);
  const parkingsRef = useRef(parkings);
  parkingsRef.current = parkings;
  const timparkRef = useRef(timpark);
  timparkRef.current = timpark;

  // Create the map once; tear it down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    setMapError(null);
    loadedRef.current = false;
    fallbackRef.current = false;
    setLocalFallback(false);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style:
          themeRef.current === 'light' ? 'https://tiles.openfreemap.org/styles/liberty' : STYLE_URL,
        maxBounds: TIMIS_COUNTY_BOUNDS,
        center: [TIMISOARA_CENTER.lng, TIMISOARA_CENTER.lat],
        zoom: 14,
        attributionControl: false,
      });
    } catch {
      containerRef.current.replaceChildren();
      setMapError(
        'Browserul nu a putut porni harta. Încearcă un browser cu WebGL și accelerare grafică activate.',
      );
      return;
    }
    mapRef.current = map;
    const showLocalFallback = () => {
      if (fallbackRef.current) return;
      fallbackRef.current = true;
      setLocalFallback(true);
      loadedRef.current = false;
      setMapError(null);
      map.setStyle(localFallbackStyle(themeRef.current), { diff: false });
    };
    providerLoadedRef.current = false;
    const timeout = window.setTimeout(() => {
      if (!providerLoadedRef.current) showLocalFallback();
    }, 12000);
    // Only a failure of the style document itself means the provider is down. A single tile or sprite
    // failing (common on busy networks) fires 'error' before the map is idle; it must not replace a
    // working street map with the generalized fallback (same rule as NavigationMap).
    map.on('error', (e) => {
      if (providerLoadedRef.current || fallbackRef.current) return;
      const failed = (e as { error?: { url?: string } }).error?.url ?? '';
      if (failed.includes('/styles/') || !map.getStyle()) showLocalFallback();
    });

    // Dev-only handle for debugging in the browser console (stripped from production builds).
    if (import.meta.env.DEV)
      (window as unknown as { __vlaiqMap?: maplibregl.Map }).__vlaiqMap = map;

    // Controls and the required OSM attribution sit top-right, below the header, so the info sheet never covers them.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: FIX_THE_MAP }),
      'top-right',
    );
    // Compact attribution opens itself on narrow screens; close it as soon as the map shows (the ⓘ
    // button keeps it one tap away), not only once every tile has loaded.
    const collapseAttribution = () => {
      const attribution = map
        .getContainer()
        .querySelector<HTMLDetailsElement>('details.maplibregl-ctrl-attrib');
      if (attribution) {
        attribution.open = false;
        attribution.classList.remove('maplibregl-compact-show');
      }
    };
    map.once('load', collapseAttribution);
    map.once('idle', collapseAttribution);

    const popup = new maplibregl.Popup({ closeButton: true, offset: 10, maxWidth: '300px' });

    map.on('style.load', () => {
      if (mapRef.current !== map) return;
      window.clearTimeout(timeout);
      setMapError(null);
      loadedRef.current = true;
      if (!fallbackRef.current) providerLoadedRef.current = true;
      addCountyScope(map, themeRef.current);
      setStyleRevision((v) => v + 1);

      map.addSource(PARKINGS_SOURCE, {
        type: 'geojson',
        attribution: '© OpenStreetMap contributors (ODbL)',
        data: parkingsToGeoJSON(parkingsRef.current),
      });
      map.addLayer({
        id: PARKINGS_LAYER,
        type: 'circle',
        source: PARKINGS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 8],
          // Mint, kept distinct from the Timpark tariff colours; customer-only parkings are hollow.
          'circle-color': ['case', ['==', ['get', 'access'], 'customers'], '#101916', '#EAF6ED'],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'access'], 'customers'],
            '#EAF6ED',
            '#101916',
          ],
          'circle-stroke-width': 2,
        },
      });

      if (timparkRef.current) addTimparkLayers(map, timparkRef.current, PARKINGS_LAYER);
    });

    map.on('click', PARKINGS_LAYER, (e) => {
      if (pickingRef.current.pickingOrigin) return;
      const f = e.features?.[0];
      if (!f || f.geometry.type !== 'Point') return;
      const parking = parkingsRef.current.find((p) => p.id === f.properties?.id);
      if (!parking) return;
      popup
        .setLngLat(f.geometry.coordinates as [number, number])
        .setDOMContent(osmParkingPopupContent(parking))
        .addTo(map);
    });

    // One handler for all Timpark layers: the topmost feature under the cursor wins.
    map.on('click', (e) => {
      if (pickingRef.current.pickingOrigin) return;
      const snapshot = timparkRef.current;
      if (!snapshot || !map.getSource(TIMPARK_SOURCE)) return;
      if (map.queryRenderedFeatures(e.point, { layers: [PARKINGS_LAYER] }).length) return;
      // Streets are thin lines: search a small box around the tap before falling back to the zone underneath.
      const { x, y } = e.point;
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [x - TAP_TOLERANCE_PX, y - TAP_TOLERANCE_PX],
        [x + TAP_TOLERANCE_PX, y + TAP_TOLERANCE_PX],
      ];
      const hit =
        map.queryRenderedFeatures(box, { layers: TIMPARK_DETAIL_LAYERS })[0] ??
        map.queryRenderedFeatures(e.point, { layers: TIMPARK_CLICKABLE_LAYERS })[0];
      const id = hit?.properties?.id;
      if (typeof id !== 'string') return;
      const content = timparkPopupContent(snapshot, id);
      if (content) popup.setLngLat(e.lngLat).setDOMContent(content).addTo(map);
    });

    for (const layer of [PARKINGS_LAYER, ...TIMPARK_CLICKABLE_LAYERS]) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }
    map.on('click', (e) => {
      if (pickingRef.current.pickingOrigin && isInTimisCounty([e.lngLat.lng, e.lngLat.lat]))
        pickingRef.current.onPickOrigin?.([e.lngLat.lng, e.lngLat.lat]);
    });
    map.addControl(new CountyControl(visibleMapPadding), 'top-right');

    // MapLibre's own ResizeObserver skips its first callback. If the container had no size when the map
    // was created (CSS not applied yet, hidden pane or tab), the canvas stays at the 400×300 default:
    // most of the screen is blank, map clicks (pick origin) miss and route fitting fails. Resize whenever
    // the canvas no longer matches its container.
    const container = map.getContainer();
    const syncSize = () => {
      const canvas = map.getCanvas();
      if (
        canvas.clientWidth !== container.clientWidth ||
        canvas.clientHeight !== container.clientHeight
      )
        map.resize();
    };
    const sizeObserver = new ResizeObserver(syncSize);
    sizeObserver.observe(container);
    map.once('load', syncSize);

    return () => {
      sizeObserver.disconnect();
      window.clearTimeout(timeout);
      popup.remove();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, [attempt]);

  // Push new data straight into MapLibre instead of re-rendering React.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getStyle()?.sources?.[PARKINGS_SOURCE]
      ? (map.getSource(PARKINGS_SOURCE) as GeoJSONSource)
      : undefined;
    source?.setData(parkingsToGeoJSON(parkings));
  }, [parkings, styleRevision]);

  // Timpark data may arrive after the map has loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !map.getStyle()?.sources?.[PARKINGS_SOURCE] ||
      !timpark ||
      map.getSource(TIMPARK_SOURCE)
    )
      return;
    addTimparkLayers(map, timpark, PARKINGS_LAYER);
  }, [timpark, styleRevision]);

  // Destination marker: filled pin for a known position, hollow pin for an approximate one.
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !destination?.location ||
      !isInTimisCounty([destination.location.lng, destination.location.lat])
    )
      return;
    const { lng, lat } = destination.location;
    const marker = new maplibregl.Marker({
      element: destinationMarkerElement(
        destination.precision !== 'exact' && destination.precision !== 'street',
      ),
      anchor: 'bottom',
    })
      .setLngLat([lng, lat])
      .addTo(map);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyTo({
      center: [lng, lat],
      zoom: FLY_ZOOM[destination.precision],
      padding: visibleMapPadding(),
      animate: !reduceMotion,
      essential: false,
    });
    return () => {
      marker.remove();
    };
  }, [destination, attempt, styleRevision]);

  // Driving route line (provider geometry, never a straight line). Drawn under the parking dots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getStyle()?.sources?.[PARKINGS_SOURCE]) return;
      const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
        type: 'FeatureCollection',
        features:
          route && route.length >= 2
            ? [
                {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: route },
                  properties: {},
                },
              ]
            : [],
      };
      const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data });
        const before = map.getLayer(PARKINGS_LAYER) ? PARKINGS_LAYER : undefined;
        map.addLayer(
          {
            id: `${ROUTE_LAYER}-casing`,
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#101916', 'line-width': 9 },
          },
          before,
        );
        map.addLayer(
          {
            id: ROUTE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#22C55E', 'line-width': 5 },
          },
          before,
        );
      }
      if (route && route.length >= 2) {
        const bounds = new maplibregl.LngLatBounds(route[0], route[0]);
        for (const c of route) bounds.extend(c);
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        map.fitBounds(bounds, {
          padding: visibleMapPadding(),
          maxZoom: 16.5,
          animate: !reduceMotion,
        });
      }
    };
    if (map.getStyle()?.sources?.[PARKINGS_SOURCE]) apply();
    else map.once('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [route, attempt, styleRevision]);

  // Walking leg of the open parking, dashed. Fitted to the view only when there is no driving route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getStyle()?.sources?.[PARKINGS_SOURCE]) return;
      const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
        type: 'FeatureCollection',
        features:
          walkRoute && walkRoute.length >= 2
            ? [
                {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: walkRoute },
                  properties: {},
                },
              ]
            : [],
      };
      const source = map.getSource(WALK_SOURCE) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource(WALK_SOURCE, {
          type: 'geojson',
          data,
          attribution: '© OpenStreetMap contributors',
        });
        const before = map.getLayer(PARKINGS_LAYER) ? PARKINGS_LAYER : undefined;
        map.addLayer(
          {
            id: `${WALK_LAYER}-casing`,
            type: 'line',
            source: WALK_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': theme === 'light' ? '#ffffff' : '#0b2015', 'line-width': 8 },
          },
          before,
        );
        map.addLayer(
          {
            id: WALK_LAYER,
            type: 'line',
            source: WALK_SOURCE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': theme === 'light' ? '#567d31' : '#c5e7af',
              'line-width': 4,
              'line-dasharray': [1.4, 1.4],
            },
          },
          before,
        );
      }
      if (walkRoute && walkRoute.length >= 2 && !route) {
        const bounds = new maplibregl.LngLatBounds(walkRoute[0], walkRoute[0]);
        for (const c of walkRoute) bounds.extend(c);
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        map.fitBounds(bounds, {
          padding: visibleMapPadding(),
          maxZoom: 17,
          animate: !reduceMotion,
        });
      }
    };
    if (map.getStyle()?.sources?.[PARKINGS_SOURCE]) apply();
    else map.once('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkRoute, attempt, styleRevision]);

  // School drop-off zone: a dashed circle per school, drawn only while the zone is active (§6.16).
  const zoneKey = protectedZone?.active
    ? JSON.stringify([protectedZone.applied, protectedZone.radiusM, protectedZone.schools.map((s) => s.coordinate)])
    : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getStyle()?.sources?.[PARKINGS_SOURCE]) return;
      const zone = protectedZone?.active ? protectedZone : null;
      const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
        type: 'FeatureCollection',
        features: (zone?.schools ?? []).map((s) => ({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [circleRing(s.coordinate, zone!.radiusM, 48)] },
          properties: { label: schoolLabel(s), applied: zone!.applied },
        })),
      };
      const source = map.getSource(ZONE_SOURCE) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource(ZONE_SOURCE, { type: 'geojson', data, attribution: '© OpenStreetMap contributors' });
        const before = map.getLayer(PARKINGS_LAYER) ? PARKINGS_LAYER : undefined;
        map.addLayer(
          {
            id: ZONE_LAYER,
            type: 'fill',
            source: ZONE_SOURCE,
            paint: { 'fill-color': '#f3bd6c', 'fill-opacity': ['case', ['get', 'applied'], 0.16, 0.07] },
          },
          before,
        );
        map.addLayer(
          {
            id: `${ZONE_LAYER}-outline`,
            type: 'line',
            source: ZONE_SOURCE,
            paint: {
              'line-color': theme === 'light' ? '#9a6412' : '#f3bd6c',
              'line-width': 2,
              'line-dasharray': [2, 1.5],
            },
          },
          before,
        );
      }
    };
    if (map.getStyle()?.sources?.[PARKINGS_SOURCE]) apply();
    else map.once('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneKey, attempt, styleRevision]);

  // Numbered markers for the SmartMatch options; HTML buttons so they are keyboard-reachable.
  const onSelectRef = useRef(onSelectRecommendation);
  onSelectRef.current = onSelectRecommendation;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || recommendations.length === 0) return;
    const markers = recommendations
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => isInTimisCounty(o.coordinate))
      .map(({ o, i }) => {
        const el = recommendationMarkerElement(i + 1, o.name, o.id === selectedRecommendationId);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current?.(o.id);
        });
        return new maplibregl.Marker({ element: el }).setLngLat(o.coordinate).addTo(map);
      });
    return () => markers.forEach((m) => m.remove());
  }, [recommendations, selectedRecommendationId, attempt, styleRevision]);

  // Show the destination and every option together when a new list arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || journey || !destination?.location || recommendations.length === 0) return;
    const bounds = new maplibregl.LngLatBounds(
      [destination.location.lng, destination.location.lat],
      [destination.location.lng, destination.location.lat],
    );
    for (const o of recommendations) if (isInTimisCounty(o.coordinate)) bounds.extend(o.coordinate);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.fitBounds(bounds, { padding: visibleMapPadding(), maxZoom: 17, animate: !reduceMotion });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations]);

  useEffect(() => {
    const map = mapRef.current;
    const o = focusRecommendation && recommendations.find((r) => r.id === focusRecommendation.id);
    if (!map || !o || !isInTimisCounty(o.coordinate)) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyTo({
      center: o.coordinate,
      zoom: Math.max(map.getZoom(), 16.5),
      padding: visibleMapPadding(),
      animate: !reduceMotion,
      essential: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRecommendation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || previousTheme.current === theme) return;
    previousTheme.current = theme;
    loadedRef.current = false;
    map.setStyle(
      fallbackRef.current
        ? localFallbackStyle(theme)
        : `https://tiles.openfreemap.org/styles/${theme === 'light' ? 'liberty' : 'dark'}`,
      // A diffed style change does not fire 'style.load', so parkings, Timpark and route layers would be lost.
      { diff: false },
    );
  }, [theme]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickingOrigin ? 'crosshair' : '';
  }, [pickingOrigin]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin || !isInTimisCounty(origin)) return;
    const element = document.createElement('div');
    element.setAttribute('aria-label', 'Punct de plecare');
    element.style.cssText =
      'width:18px;height:18px;border:3px solid white;border-radius:50%;background:#167d50;box-shadow:0 0 0 4px #167d5044';
    const marker = new maplibregl.Marker({ element }).setLngLat(origin).addTo(map);
    return () => {
      marker.remove();
    };
  }, [origin, attempt, styleRevision]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !car || !isInTimisCounty(car)) return;
    const element = document.createElement('div');
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', 'Mașina ta (locul salvat pe acest dispozitiv)');
    element.textContent = 'P';
    element.style.cssText =
      'width:26px;height:26px;display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui;color:#0b1410;border:3px solid white;border-radius:8px;background:#7ee2a8;box-shadow:0 2px 8px #0008';
    const marker = new maplibregl.Marker({ element }).setLngLat(car).addTo(map);
    return () => {
      marker.remove();
    };
  }, [car, attempt, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getStyle()?.sources?.[PARKINGS_SOURCE]) return;
    const data = journeyFeatures(journey?.value ?? null, journey?.legId ?? null);
    const existing = map.getSource(JOURNEY_SOURCE) as GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource(JOURNEY_SOURCE, {
        type: 'geojson',
        data,
        attribution: '© OpenStreetMap contributors',
      });
      map.addLayer({
        id: 'flow-journey-casing',
        type: 'line',
        source: JOURNEY_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': theme === 'light' ? '#ffffff' : '#0b2015',
          'line-width': 10,
          'line-opacity': ['case', ['get', 'emphasized'], 0.9, 0.35],
        },
      });
      for (const mode of ['drive', 'walk', 'cycle']) {
        map.addLayer({
          id: `flow-journey-${mode}`,
          type: 'line',
          source: JOURNEY_SOURCE,
          filter: ['==', ['get', 'mode'], mode],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color':
              mode === 'drive'
                ? '#2194ec'
                : mode === 'cycle'
                  ? '#19ad75'
                  : theme === 'light'
                    ? '#567d31'
                    : '#c5e7af',
            'line-width': ['case', ['get', 'emphasized'], 5, 3],
            'line-opacity': ['case', ['get', 'emphasized'], 1, 0.4],
            ...(mode === 'walk' ? { 'line-dasharray': [1.4, 1.4] } : {}),
          },
        });
      }
    }
    const parking = journey?.value.parking;
    let marker: maplibregl.Marker | undefined;
    if (parking) {
      const element = document.createElement('div');
      element.className = 'journey-map-parking';
      element.textContent = 'P';
      element.setAttribute('aria-label', `Parchează: ${parking.name}`);
      marker = new maplibregl.Marker({ element }).setLngLat(parking.coordinate).addTo(map);
    }
    const selected = journey?.value.legs.find((l) => l.id === journey.legId);
    const points = selected
      ? selected.type === 'parking'
        ? [selected.from]
        : selected.route.geometry
      : (data.features.flatMap((f) => f.geometry.coordinates) as Coordinate[]);
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      if (!points.length) return;
      frame = requestAnimationFrame(() => {
        const bounds = new maplibregl.LngLatBounds(
          points[0] as Coordinate,
          points[0] as Coordinate,
        );
        points.forEach((p) => bounds.extend(p as Coordinate));
        map.stop();
        map.fitBounds(bounds, {
          padding: visibleMapPadding(),
          maxZoom: selected ? 17 : 16,
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
          essential: false,
        });
      });
    };
    fit();
    window.addEventListener('resize', fit);
    const observer = new ResizeObserver(fit);
    const sheet = document.querySelector('.explore-panel');
    if (sheet) observer.observe(sheet);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', fit);
      marker?.remove();
    };
  }, [journey, attempt, styleRevision]);

  return (
    <div className={`absolute inset-0 ${pickingOrigin ? 'picking-origin' : ''}`}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="region"
        aria-label="Harta Timișoarei"
      />
      {localFallback && (
        <p
          role="status"
          className="pointer-events-none absolute bottom-24 right-3 z-10 max-w-[220px] rounded-lg border border-border bg-surface px-3 py-2 text-[11px] leading-relaxed text-muted"
        >
          Hartă locală de rezervă · acoperire parțială Timpark
        </p>
      )}
      {mapError && (
        <div
          role="alert"
          className="absolute left-1/2 top-1/3 z-10 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-card border border-border bg-surface p-5 shadow-xl"
        >
          <h1 className="text-base font-semibold">Harta este temporar indisponibilă</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{mapError}</p>
          <button
            className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Reîncarcă harta
          </button>
        </div>
      )}
    </div>
  );
}
