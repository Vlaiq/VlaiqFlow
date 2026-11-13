import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { TIMISOARA_CENTER, type Destination, type Parking, type TimparkSnapshot } from '@vlaiq/shared';
import {
  addTimparkLayers,
  TIMPARK_CLICKABLE_LAYERS,
  TIMPARK_DETAIL_LAYERS,
  TIMPARK_SOURCE,
  timparkPopupContent,
} from './timparkLayers';

import { osmParkingPopupContent } from './osmParkingPopup';

const TAP_TOLERANCE_PX = 8;

// OpenFreeMap: free vector tiles, no API key. Its style carries the OSM/OpenMapTiles attribution.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const PARKINGS_SOURCE = 'parkings';
const PARKINGS_LAYER = 'parkings-circle';

function parkingsToGeoJSON(parkings: Parking[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: parkings.map((p) => ({
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
}

const FLY_ZOOM: Record<Destination['precision'], number> = { exact: 16.5, street: 16, neighbourhood: 14.5, none: 14 };

/**
 * Keeps a flown-to point in the part of the map the panels leave visible:
 * left of the 440 px side panel on laptops, above the bottom sheet on phones. Matches App.tsx.
 */
function visibleMapPadding(): maplibregl.PaddingOptions {
  if (window.matchMedia('(min-width: 1024px)').matches) return { left: 460, top: 20, right: 60, bottom: 20 };
  return { left: 0, top: 90, right: 0, bottom: Math.round(window.innerHeight * 0.42) };
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

export function MapView({ parkings, timpark, destination }: Props) {
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const parkingsRef = useRef(parkings);
  parkingsRef.current = parkings;
  const timparkRef = useRef(timpark);
  timparkRef.current = timpark;

  // Create the map once; tear it down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    setMapError(null);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [TIMISOARA_CENTER.lng, TIMISOARA_CENTER.lat],
      zoom: 14,
      attributionControl: false,
    });
    } catch {
      containerRef.current.replaceChildren();
      setMapError('Browserul nu a putut porni harta. Încearcă un browser cu WebGL și accelerare grafică activate.');
      return;
    }
    mapRef.current = map;
    const timeout = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setMapError('Harta nu se poate încărca. Verifică conexiunea și accesul la serviciul de hărți.');
    }, 12000);
    // Only errors that stop the map from starting count. After the first load, a single tile or
    // sprite failing (common on busy networks) must not cover a working map (same rule as NavigationMap).
    map.on('error', () => {
      if (!loadedRef.current && !map.isStyleLoaded()) {
        setMapError('Serviciul de hărți nu este disponibil. Poți reîncerca încărcarea.');
      }
    });


    // Dev-only handle for debugging in the browser console (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __vlaiqMap?: maplibregl.Map }).__vlaiqMap = map;

    // Controls and the required OSM attribution sit top-right, below the header, so the info sheet never covers them.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      'top-right',
    );
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');

    const popup = new maplibregl.Popup({ closeButton: true, offset: 10, maxWidth: '300px' });

    map.on('load', () => {
      window.clearTimeout(timeout);
      setMapError(null);
      loadedRef.current = true;

      map.addSource(PARKINGS_SOURCE, { type: 'geojson', data: parkingsToGeoJSON(parkingsRef.current) });
      map.addLayer({
        id: PARKINGS_LAYER,
        type: 'circle',
        source: PARKINGS_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 8],
          // Mint, kept distinct from the Timpark tariff colours; customer-only parkings are hollow.
          'circle-color': ['case', ['==', ['get', 'access'], 'customers'], '#101916', '#EAF6ED'],
          'circle-stroke-color': ['case', ['==', ['get', 'access'], 'customers'], '#EAF6ED', '#101916'],
          'circle-stroke-width': 2,
        },
      });

      if (timparkRef.current) addTimparkLayers(map, timparkRef.current, PARKINGS_LAYER);

      map.on('click', PARKINGS_LAYER, (e) => {
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
    });

    return () => {
      window.clearTimeout(timeout);
      popup.remove();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, [attempt]);

  // Push new data straight into MapLibre instead of re-rendering React.
  useEffect(() => {
    const source = mapRef.current?.getSource(PARKINGS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(parkingsToGeoJSON(parkings));
  }, [parkings]);

  // Timpark data may arrive after the map has loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !timpark || map.getSource(TIMPARK_SOURCE)) return;
    addTimparkLayers(map, timpark, PARKINGS_LAYER);
  }, [timpark]);

  // Destination marker: filled pin for a known position, hollow pin for an approximate one.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !destination?.location) return;
    const { lng, lat } = destination.location;
    const marker = new maplibregl.Marker({
      element: destinationMarkerElement(destination.precision !== 'exact' && destination.precision !== 'street'),
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
  }, [destination, attempt]);

  return <div className="absolute inset-0">
    <div ref={containerRef} className="absolute inset-0" role="region" aria-label="Harta Timișoarei" />
    {mapError && <div role="alert" className="absolute left-1/2 top-1/3 z-10 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-card border border-border bg-surface p-5 shadow-xl">
      <h1 className="text-base font-semibold">Harta este temporar indisponibilă</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{mapError}</p>
      <button className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg" onClick={() => setAttempt(a => a + 1)}>Reîncarcă harta</button>
    </div>}
  </div>;
}
