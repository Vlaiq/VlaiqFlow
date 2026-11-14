import { Router } from 'express';
import type { ApiError } from '@vlaiq/shared';
import { parkingStore } from '../services/parkingStore';
import { parkingRegister } from '../services/parkingRegister';

export const parkingsRouter = Router();

// TODO(P0): filter by ?near=lat,lng&radius= once the recommendation flow needs it (spec §9).
parkingsRouter.get('/', (_req, res) => {
  res.json(parkingStore.all());
});

// Every recommendable parking with each value's quality and source (the 'Date parcări' page).
parkingsRouter.get('/register', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(parkingRegister());
});

parkingsRouter.get('/:id', (req, res) => {
  const parking = parkingStore.byId(req.params.id);
  if (!parking) {
    const body: ApiError = { error: { code: 'NOT_FOUND', message: `Parking ${req.params.id} not found` } };
    return res.status(404).json(body);
  }
  res.json(parking);
});
