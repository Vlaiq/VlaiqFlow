import { describe, expect, it } from 'vitest';
import type { Destination } from '@vlaiq/shared';
import { navigationHref, placeFromUrl } from './places';

const iulius: Destination = {
  id: 'place-osm-way-24042485',
  kind: 'place',
  name: 'Iulius Mall',
  nameEn: null,
  detail: 'Antene',
  category: 'mall',
  aliases: [],
  location: { lat: 45.766664, lng: 21.22819 },
  precision: 'exact',
  locationSource: 'OpenStreetMap',
};

describe('Explore → navigation hand-over', () => {
  it('round-trips a destination through the URL', () => {
    const href = navigationHref(iulius)!;
    expect(href.startsWith('/navigation?')).toBe(true);
    const place = placeFromUrl(href.slice(href.indexOf('?')));
    expect(place).toMatchObject({ name: 'Iulius Mall', area: 'Antene · Timișoara', coordinate: [21.22819, 45.766664] });
  });

  it('gives no link for a destination without a position', () => {
    expect(navigationHref({ ...iulius, location: null, precision: 'none' })).toBeNull();
  });

  it('rejects coordinates outside the routing area and malformed input', () => {
    expect(placeFromUrl('?to=26.1,44.4&name=Bucuresti')).toBeNull();
    expect(placeFromUrl('?to=abc,def&name=X')).toBeNull();
    expect(placeFromUrl('?to=21.22,45.76')).toBeNull(); // no name
    expect(placeFromUrl('')).toBeNull();
  });
});
