import { Router } from 'express';
import { AvailabilityExplainRequest, MAX_STOP_SPREAD_M, RecommendationRequest } from '@vlaiq/shared';
import { tourSpreadM } from '../engines/smartmatch/tour';
import { recommendParkings } from '../services/parkingRecommendations';
import { availabilityModel, explainAvailability } from '../engines/smartmatch';
export const recommendationsRouter = Router();
const inArea = ([lng, lat]: [number, number]) =>
  lng >= 21 && lng <= 21.5 && lat >= 45.6 && lat <= 45.9;
// The availability rule model and its parameters, for the public 'Date parcări' page.
recommendationsRouter.get('/model', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(availabilityModel());
});
// One calculation step by step (no personal data: a profile, a time and a capacity).
recommendationsRouter.get('/model/explain', (req, res) => {
  const input = AvailabilityExplainRequest.safeParse(req.query);
  if (!input.success)
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Parametri invalizi pentru calcul.' } });
  const { profile, at, capacity } = input.data;
  res.json(explainAvailability(profile, new Date(at), capacity ?? null));
});
recommendationsRouter.post('/', async (req, res) => {
  const input = RecommendationRequest.safeParse(req.body);
  if (!input.success)
    return res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'Cerere invalidă pentru recomandare.' } });
  if (!inArea(input.data.destination) || (input.data.origin && !inArea(input.data.origin)))
    return res.status(400).json({
      error: {
        code: 'OUTSIDE_AREA',
        message: 'Recomandările sunt disponibile în zona Timișoara.',
      },
    });
  if (input.data.stops.some((s) => !inArea(s.coordinate)))
    return res.status(400).json({ error: { code: 'OUTSIDE_AREA', message: 'Opririle trebuie să fie în zona Timișoara.' } });
  if (tourSpreadM(input.data.destination, input.data.stops.map((s) => s.coordinate)) > MAX_STOP_SPREAD_M)
    return res.status(400).json({
      error: {
        code: 'STOPS_TOO_FAR',
        message: `Opririle sunt prea departe una de alta pentru o singură parcare (peste ${(MAX_STOP_SPREAD_M / 1000).toLocaleString('ro-RO')} km). Planifică-le separat.`,
      },
    });
  try {
    res.json(await recommendParkings(input.data));
  } catch {
    res
      .status(503)
      .json({ error: { code: 'UNAVAILABLE', message: 'Recomandările nu sunt disponibile acum.' } });
  }
});
