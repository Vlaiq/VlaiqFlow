import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ChatInput, CosmeticInput, MissionAnswer, MissionInput, type BuddyIdentity, type BuddyCosmeticsRepository, type BuddyProgressRepository } from '../../../../shared/src/buddy/contracts';
import type { BuddyService } from './service';

interface Dependencies {
  /** Must be the host's strict issuer/audience JWT middleware, supplied after handoff. */
  authenticate?: RequestHandler;
  identity?: (req: Request) => BuddyIdentity | null;
  service: BuddyService; progress: BuddyProgressRepository; cosmetics?: BuddyCosmeticsRepository;
  synthesize?: (text: string, signal: AbortSignal) => Promise<Uint8Array>;
}
/** Not mounted by this branch. Missing verified-auth adapters always fail closed. */
export function createBuddyRouter(deps: Dependencies) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(deps.authenticate ?? ((_req, res) => { res.status(503).json({ error: { code: 'AUTH_NOT_INTEGRATED', message: 'Buddy necesită integrarea verificată a contului.' } }); }));
  router.use((req, res, next) => {
    const id = deps.identity?.(req);
    if (!id?.issuer || !id.subject) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Autentificare necesară.' } }); return; }
    res.locals.buddyIdentity = id;
    next();
  });
  router.use(rateLimit({ windowMs: 60_000, limit: 24, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (_req, res) => JSON.stringify([res.locals.buddyIdentity.issuer, res.locals.buddyIdentity.subject]) }));
  const handle = (fn: (req: Request, id: BuddyIdentity, signal: AbortSignal) => Promise<unknown> | unknown): RequestHandler => async (req, res) => {
    const controller = new AbortController();
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const body = await fn(req, res.locals.buddyIdentity, controller.signal);
      if (!controller.signal.aborted) {
        if (body instanceof Uint8Array) res.type('audio/mpeg').send(Buffer.from(body));
        else res.json(body);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      const schemaError = e instanceof Error && e.name === 'ZodError';
      const status = schemaError ? 400 : typeof e === 'object' && e && 'status' in e && [400, 403, 409].includes(Number(e.status)) ? Number(e.status) : 503;
      res.status(status).json({ error: { code: status === 400 ? 'INVALID_INPUT' : status === 503 ? 'UNAVAILABLE' : 'CONFLICT', message: status === 503 ? 'Buddy nu poate răspunde acum. Încearcă din nou.' : schemaError ? 'Cererea nu este validă.' : (e as Error).message } });
    } finally { res.off('close', close); }
  };
  router.get('/state', handle((_req, id) => deps.progress.load(id)));
  router.post('/chat', handle((req, id, signal) => deps.service.chat(id, ChatInput.parse(req.body), signal)));
  router.post('/missions/start', handle((req, id) => { const p = MissionInput.parse(req.body); return deps.service.start(id, p.missionId, p.difficulty); }));
  router.post('/missions/answer', handle((req, id) => { const p = MissionAnswer.parse(req.body); return deps.service.answer(id, p.instanceId, p.choice); }));
  router.post('/missions/hint', handle((_req, id) => deps.service.hint(id)));
  router.post('/session/end', handle((_req, id) => { deps.service.forget(id); return { ended: true }; }));
  router.post('/cosmetics/purchase', handle((req, id) => {
    if (!deps.cosmetics) throw new Error('Cosmetics not integrated');
    return deps.cosmetics.purchase(id, CosmeticInput.parse(req.body).cosmeticId);
  }));
  router.post('/cosmetics/equip', handle((req, id) => {
    if (!deps.cosmetics) throw new Error('Cosmetics not integrated');
    return deps.cosmetics.equip(id, CosmeticInput.parse(req.body).cosmeticId);
  }));
  router.post('/speech', handle((_req, id, signal) => {
    if (!deps.synthesize) throw new Error('Buddy voice not configured');
    return deps.synthesize(deps.service.spokenReply(id), signal);
  }));
  return router;
}
