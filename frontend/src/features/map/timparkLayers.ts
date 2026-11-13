import type maplibregl from 'maplibre-gl';
import {
  KIND_LABEL_RO,
  TARIFF_HEX,
  TARIFF_LABEL_RO,
  featureQuality,
  formatAmountRo,
  hourlyPrice,
  type TimparkSnapshot,
} from '@vlaiq/shared';

export const TIMPARK_SOURCE = 'timpark';
/** Streets and lots: picked first, with a tap tolerance. */
export const TIMPARK_DETAIL_LAYERS = ['timpark-streets', 'timpark-lots-fill'];
export const TIMPARK_CLICKABLE_LAYERS = [...TIMPARK_DETAIL_LAYERS, 'timpark-zones-fill'];

type Props = { id: string; kind: string; tariff: string; color: string };

/** City data → GeoJSON. Zones and lots are closed rings; streets are lines. Coordinates are [lng, lat]. */
export function timparkToGeoJSON(snapshot: TimparkSnapshot): GeoJSON.FeatureCollection<GeoJSON.Geometry, Props> {
  return {
    type: 'FeatureCollection',
    features: snapshot.data.features.map((f) => ({
      type: 'Feature',
      id: f.id,
      geometry:
        f.kind === 'street'
          ? { type: 'LineString', coordinates: f.coordinates }
          : { type: 'Polygon', coordinates: [f.coordinates] },
      properties: { id: f.id, kind: f.kind, tariff: f.tariff, color: TARIFF_HEX[f.tariff] },
    })),
  };
}

/** Adds the Timpark layers below `beforeId` (the parking markers stay on top). */
export function addTimparkLayers(map: maplibregl.Map, snapshot: TimparkSnapshot, beforeId?: string) {
  map.addSource(TIMPARK_SOURCE, { type: 'geojson', data: timparkToGeoJSON(snapshot) });
  const color: maplibregl.ExpressionSpecification = ['get', 'color'];

  map.addLayer(
    {
      id: 'timpark-zones-fill',
      type: 'fill',
      source: TIMPARK_SOURCE,
      filter: ['==', ['get', 'kind'], 'zone'],
      paint: { 'fill-color': color, 'fill-opacity': 0.1 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'timpark-zones-line',
      type: 'line',
      source: TIMPARK_SOURCE,
      filter: ['==', ['get', 'kind'], 'zone'],
      paint: { 'line-color': color, 'line-opacity': 0.5, 'line-width': 1 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'timpark-lots-fill',
      type: 'fill',
      source: TIMPARK_SOURCE,
      filter: ['==', ['get', 'kind'], 'lot'],
      paint: { 'fill-color': color, 'fill-opacity': 0.55, 'fill-outline-color': '#F2F7F4' },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'timpark-streets',
      type: 'line',
      source: TIMPARK_SOURCE,
      filter: ['==', ['get', 'kind'], 'street'],
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 5],
        'line-opacity': 0.9,
      },
    },
    beforeId,
  );
}

/** Popup content built with DOM nodes, so names from the data are never injected as HTML. */
export function timparkPopupContent(snapshot: TimparkSnapshot, featureId: string): HTMLElement | null {
  const f = snapshot.data.features.find((x) => x.id === featureId);
  if (!f) return null;
  const { tariffs } = snapshot.data;
  const price = hourlyPrice(f, tariffs);
  const quality = featureQuality(f) === 'confirmed' ? 'Confirmat de Primărie' : 'Neverificat de Primărie';
  const fetched = new Date(snapshot.fetchedAt).toLocaleDateString('ro-RO');

  const root = document.createElement('div');
  root.className = 'vlaiq-popup';
  const line = (text: string, cls = '') => {
    const el = document.createElement('div');
    if (cls) el.className = cls;
    el.textContent = text;
    root.appendChild(el);
  };

  line(f.name.trim() || `${KIND_LABEL_RO[f.kind]} Timpark (fără nume)`, 'vlaiq-popup-title');
  line(`${KIND_LABEL_RO[f.kind]} · tarif ${TARIFF_LABEL_RO[f.tariff]}`);
  if (price.type === 'hourly') {
    line(`${formatAmountRo(price.amount)} ${price.currency}/oră · cod SMS ${price.smsCode} · număr ${tariffs.smsNumber}`);
  } else {
    line(`Tarif progresiv: ${price.steps.map((s) => formatAmountRo(s.amount)).join(' → ')} ${price.currency}`);
  }
  line('Locuri libere: necunoscut', 'vlaiq-popup-muted');
  line(`${quality} · Sursa: Primăria Timișoara (Timpark), ${fetched}`, 'vlaiq-popup-muted');
  return root;
}
