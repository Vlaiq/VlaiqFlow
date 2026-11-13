import { z } from 'zod';
import type { Coordinate } from '@vlaiq/shared';
import {
  JourneyComparisonResponse,
  JourneyOption,
  findFlowOpportunity,
  journeyPractical,
  type JourneyMode,
} from '../../../shared/src/schemas/journey';
import { config } from '../config';
import { getRoutes } from './routing';

const orsResponse = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({
          type: z.literal('LineString'),
          coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
        }),
        properties: z.object({
          summary: z.object({
            distance: z.number().positive().finite(),
            duration: z.number().positive().finite(),
          }),
          segments: z.array(
            z.object({
              steps: z.array(
                z.object({
                  type: z.number(),
                  name: z.string(),
                  way_points: z.array(z.number().int().nonnegative()).min(1),
                }),
              ),
            }),
          ),
        }),
      }),
    )
    .min(1),
});
const turnTypes: Record<number, [string, string?]> = {
  0: ['turn', 'left'],
  1: ['turn', 'right'],
  2: ['turn', 'sharp left'],
  3: ['turn', 'sharp right'],
  4: ['turn', 'slight left'],
  5: ['turn', 'slight right'],
  6: ['continue'],
  7: ['roundabout'],
  8: ['exit roundabout'],
  9: ['turn', 'uturn'],
  10: ['arrive'],
  11: ['depart'],
  12: ['fork'],
};
const profile = { walk: 'foot-walking', cycle: 'cycling-regular' } as const;
const notes: Record<JourneyMode, string> = {
  drive:
    'Traseu auto direct. Parcarea, timpul de căutare și mersul final se compară separat în SmartMatch.',
  walk: 'Rută pietonală calculată. Distanța și durata sunt estimări ale furnizorului, nu o garanție de accesibilitate.',
  cycle:
    'Rută de bicicletă calculată. Nu confirmă existența unei piste separate sau siguranța întregului traseu.',
};

async function activeRoute(mode: 'walk' | 'cycle', origin: Coordinate, destination: Coordinate) {
  if (!config.orsApiKey) throw new Error('ACTIVE_PROVIDER_NOT_CONFIGURED');
  const response = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile[mode]}/geojson`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: config.orsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [origin, destination], instructions: true }),
    },
  );
  if (!response.ok) throw new Error('ACTIVE_PROVIDER_UNAVAILABLE');
  const feature = orsResponse.parse(await response.json()).features[0]!;
  const route = {
    id: `ors-${mode}`,
    ...feature.properties.summary,
    geometry: feature.geometry.coordinates,
    steps: feature.properties.segments.flatMap((segment) =>
      segment.steps.map((step) => {
        const [type, modifier] = turnTypes[step.type] ?? ['continue'];
        return {
          index: step.way_points[0],
          type,
          modifier,
          road: step.name === '-' ? '' : step.name,
        };
      }),
    ),
    source: `openrouteservice ${profile[mode]} · OpenStreetMap`,
    quality: 'estimated' as const,
  };
  return JourneyOption.parse({
    id: `journey-${mode}`,
    mode,
    route,
    practical: journeyPractical(mode, route.duration),
    note: notes[mode],
  });
}

const cache = new Map<string, { expires: number; value: JourneyComparisonResponse }>();
const pending = new Map<string, Promise<JourneyComparisonResponse>>();

async function calculate(
  origin: Coordinate,
  destination: Coordinate,
): Promise<JourneyComparisonResponse> {
  const jobs = [
    getRoutes(origin, destination).then((result) =>
      JourneyOption.parse({
        id: 'journey-drive',
        mode: 'drive',
        route: result.routes[0],
        practical: true,
        note: notes.drive,
      }),
    ),
    activeRoute('walk', origin, destination),
    activeRoute('cycle', origin, destination),
  ];
  const results = await Promise.allSettled(jobs);
  const modes: JourneyMode[] = ['drive', 'walk', 'cycle'];
  const options: JourneyOption[] = [];
  const unavailable: JourneyComparisonResponse['unavailable'] = [];
  results.forEach((result, index) => {
    const mode = modes[index]!;
    if (result.status === 'fulfilled') options.push(result.value);
    else
      unavailable.push({
        mode,
        reason:
          mode !== 'drive' && !config.orsApiKey
            ? 'Furnizorul de rute pietonale și velo nu este configurat. Nu înlocuim ruta cu o linie dreaptă.'
            : 'Furnizorul nu a returnat o rută validă. Această variantă nu poate fi comparată acum.',
      });
  });
  return JourneyComparisonResponse.parse({
    options,
    unavailable,
    opportunity: findFlowOpportunity(options),
    fetchedAt: new Date().toISOString(),
    coverage:
      'Rutare de prototip în zona Timișoara. Datele Timpark sunt disponibile separat pentru municipiu; nu există trafic live sau orare de transport în această comparație.',
  });
}

export async function compareJourneys(
  origin: Coordinate,
  destination: Coordinate,
): Promise<JourneyComparisonResponse> {
  const key = JSON.stringify(
    [origin, destination].map((point) => point.map((value) => +value.toFixed(5))),
  );
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const running = pending.get(key);
  if (running) return running;
  const job = calculate(origin, destination)
    .then((value) => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      // A failure gets only a short backoff; successful geometry is retained for five minutes.
      cache.set(key, {
        value,
        expires: Date.now() + (value.unavailable.length === 0 ? 300000 : 15000),
      });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
