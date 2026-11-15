import { Router } from 'express';
import { z } from 'zod';
import { MotionMode, MotionSubmission } from '@vlaiq/shared';
import { identityStore } from '../services/identityStore';
import type { MotionStore } from '../services/motionStore';
export function createMotionRouter(getStore = identityStore) {
  const motionRouter = Router();
  // Only the verified issuer+subject selects the row. No browser cookie or request user ID.
  const route = (
    path: string,
    method: 'get' | 'post' | 'delete',
    schema: z.ZodTypeAny | null,
    action: (s: MotionStore, owner: string, input: any) => unknown,
  ) => {
    motionRouter[method](path, async (req, res, next) => {
      const input = schema?.safeParse(req.body);
      if (input && !input.success) {
        res.status(400).json({
          error: {
            message: 'Cerere Motion invalidă. Recompensa este calculată de server.',
          },
        });
        return;
      }
      try {
        res.json(
          await getStore().motion(res.locals.identity, (s, owner) =>
            action(s, owner, input?.success ? input.data : undefined),
          ),
        );
      } catch (e) {
        if (e instanceof Error && /Activitate|Activitatea/.test(e.message)) {
          res.status(409).json({ error: { message: e.message } });
          return;
        }
        next(e);
      }
    });
  };
  route('/activities', 'get', null, (s, o) => s.activities(o));
  route('/wallet', 'get', null, (s, o) => s.wallet(o));
  route('/wallet', 'delete', null, (s, o) => ({ erased: s.erase(o) }));
  route('/start', 'post', z.object({ mode: MotionMode }).strict(), (s, o, i) => s.start(o, i.mode));
  route('/finish', 'post', MotionSubmission, (s, o, i) => s.finish(o, i.id, i.points));
  route('/cancel', 'post', z.object({ id: z.string().uuid() }).strict(), (s, o, i) => {
    s.cancel(o, i.id);
    return { ok: true };
  });

  return motionRouter;
}
export const motionRouter = createMotionRouter();
