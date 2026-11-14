import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MotionMode, MotionSubmission } from '@vlaiq/shared';
import { MotionStore } from '../services/motionStore';
import { config } from '../config';

export const motionRouter = Router();
let store: MotionStore | undefined;
const getStore = () =>
  (store ??= new MotionStore(fileURLToPath(new URL('../../.data/motion.json', import.meta.url))));
motionRouter.use((req, res, next) => {
  // Same-origin cookie-backed browser wallet; not a cross-device account.
  const origin = req.get('origin');
  if (origin && ![`${req.protocol}://${req.get('host')}`, ...config.corsOrigins].includes(origin)) {
    res.status(403).json({ error: { message: 'Origine nepermisă.' } });
    return;
  }
  const token =
    req.headers.cookie?.match(/(?:^|;\s*)motion_session=([a-f0-9]{64})(?:;|$)/)?.[1] ??
    randomBytes(32).toString('hex');
  res.cookie('motion_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/api/motion',
    maxAge: 31536000000,
  });
  res.locals.motionOwner = createHash('sha256').update(token).digest('hex');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
motionRouter.get('/wallet', (_req, res, next) => {
  try {
    res.json(getStore().wallet(res.locals.motionOwner));
  } catch (e) {
    next(e);
  }
});
// Right to erasure (GDPR art. 17): deletes this browser wallet and forgets the cookie.
motionRouter.delete('/wallet', (_req, res, next) => {
  try {
    const erased = getStore().erase(res.locals.motionOwner);
    res.removeHeader('Set-Cookie');
    res.clearCookie('motion_session', { httpOnly: true, sameSite: 'strict', path: '/api/motion' });
    res.json({ erased });
  } catch (e) {
    next(e);
  }
});
motionRouter.post('/start', (req, res, next) => {
  const input = z.object({ mode: MotionMode }).strict().safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: { message: 'Tip de activitate invalid.' } });
    return;
  }
  try {
    res.json(getStore().start(res.locals.motionOwner, input.data.mode));
  } catch (e) {
    next(e);
  }
});
motionRouter.post('/finish', (req, res) => {
  const input = MotionSubmission.safeParse(req.body);
  if (!input.success) {
    res
      .status(400)
      .json({
        error: { message: 'Observații GPS invalide. Recompensa nu poate fi aleasă de client.' },
      });
    return;
  }
  try {
    res.json(getStore().finish(res.locals.motionOwner, input.data.id, input.data.points));
  } catch {
    res
      .status(409)
      .json({
        error: {
          message: 'Activitatea nu poate fi finalizată. Verifică sesiunea și încearcă din nou.',
        },
      });
  }
});
motionRouter.post('/cancel', (req, res) => {
  const input = z.object({ id: z.string().uuid() }).strict().safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: { message: 'Activitate invalidă.' } });
    return;
  }
  try {
    getStore().cancel(res.locals.motionOwner, input.data.id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: { message: 'Activitatea nu poate fi anulată.' } });
  }
});
