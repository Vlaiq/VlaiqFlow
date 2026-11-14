import { Router } from 'express';
import { JourneyComparisonRequest } from '../../../shared/src/schemas/journey';
import { compareJourneys } from '../services/journeys';
import { CompleteJourneyRequest } from '@vlaiq/shared';
import { completeJourneys } from '../services/completeJourneys';

export const journeyRouter = Router();
journeyRouter.post('/complete', async (req, res) => {
  const input = CompleteJourneyRequest.safeParse(req.body);
  if (!input.success)
    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Alege plecarea, destinația și preferințe valide.',
      },
    });
  if (
    [input.data.origin, input.data.destination].some(
      ([lng, lat]) => lng < 21 || lng > 21.5 || lat < 45.6 || lat > 45.9,
    )
  )
    return res.status(400).json({
      error: {
        code: 'OUTSIDE_COVERAGE',
        message:
          'Călătoriile sunt calculate în zona Timișoara. Harta județului nu extinde acoperirea rutării.',
      },
    });
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json(await completeJourneys(input.data));
  } catch {
    res.status(503).json({
      error: {
        code: 'UNAVAILABLE',
        message: 'Planificatorul este ocupat. Reîncearcă în câteva momente.',
      },
    });
  }
});
journeyRouter.post('/compare', async (req, res) => {
  const input = JourneyComparisonRequest.safeParse(req.body);
  if (!input.success)
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Alege puncte de plecare și destinație valide.' },
    });
  const { origin, destination } = input.data;
  // Keep provider service coverage separate from county-wide map visibility.
  if (
    [origin, destination].some(([lng, lat]) => lng < 21 || lng > 21.5 || lat < 45.6 || lat > 45.9)
  ) {
    return res.status(400).json({
      error: {
        code: 'OUTSIDE_COVERAGE',
        message:
          'Comparația rutelor este disponibilă în zona Timișoara. Harta județului nu extinde automat acoperirea furnizorilor.',
      },
    });
  }
  try {
    res.json(await compareJourneys(origin, destination));
  } catch {
    res.status(503).json({
      error: {
        code: 'UNAVAILABLE',
        message: 'Nu am putut compara rutele. Reîncearcă în câteva momente.',
      },
    });
  }
});
