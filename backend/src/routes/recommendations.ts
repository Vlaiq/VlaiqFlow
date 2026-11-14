import { Router } from 'express';
import { RecommendationRequest } from '@vlaiq/shared';
import { recommendParkings } from '../services/parkingRecommendations';
export const recommendationsRouter = Router();
const inArea = ([lng, lat]: [number, number]) =>
  lng >= 21 && lng <= 21.5 && lat >= 45.6 && lat <= 45.9;
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
  try {
    res.json(await recommendParkings(input.data));
  } catch {
    res
      .status(503)
      .json({ error: { code: 'UNAVAILABLE', message: 'Recomandările nu sunt disponibile acum.' } });
  }
});
