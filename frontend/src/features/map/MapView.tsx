import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { TIMISOARA_CENTER, type Parking } from '@vlaiq/shared';

// OpenFreeMap: free vector tiles, no API key. Its style carries the OSM/OpenMapTiles attribution.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const SOURCE_ID = 'parkings';

function toGeoJSON(parkings: Parking[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: parkings.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, quality: p.availability.quality },
    })),
  };
}

interface Props {
  parkings: Parking[];
}

export function MapView({ parkings }: Props) {
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const parkingsRef = useRef(parkings);
  parkingsRef.current = parkings;

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
      zoom: 13.5,
      attributionControl: { compact: true },
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
    map.on('error', () => {
      setMapError('Serviciul de hărți nu este disponibil. Poți reîncerca încărcarea.');
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      'bottom-right',
    );

    map.on('load', () => {
      window.clearTimeout(timeout);
      setMapError(null);
      map.addSource(SOURCE_ID, { type: 'geojson', data: toGeoJSON(parkingsRef.current) });
      map.addLayer({
        id: 'parkings-circle',
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 8],
          'circle-color': '#22C55E',
          'circle-stroke-color': '#101916',
          'circle-stroke-width': 1.5,
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, offset: 10 });
      map.on('click', 'parkings-circle', (e) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== 'Point') return;
        const name = String(f.properties?.name ?? '');
        // textContent avoids injecting OSM-provided strings as HTML.
        const el = document.createElement('div');
        el.style.color = '#101916';
        el.textContent = `${name} · Disponibilitate: necunoscută`;
        popup.setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(el).addTo(map);
      });
      map.on('mouseenter', 'parkings-circle', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'parkings-circle', () => (map.getCanvas().style.cursor = ''));
    });

    return () => {
      window.clearTimeout(timeout);
      map.remove();
      mapRef.current = null;
    };
  }, [attempt]);

  // Push new data straight into MapLibre instead of re-rendering React.
  useEffect(() => {
    const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(toGeoJSON(parkings));
  }, [parkings]);

  return <div className="absolute inset-0">
    <div ref={containerRef} className="absolute inset-0" role="region" aria-label="Harta Timișoarei" />
    {mapError && <div role="alert" className="absolute left-1/2 top-1/3 z-10 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-card border border-border bg-surface p-5 shadow-xl">
      <h1 className="text-base font-semibold">Harta este temporar indisponibilă</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{mapError}</p>
      <button className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg" onClick={() => setAttempt(a => a + 1)}>Reîncarcă harta</button>
    </div>}
  </div>;
}
