import { useEffect, useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const parkingsRef = useRef(parkings);
  parkingsRef.current = parkings;

  // Create the map once; tear it down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [TIMISOARA_CENTER.lng, TIMISOARA_CENTER.lat],
      zoom: 13.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      'bottom-right',
    );

    map.on('load', () => {
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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push new data straight into MapLibre instead of re-rendering React.
  useEffect(() => {
    const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(toGeoJSON(parkings));
  }, [parkings]);

  return <div ref={containerRef} className="absolute inset-0" role="region" aria-label="Harta Timișoarei" />;
}
