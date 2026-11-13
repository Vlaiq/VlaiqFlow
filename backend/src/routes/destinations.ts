import { Router } from 'express';
import type { ApiError } from '@vlaiq/shared';
import { cityData } from '../services/cityData';

export const destinationsRouter = Router();

// The full list is small (~1,400 entries); the browser searches it locally, so typing costs no requests.
destinationsRouter.get('/', (_req, res) => {
  const body = cityData.destinations();
  if (!body) {
    const err: ApiError = { error: { code: 'UNAVAILABLE', message: 'Destination data not loaded. Run `pnpm data:city`.' } };
    return res.status(503).json(err);
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(body);
});
