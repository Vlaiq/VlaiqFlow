import { describe, expect, it } from 'vitest';
import { CompleteJourneyResponse, type CompleteJourney, type Destination } from '@vlaiq/shared';
import { activeJourney } from '../../../../shared/test-fixtures/completeJourney';
import { contractJourney, constrainComparison, resolvePlace } from './journeyContract';
import { FlowError } from './tools';
import { navigationState } from './navigationState';

describe('voice summaries preserve verified mobility facts', () => {
  it('keeps unknown parking cost null, bounded estimated availability and total versus walking duration', () => {
    const walking = activeJourney('walk', 240).legs[0]!;
    const driving = activeJourney('cycle', 780).legs[0]!;
    const journey = {
      id: 'synthetic-car',
      category: 'car_park_walk',
      legs: [driving, walking],
      travelSeconds: { value: 1020 },
      distance: { value: 1800 },
      limitations: ['Parking search time unknown.'],
      parking: {
        name: 'SYNTHETIC PARKING',
        fee: { minorUnits: null, currency: null },
        match: { freeChance: { value: 0.4 } },
      },
    } as unknown as CompleteJourney;
    const result = contractJourney(journey);
    expect(result).toMatchObject({
      duration_minutes: 17,
      walking_minutes: 4,
      parking: { cost: null, availability: { kind: 'rule_model_estimate', score: 0.4 } },
    });
    expect(JSON.stringify(result)).not.toContain('geometry');
    expect(result.reason).toContain('Parking search time unknown');
  });
  it('filters routes against walking limits while preserving valid ranking references and modes', () => {
    const journeys = [activeJourney('walk', 600), activeJourney('cycle', 900)];
    const rank = {
      ids: journeys.map((j) => j.id),
      recommendedId: journeys[0]!.id,
      explanation: 'SYNTHETIC',
    };
    const raw = CompleteJourneyResponse.parse({
      journeys,
      rankings: { fastest: rank, green: rank, balanced: rank },
      unavailable: [],
      opportunity: null,
      calculatedAt: journeys[0]!.calculatedAt,
      coverage: 'SYNTHETIC',
      limitations: [],
    });
    const result = constrainComparison(raw, 5);
    expect(CompleteJourneyResponse.parse(result).journeys.map((j) => j.category)).toEqual([
      'cycle',
    ]);
    expect(result.unavailable).toMatchObject([{ category: 'walk' }]);
    expect(constrainComparison(raw, 0).journeys).toHaveLength(1);
    expect(constrainComparison(raw, 180).journeys).toHaveLength(2);
  });
  it('returns ambiguity candidates that can subsequently be selected by their full label', () => {
    const place = (name: string, detail: string, lng: number): Destination => ({
      id: name,
      name,
      detail,
      nameEn: null,
      aliases: [],
      kind: 'place',
      category: null,
      precision: 'exact',
      location: { lng, lat: 45.75 },
      locationSource: 'SYNTHETIC',
    });
    const places = [place('Biblioteca', 'A', 21.21), place('Biblioteca', 'B', 21.22)];
    try {
      resolvePlace('Biblioteca', places);
      throw new Error('Expected ambiguity');
    } catch (error) {
      expect(error).toBeInstanceOf(FlowError);
      expect((error as FlowError).code).toBe('AMBIGUOUS_LOCATION');
    }
    expect(resolvePlace('Biblioteca · B', places)).toEqual(places[1]);
  });
  it('allows a walking handoff only for a matching parking with a verified walking geometry', () => {
    const walking = activeJourney('walk', 240);
    const journey = {
      ...walking,
      parking: { name: 'SYNTHETIC PARKING', coordinate: walking.origin },
    } as CompleteJourney;
    const release = navigationState.provideJourneys(() => [journey]);
    expect(navigationState.walkingHandoff('SYNTHETIC PARKING', walking.origin)).toMatchObject({
      seconds: 240,
      source: 'SYNTHETIC TEST FIXTURE',
    });
    expect(navigationState.walkingHandoff('Different parking', walking.origin)).toBeNull();
    release();
    expect(navigationState.walkingHandoff('SYNTHETIC PARKING', walking.origin)).toBeNull();
  });
});
