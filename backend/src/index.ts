import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { ApiError } from '@vlaiq/shared';
import { config } from './config';
import { healthRouter } from './routes/health';
import { parkingsRouter } from './routes/parkings';
import { navigationRouter } from './routes/navigation';
import { cityRouter } from './routes/city';
import { destinationsRouter } from './routes/destinations';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Caddy in production
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));

app.use('/api/health', healthRouter);
app.use('/api/parkings', parkingsRouter);
app.use('/api/navigation', navigationRouter);
app.use('/api/city', cityRouter);
app.use('/api/destinations', destinationsRouter);

app.use('/api', (_req, res) => {
  const body: ApiError = { error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } };
  res.status(404).json(body);
});

// Never leak stack traces to clients.
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const body: ApiError = { error: { code: 'UNAVAILABLE', message: 'Internal error' } };
  res.status(500).json(body);
};
app.use(onError);

app.listen(config.port, () => {
  console.log(`VLAIQ backend listening on http://localhost:${config.port}`);
});
