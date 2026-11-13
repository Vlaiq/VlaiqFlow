import { Router } from 'express';
import type { ApiError } from '@vlaiq/shared';
import { cityData } from '../services/cityData';

export const cityRouter = Router();

cityRouter.get('/parking-zones', (_req, res) => {
  const snapshot = cityData.timpark();
  if (!snapshot) {
    const body: ApiError = { error: { code: 'UNAVAILABLE', message: 'Timpark data not loaded. Run `pnpm data:city`.' } };
    return res.status(503).json(body);
  }
  // The data changes rarely; let browsers and proxies keep it for an hour.
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(snapshot);
});
