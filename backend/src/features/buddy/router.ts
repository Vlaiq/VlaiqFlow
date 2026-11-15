import { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import {
  ChatInput,
  BuddyEmptyInput,
  CosmeticInput,
  MissionAnswer,
  MissionInput,
  type BuddyIdentity,
  type BuddyCosmeticsRepository,
  type BuddyProgressRepository,
} from '../../../../shared/src/buddy/contracts';
import type { BuddyService } from './service';

interface Dependencies {
  /** Must be the host's strict issuer/audience JWT middleware, supplied after handoff. */
  authenticate?: RequestHandler;
  identity?: (req: Request, res: Response) => BuddyIdentity | null;
  service: BuddyService;
  progress: BuddyProgressRepository;
  cosmetics?: BuddyCosmeticsRepository;
  synthesize?: (text: string, signal: AbortSignal) => Promise<Uint8Array>;
  voiceConsent?: (identity: BuddyIdentity) => Promise<boolean>;
}
/** Composable private router. Missing verified-auth adapters always fail closed. */
export function createBuddyRouter(deps: Dependencies) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(
    deps.authenticate ??
      ((_req, res) => {
        res.status(503).json({
          error: {
            code: 'AUTH_NOT_INTEGRATED',
            message: 'Buddy necesită integrarea verificată a contului.',
          },
        });
      }),
  );
  router.use((req, res, next) => {
    const id = deps.identity?.(req, res);
    if (!id?.issuer || !id.subject) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Autentificare necesară.' } });
      return;
    }
    res.locals.buddyIdentity = id;
    next();
  });
  const limit = (count: number) =>
    rateLimit({
      windowMs: 60_000,
      limit: count,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Ai ajuns la limita de cereri. Reîncearcă într-un minut.',
        },
      },
      keyGenerator: (_req, res) =>
        JSON.stringify([res.locals.buddyIdentity.issuer, res.locals.buddyIdentity.subject]),
    });
  router.use(limit(120));
  router.use('/chat', limit(12));
  router.use('/speech', limit(6));
  const handle =
    (
      fn: (req: Request, id: BuddyIdentity, signal: AbortSignal) => Promise<unknown> | unknown,
    ): RequestHandler =>
    async (req, res) => {
      const controller = new AbortController();
      const close = () => {
        if (!res.writableEnded) controller.abort();
      };
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
        const status = schemaError
          ? 400
          : typeof e === 'object' &&
              e &&
              'status' in e &&
              [400, 403, 409].includes(Number(e.status))
            ? Number(e.status)
            : 503;
        res.status(status).json({
          error: {
            code: status === 400 ? 'INVALID_INPUT' : status === 503 ? 'UNAVAILABLE' : 'CONFLICT',
            message:
              status === 503
                ? typeof e === 'object' &&
                  e &&
                  'publicMessage' in e &&
                  typeof e.publicMessage === 'string'
                  ? e.publicMessage
                  : 'Buddy nu poate răspunde acum. Încearcă din nou.'
                : schemaError
                  ? 'Cererea nu este validă.'
                  : (e as Error).message,
          },
        });
      } finally {
        res.off('close', close);
      }
    };
  router.get(
    '/state',
    handle(async (_req, id) => ({
      ...(await deps.progress.load(id)),
      voiceAvailable: Boolean(deps.synthesize && (await deps.voiceConsent?.(id))),
    })),
  );
  router.post(
    '/chat',
    handle((req, id, signal) => deps.service.chat(id, ChatInput.parse(req.body), signal)),
  );
  router.post(
    '/missions/start',
    handle((req, id) => {
      const p = MissionInput.parse(req.body);
      return deps.service.start(id, p.missionId, p.difficulty);
    }),
  );
  router.post(
    '/missions/answer',
    handle((req, id) => {
      const p = MissionAnswer.parse(req.body);
      return deps.service.answer(id, p.instanceId, p.choice);
    }),
  );
  router.post(
    '/missions/hint',
    handle((req, id) => {
      BuddyEmptyInput.parse(req.body);
      return deps.service.hint(id);
    }),
  );
  router.post(
    '/session/end',
    handle((req, id) => {
      BuddyEmptyInput.parse(req.body);
      deps.service.forget(id);
      return { ended: true };
    }),
  );
  router.post(
    '/cosmetics/purchase',
    handle((req, id) => {
      if (!deps.cosmetics) throw new Error('Cosmetics not integrated');
      return deps.cosmetics.purchase(id, CosmeticInput.parse(req.body).cosmeticId);
    }),
  );
  router.post(
    '/cosmetics/equip',
    handle((req, id) => {
      if (!deps.cosmetics) throw new Error('Cosmetics not integrated');
      return deps.cosmetics.equip(id, CosmeticInput.parse(req.body).cosmeticId);
    }),
  );
  router.post(
    '/speech',
    handle(async (req, id, signal) => {
      BuddyEmptyInput.parse(req.body);
      if (!deps.synthesize) throw new Error('Buddy voice not configured');
      if (!(await deps.voiceConsent?.(id)))
        throw Object.assign(new Error('Activează acordul pentru voce în setările contului.'), {
          status: 403,
        });
      return deps.synthesize(deps.service.spokenReply(id), signal);
    }),
  );
  return router;
}
