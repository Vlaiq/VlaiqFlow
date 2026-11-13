import { Router } from 'express';
import { RouteRequest } from '@vlaiq/shared';
import { getRoutes } from '../services/routing';

export const navigationRouter = Router();
navigationRouter.post('/routes', async (req, res) => {
  const input = RouteRequest.safeParse(req.body);
  if (!input.success)
    return res
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'Coordonate invalide.' } });
  const { origin, destination } = input.data;
  // City prototype: avoid unlimited long-distance requests to public providers.
  if (
    [origin, destination].some(([lng, lat]) => lng < 21 || lng > 21.5 || lat < 45.6 || lat > 45.9)
  ) {
    return res
      .status(400)
      .json({
        error: { code: 'OUTSIDE_AREA', message: 'Navigația este disponibilă în zona Timișoara.' },
      });
  }
  try {
    res.json(await getRoutes(origin, destination));
  } catch {
    res
      .status(503)
      .json({
        error: {
          code: 'UNAVAILABLE',
          message:
            'Serviciul de rutare nu este disponibil. Verifică accesul la rețea și încearcă din nou.',
        },
      });
  }
});
