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
  // Revalidate every time: Express sends an ETag, so unchanged data costs a tiny 304, and refreshed data shows at once.
  res.set('Cache-Control', 'no-cache');
  res.json(snapshot);
});
