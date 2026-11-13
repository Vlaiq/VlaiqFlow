import type { StyleSpecification } from 'maplibre-gl';
import { TimparkSnapshot, type TimparkSnapshot as Snapshot } from '@vlaiq/shared';
import localTimpark from '../../../../shared/src/data/timpark.json';

/** Real municipal geometries only. A partial local map, never a fabricated street grid. */
export function localFallbackStyle(
  theme: 'dark' | 'light',
  snapshot?: Snapshot | null,
): StyleSpecification {
  const data = snapshot ?? TimparkSnapshot.parse(localTimpark);
  return {
    version: 8,
    sources: {
      'local-municipal': {
        type: 'geojson',
        attribution: 'Date Timpark · Primăria Municipiului Timișoara · hartă locală parțială',
        data: {
          type: 'FeatureCollection',
          features: data.data.features.map((f) => ({
            type: 'Feature',
            properties: { name: f.name, kind: f.kind },
            geometry:
              f.kind === 'street'
                ? { type: 'LineString', coordinates: f.coordinates }
                : { type: 'Polygon', coordinates: [f.coordinates] },
          })),
        },
      },
    },
    layers: [
      {
        id: 'local-background',
        type: 'background',
        paint: { 'background-color': theme === 'dark' ? '#12261d' : '#e8eee6' },
      },
      {
        id: 'local-zones',
        type: 'fill',
        source: 'local-municipal',
        filter: ['==', ['get', 'kind'], 'zone'],
        paint: { 'fill-color': theme === 'dark' ? '#234331' : '#d0dfce', 'fill-opacity': 0.55 },
      },
      {
        id: 'local-parking-areas',
        type: 'fill',
        source: 'local-municipal',
        filter: ['==', ['get', 'kind'], 'lot'],
        paint: { 'fill-color': theme === 'dark' ? '#344e3c' : '#bbd1bd', 'fill-opacity': 0.8 },
      },
      {
        id: 'local-road-casing',
        type: 'line',
        source: 'local-municipal',
        filter: ['==', ['get', 'kind'], 'street'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': theme === 'dark' ? '#354c41' : '#b0c3b4',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 8],
        },
      },
      {
        id: 'local-roads',
        type: 'line',
        source: 'local-municipal',
        filter: ['==', ['get', 'kind'], 'street'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': theme === 'dark' ? '#708a78' : '#fafcf8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 5],
        },
      },
    ],
  };
}
