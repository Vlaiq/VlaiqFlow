import { describe, expect, it, vi, afterEach } from 'vitest';
import { ActiveJourneyContext, CompleteJourneyRequest } from '@vlaiq/shared';
import { activeJourney } from '../../../../shared/test-fixtures/completeJourney';
import { plannedActivity, carNavigationHref, skippedParkingNotes } from './journeyPresentation';
import { fetchCompleteJourneys } from './useCompleteJourneys';
import { journeyFeatures } from '../map/journeyLayers';
const destination = { id: 'd', name: 'Destinație de test' } as import('@vlaiq/shared').Destination;
afterEach(() => vi.unstubAllGlobals());
describe('validated journey presentation', () => {
  it('hands planned walking/cycling context to Motion with provenance, without granting rewards or GPS', () => {
    for (const mode of ['walk', 'cycle'] as const) {
      const context = plannedActivity(activeJourney(mode), destination)!;
      expect(ActiveJourneyContext.parse(context).mode).toBe(mode);
      expect(context.distance).toBe(800);
      expect(context.source).toContain('SYNTHETIC');
      expect(context).not.toHaveProperty('coins');
      expect(context).not.toHaveProperty('samples');
    }
  });
  it('preserves exact geometry in separate features and emphasizes the selected leg only', () => {
    const j = activeJourney('cycle');
    const features = journeyFeatures(j, 'leg-cycle').features;
    expect(features[0]?.geometry.coordinates).toEqual(
      j.legs[0]?.type !== 'parking' ? j.legs[0]?.route.geometry : [],
    );
    expect(features[0]?.properties).toMatchObject({ mode: 'cycle', emphasized: true });
    expect(journeyFeatures(j, 'other').features[0]?.properties?.emphasized).toBe(false);
    expect(journeyFeatures(null, null).features).toEqual([]);
    expect(carNavigationHref(j)).toBeNull();
  });
  it('rejects bad server contracts and exposes a useful unavailable error', async () => {
    const input = CompleteJourneyRequest.parse({
      origin: [21.2, 45.75],
      destination: [21.22, 45.76],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(fetchCompleteJourneys(input, new AbortController().signal)).rejects.toThrow(
      'verifica',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Furnizor indisponibil' } }), {
          status: 503,
        }),
      ),
    );
    await expect(fetchCompleteJourneys(input, new AbortController().signal)).rejects.toThrow(
      'Furnizor indisponibil',
    );
  });
});
describe('parkings without a complete journey', () => {
  it('explains each skipped SmartMatch rank with the reason the backend gave', () => {
    const notes = skippedParkingNotes(
      [
        { rank: 1, reason: 'customers_only' },
        { rank: 2, reason: 'customers_only' },
        { rank: 4, reason: 'walk_unavailable' },
      ],
      12,
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('P1, P2 sunt doar pentru clienți');
    expect(notes[1]).toContain('P4 nu apare aici');
    expect(notes[1]).toContain('12 min');
  });
  it('says nothing when every candidate has a journey', () => {
    expect(skippedParkingNotes([], 12)).toEqual([]);
  });
});
