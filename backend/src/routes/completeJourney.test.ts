import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { CompleteJourneyResponse, type JourneyOption } from '@vlaiq/shared';
import { journeyRouter } from './journeys';
import { completeDependencies } from '../services/completeJourneys';
import {
  origin,
  destination,
  route,
  recommendations,
} from '../../../shared/test-fixtures/completeJourney';
let server: Server, base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/journeys', journeyRouter);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  if (address && typeof address === 'object') base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const post = (body: unknown) =>
  fetch(`${base}/api/journeys/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('POST /api/journeys/complete', () => {
  it('returns validated complete routes and deduplicates simultaneous judges/provider requests', async () => {
    vi.spyOn(completeDependencies, 'activeConfigured').mockReturnValue(true);
    const screen = vi.spyOn(completeDependencies, 'recommend').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return recommendations();
    });
    vi.spyOn(completeDependencies, 'drive').mockImplementation(async (from, to) => ({
      routes: [route(from, to)],
    }));
    vi.spyOn(completeDependencies, 'active').mockImplementation(
      async (mode, from, to): Promise<JourneyOption> => ({
        id: mode,
        mode,
        route: route(from, to),
        practical: true,
        note: 'SYNTHETIC HTTP TEST',
      }),
    );
    const [a, b] = await Promise.all([
      post({ origin, destination }),
      post({ origin, destination, preference: 'green' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.headers.get('cache-control')).toBe('no-store');
    const first = CompleteJourneyResponse.parse(await a.json());
    expect(first.journeys).toHaveLength(3);
    expect(first).toEqual(await b.json());
    expect(screen).toHaveBeenCalledTimes(1);
    expect(first.journeys.find((j) => j.parking)?.legs.map((l) => l.type)).toEqual([
      'drive',
      'parking',
      'walk',
    ]);
    expect(first.journeys.find((j) => j.parking)?.parking?.availability.value).toBeNull();
  });
  it('rejects no origin, unsupported transit, out-of-area/swapped points and malicious reward fields', async () => {
    for (const body of [
      { destination },
      { origin: [45.75, 21.22], destination },
      { origin, destination, modes: ['transit'] },
      { origin, destination, coins: 200 },
    ]) {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect((await r.json()).error.message).toBeTruthy();
    }
  });
});
