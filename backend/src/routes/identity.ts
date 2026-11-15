import { Router, raw, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import { z } from 'zod';
import { ProfileInput, TeamPresentation } from '../../../shared/src/identity';
import { jwtGuard, requireIdentity, contributor } from '../middleware/identity';
import { identityStore } from '../services/identityStore';

const run =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
export async function processAvatar(input: Buffer) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > 5 * 1024 * 1024)
    throw Object.assign(new Error('Fotografia trebuie să aibă cel mult 5 MB.'), { status: 400 });
  try {
    const image = sharp(input, {
      limitInputPixels: 25_000_000,
      animated: false,
      failOn: 'warning',
    });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
      throw new Error('format');
    // Actual decoding, square re-encoding, no EXIF or original filename retained.
    return await image.rotate().resize(512, 512, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw Object.assign(
      new Error('Alege o fotografie JPEG, PNG sau WebP validă, fără animație (maximum 25 MP).'),
      { status: 400 },
    );
  }
}
export function createIdentityRouter(guard: RequestHandler = jwtGuard(), getStore = identityStore) {
  const identityRouter = Router();
  identityRouter.use(guard, requireIdentity);
  identityRouter.use(
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );
  identityRouter.get(
    '/',
    run(async (_req, res) => {
      res.json(await getStore().profile(res.locals.identity));
    }),
  );
  identityRouter.patch(
    '/',
    run(async (req, res) => {
      const input = ProfileInput.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({
          error: {
            message: input.error.issues[0]?.message ?? 'Profil invalid.',
          },
        });
        return;
      }
      res.json(await getStore().update(res.locals.identity, input.data));
    }),
  );
  identityRouter.get(
    '/avatar',
    run(async (_req, res) => {
      const bytes = await getStore().avatar(res.locals.identity);
      if (!bytes) {
        res.sendStatus(404);
        return;
      }
      res
        .set({
          'Content-Type': 'image/webp',
          'X-Content-Type-Options': 'nosniff',
        })
        .send(bytes);
    }),
  );
  identityRouter.put(
    '/avatar',
    rateLimit({ windowMs: 60_000, limit: 8 }),
    raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
    run(async (req, res) => {
      res.json(await getStore().saveAvatar(res.locals.identity, await processAvatar(req.body)));
    }),
  );
  identityRouter.delete(
    '/avatar',
    run(async (_req, res) => {
      res.json(await getStore().saveAvatar(res.locals.identity, null));
    }),
  );
  identityRouter.delete(
    '/',
    run(async (req, res) => {
      if (
        !z
          .object({ confirm: z.literal('DELETE') })
          .strict()
          .safeParse(req.body).success
      ) {
        res.status(400).json({ error: { message: 'Confirmă ștergerea datelor FLOW.' } });
        return;
      }
      await getStore().erase(res.locals.identity);
      res.json({ erased: true, auth0IdentityDeleted: false });
    }),
  );
  return identityRouter;
}
export const identityRouter = createIdentityRouter();
export function createTeamRouter(guard: RequestHandler = jwtGuard(), getStore = identityStore) {
  const teamRouter = Router();
  teamRouter.get(
    '/',
    run(async (_req, res) => {
      res.json(await getStore().team());
    }),
  );
  teamRouter.get('/access', guard, requireIdentity, contributor, (_req, res) => {
    res.json({ canEdit: true, source: res.locals.authorizationSource });
  });
  teamRouter.patch(
    '/',
    guard,
    requireIdentity,
    contributor,
    run(async (req, res) => {
      const input = TeamPresentation.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({ error: { message: 'Prezentare invalidă.' } });
        return;
      }
      res.json(await getStore().updateTeam(input.data));
    }),
  );

  return teamRouter;
}
export const teamRouter = createTeamRouter();
