import { Router } from 'express';
import type { HealthResponse } from '@vlaiq/shared';
import { config } from '../config';
import { parkingStore } from '../services/parkingStore';
import { cityData } from '../services/cityData';

export const healthRouter = Router();

const status = (v: unknown): 'configured' | 'not_configured' => (v ? 'configured' : 'not_configured');

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    time: new Date().toISOString(),
    integrations: {
      routing: status(config.orsApiKey),
      gemini: status(config.geminiApiKey),
      tts: status(config.elevenLabsApiKey),
      database: status(config.databaseUrl),
    },
    parkingsLoaded: parkingStore.count(),
    timparkFeatures: cityData.timparkCount(),
  };
  res.json(body);
});
