import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SCHOOL_ZONE_NOTE, SCHOOL_ZONE_SOURCE, SCHOOL_WINDOWS, type ProtectedZone } from '@vlaiq/shared';
import { SchoolZoneCard } from './SchoolZoneCard';

// Synthetic fixture; not a verified institution, route, parking or entrance.
const zone: ProtectedZone = {
  active: true, applied: true, optedOut: false, radiusM: 250,
  schools: [{ id: 'osm-way-1', name: 'Școala de test', kind: 'school', coordinate: [21.23, 45.75],
    distanceM: 30, street: 'Strada de test', osmUrl: 'https://www.openstreetmap.org/way/1' }],
  window: SCHOOL_WINDOWS[0]!, windows: SCHOOL_WINDOWS, inactiveReason: null,
  excluded: 1, insideZone: 1, quality: 'estimated', source: SCHOOL_ZONE_SOURCE, note: SCHOOL_ZONE_NOTE,
};
const render = (patch: Partial<ProtectedZone> = {}) => renderToStaticMarkup(<SchoolZoneCard zone={{ ...zone, ...patch }} onToggle={() => {}} />);

describe('School Shield card semantics and honest states (server rendering)', () => {
  it('identifies the school, active state, analysis radius, exclusion count and estimate', () => {
    const html = render();
    expect(html).toContain('School Shield');
    expect(html).toContain('Școala de test');
    expect(html).toContain('role="status">Activ');
    expect(html).toContain('250 m / instituție');
    expect(html).toContain('<dt>Parcări excluse</dt><dd>1</dd>');
    expect(html).toContain('Estimat');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Oprește recomandarea pentru acest drum');
  });

  it('explains an inactive rule and keeps the opt-out available before a window starts', () => {
    const html = render({ active: false, applied: false, excluded: 0, window: null, inactiveReason: 'În weekend zona nu este activă.' });
    expect(html).toContain('role="status">Inactiv');
    expect(html).toContain('În weekend zona nu este activă.');
    expect(html).toContain('School Shield nu exclude parcări acum.');
    expect(html).toContain('Oprește recomandarea pentru acest drum');
  });

  it('prioritizes opt-out state even outside active hours and offers re-enabling', () => {
    const html = render({ active: false, applied: false, optedOut: true, excluded: 0, window: null });
    expect(html).toContain('Oprit pentru acest drum');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Reactivează recomandarea');
    expect(html).not.toContain('role="status">Inactiv');
  });

  it('discloses source, approximate OSM locations, vacation and legal limits without promising an alternative', () => {
    const html = render({ excluded: 0 });
    expect(html).toContain('Nicio parcare candidată nu a fost exclusă.');
    expect(html).toContain('Excluderea nu garantează o alternativă disponibilă.');
    expect(html).toContain('OpenStreetMap contributors');
    expect(html).toContain('https://www.openstreetmap.org/way/1');
    expect(html).toContain('nu restricție oficială');
    expect(html).toContain('Vacanțele școlare nu sunt incluse');
    expect(html).toContain('centre aproximative');
    expect(html).toContain('Reper OSM: Strada de test');
    expect(html).toContain('Aplicația nu trimite nimic automat.');
    expect(html).toContain('readonly=""');
  });

  it('generates unique IDs and handles missing or unsafe school names', () => {
    const html = renderToStaticMarkup(<>
      <SchoolZoneCard zone={zone} onToggle={() => {}} />
      <SchoolZoneCard zone={{ ...zone, schools: [{ ...zone.schools[0]!, name: '<script>test</script>' }] }} onToggle={() => {}} />
    </>);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('&lt;script&gt;test&lt;/script&gt;');
    expect(html).not.toContain('<script>test</script>');
    expect(render({ schools: [{ ...zone.schools[0]!, name: '  ', kind: 'kindergarten' }] }))
      .toContain('Grădinița (fără nume în OpenStreetMap)');
    expect(render({ schools: [{ ...zone.schools[0]!, name: null }] }))
      .toContain('Școala (fără nume în OpenStreetMap)');
  });
});
