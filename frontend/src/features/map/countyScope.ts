import type maplibregl from 'maplibre-gl';
import { TIMIS_COUNTY, TIMIS_COUNTY_BOUNDS, isInTimisCounty } from '../../../../shared/src/county';

export { TIMIS_COUNTY, TIMIS_COUNTY_BOUNDS, isInTimisCounty };
export const COUNTY_MASK_LAYER = 'flow-county-mask';

/** Real polygon mask; the camera rectangle is only a guardrail, never the visible boundary. */
export function addCountyScope(map: maplibregl.Map, theme: 'dark' | 'light' = 'dark') {
  if (map.getSource('flow-county')) return;
  map.addSource('flow-county', {
    type: 'geojson',
    data: TIMIS_COUNTY,
    attribution: 'Limită județ: Natural Earth · public domain · generalizată',
  });
  const outer = TIMIS_COUNTY.geometry.coordinates[0]!;
  const hole = [...outer].reverse();
  map.addSource('flow-outside-county', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
          hole,
        ],
      },
    },
  });
  map.addLayer({
    id: COUNTY_MASK_LAYER,
    type: 'fill',
    source: 'flow-outside-county',
    paint: {
      'fill-color': theme === 'light' ? '#edf3ec' : '#0b1510',
      'fill-opacity': 0.88,
    },
  });
  map.addLayer({
    id: 'flow-county-boundary',
    type: 'line',
    source: 'flow-county',
    paint: {
      'line-color': theme === 'light' ? '#167d50' : '#8ec5a2',
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.8, 13, 2.5],
      'line-opacity': 0.9,
      'line-dasharray': [4, 2],
    },
  });
}

export function fitTimisCounty(
  map: maplibregl.Map,
  padding: maplibregl.PaddingOptions | number = 60,
) {
  map.fitBounds(TIMIS_COUNTY_BOUNDS, {
    padding,
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
    pitch: 0,
    bearing: 0,
  });
}

/** Native map control stays outside the geographic mask and works by keyboard. */
export class CountyControl implements maplibregl.IControl {
  private element?: HTMLDivElement;
  constructor(
    private padding: () => maplibregl.PaddingOptions | number = () => 60,
    private bottomOffset = 0,
  ) {}
  onAdd(map: maplibregl.Map) {
    const el = document.createElement('div');
    el.className = 'maplibregl-ctrl flow-county-control';
    if (this.bottomOffset) el.style.marginBottom = `${this.bottomOffset}px`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Vezi județul Timiș';
    button.setAttribute('aria-label', 'Vezi județul Timiș');
    button.title = 'Limită cartografică generalizată · Natural Earth, public domain';
    button.style.cssText =
      'min-height:44px;padding:8px 12px;background:rgb(var(--surface));color:rgb(var(--text));border:1px solid rgb(var(--border));border-radius:12px;font:500 11px/1.4 system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px #0002';
    button.addEventListener('click', () => fitTimisCounty(map, this.padding()));
    el.append(button);
    this.element = el;
    return el;
  }
  onRemove() {
    this.element?.remove();
  }
}
