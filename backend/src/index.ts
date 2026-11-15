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
import { recommendationsRouter } from './routes/recommendations';
import { motionRouter } from './routes/motion';
import { identityRouter, teamRouter } from './routes/identity';
import { jwtGuard, requireIdentity } from './middleware/identity';
import { journeyRouter } from './routes/journeys';
import { createJourneyBuddyRouter } from './routes/journeyBuddy';
import { createFlowVoiceRouter } from './routes/flowVoice';
import { createIntegratedBuddyRouter } from './features/buddy/integration';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Caddy in production
app.use(cors({ origin: config.corsOrigins }));
app.use('/api/motion', express.json({ limit: '512kb' }));
app.use(express.json({ limit: '100kb' }));
// Many people can share one IP (venue Wi-Fi, mobile carrier NAT), so the limits are per IP but generous.
// Snapshot reads are served from memory and cost nothing upstream; routing and journeys reach external
// providers (which have their own queue and cache), so they get the tighter limit.
const limited = (limit: number) =>
  rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiError = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Prea multe cereri de la această rețea. Încearcă din nou într-un minut.',
        },
      };
      res.status(429).json(body);
    },
  });
app.use(['/api/health', '/api/parkings', '/api/city', '/api/destinations'], limited(600));
app.use(['/api/recommendations', '/api/journeys', '/api/navigation', '/api/motion'], limited(120));
app.use('/api', limited(600)); // safety net for any route added later

app.use('/api/health', healthRouter);
app.use('/api/parkings', parkingsRouter);
app.use('/api/navigation', navigationRouter);
app.use('/api/city', cityRouter);
app.use('/api/destinations', destinationsRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/me', identityRouter);
app.use('/api/team', teamRouter);
app.use('/api/motion', jwtGuard(), requireIdentity, motionRouter);
app.use('/api/journeys', journeyRouter);
app.use('/api/journey-buddy', limited(60), createJourneyBuddyRouter());
app.use('/api/flow-voice', jwtGuard(), requireIdentity, createFlowVoiceRouter());
app.use('/api/buddy', createIntegratedBuddyRouter());

app.use('/api', (_req, res) => {
  const body: ApiError = {
    error: { code: 'NOT_FOUND', message: 'Unknown endpoint' },
  };
  res.status(404).json(body);
});

// A single-origin deployment keeps private wallet cookies and all deep links working.
// API-only deployments remain possible when the frontend is hosted separately.
const frontendDirectory = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
if (process.env.NODE_ENV === 'production' && existsSync(`${frontendDirectory}/index.html`)) {
  app.use(
    express.static(frontendDirectory, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html') || path.endsWith('service-worker.js'))
          res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(`${frontendDirectory}/index.html`);
  });
}

// Never leak stack traces to clients.
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = [400, 401, 403, 413, 415, 503].includes(err.status) ? err.status : 500;
  // Never log bearer tokens, provider payloads, request bodies or database connection strings.
  if (status === 500)
    console.error('API request failed', {
      code: typeof err.code === 'string' ? err.code : 'INTERNAL',
    });
  res.setHeader('Cache-Control', 'no-store');
  if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
  if (status !== 500) {
    res.status(status).json({
      error: {
        code: status === 401 ? 'UNAUTHORIZED' : 'UNAVAILABLE',
        message:
          status === 401
            ? 'Sesiunea a expirat. Conectează-te din nou.'
            : status === 413
              ? 'Fișierul este prea mare.'
              : status === 503
                ? 'Datele contului nu sunt disponibile. Verifică baza de date și reîncearcă.'
                : 'Cererea nu poate fi procesată.',
      },
    });
    return;
  }
  const body: ApiError = {
    error: { code: 'UNAVAILABLE', message: 'Serviciul nu este disponibil. Reîncearcă.' },
  };
  res.status(500).json(body);
};
app.use(onError);

app.listen(config.port, config.host, () => {
  console.log(`VLAIQ backend listening on http://localhost:${config.port}`);
});
