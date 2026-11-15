import { Router, type RequestHandler } from 'express';
import {
  JourneyQuestion,
  JourneyReference,
  JourneySelection,
  walkingLimit,
} from '../../../shared/src/journeyBuddy';
import {
  constrainComparison,
  walkingSeconds,
} from '../../../shared/src/journeyConstraints';
import { jwtGuard, requireIdentity } from '../middleware/identity';
import {
  HandoffError,
  journeyHandoffs,
  type JourneyHandoffs,
} from '../services/journeyHandoffs';
import { GeminiBuddy } from '../features/buddy/gemini';
import { config } from '../config';

export type JourneyNarrator = (context: unknown) => Promise<string>;
export const narrateJourney: JourneyNarrator = async (context) => {
  if (!config.geminiApiKey) throw new Error('Gemini unavailable');
  return new GeminiBuddy(
    config.geminiApiKey,
    config.buddyGeminiModel,
  ).explainJourney(context);
};
export function createJourneyBuddyRouter(
  guard: RequestHandler = jwtGuard(),
  store: JourneyHandoffs = journeyHandoffs,
  narrate: JourneyNarrator = narrateJourney,
) {
  const router = Router();
  router.use(guard, requireIdentity);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const run =
    (fn: RequestHandler): RequestHandler =>
    (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch((e) => {
        if (e instanceof HandoffError)
          res.status(e.status).json({ error: { message: e.message } });
        else next(e);
      });
    };
  router.post(
    '/load',
    run(async (req, res) => {
      const ref = JourneyReference.safeParse(req.body);
      if (!ref.success) throw new HandoffError(400, 'Referință invalidă.');
      const e = store.load(
        req.get('X-Flow-Journey-Session') ?? '',
        ref.data,
        res.locals.identity,
      );
      res.json({ input: e.input, value: e.value });
    }),
  );
  router.post(
    '/explain',
    run(async (req, res) => {
      const input = JourneyQuestion.safeParse(req.body);
      if (!input.success)
        throw new HandoffError(400, 'Întrebare sau referință invalidă.');
      const limit = walkingLimit(input.data.question);
      if (limit === null)
        throw new HandoffError(
          400,
          'Folosește „cel mult N minute pe jos”, cu N întreg între 0 și 180.',
        );
      const session = req.get('X-Flow-Journey-Session') ?? '';
      const e = store.load(session, input.data.reference, res.locals.identity);
      const eligible = constrainComparison(e.value, limit);
      const optionId = eligible.rankings[e.input.preference].recommendedId;
      let text = optionId
        ? 'Opțiunea recomandată respectă limita în setul comparat. Verifică mai jos valorile și proveniența; duratele sunt estimări, iar disponibilitatea live nu este cunoscută.'
        : 'Setul comparat nu conține o variantă eligibilă. Ajustează limita de mers pe jos.';
      let source: 'gemini' | 'deterministic' = 'deterministic';
      if (optionId) {
        // No coordinates, identity, account, session secret, reference, route geometry or user prompt.
        const context = {
          maxWalkMinutes: limit,
          selectedId: optionId,
          options: e.value.journeys.map((j) => ({
            id: j.id,
            category: j.category,
            eligible: eligible.journeys.some((k) => k.id === j.id),
            duration: j.travelSeconds,
            walkingSeconds: walkingSeconds(j),
            cost: j.parking?.fee ?? null,
            availability: j.parking?.availability ?? null,
            freeChance: j.parking?.match.freeChance ?? null,
            sources: j.legs
              .filter((l) => l.type !== 'parking')
              .map((l) => l.duration.source),
            limitations: j.limitations,
          })),
        };
        try {
          const narrative = await narrate(context);
          // Figures are rendered exclusively from server facts, never from generated prose.
          if (
            narrative.length > 0 &&
            narrative.length <= 900 &&
            !/\p{N}/u.test(narrative)
          ) {
            text = narrative;
            source = 'gemini';
          }
        } catch {
          /* The validated comparison and map selection remain available. */
        }
      }
      // Recheck after the provider wait: a new comparison, expiry or account binding wins.
      const current = store.load(
        session,
        input.data.reference,
        res.locals.identity,
      );
      if (optionId) current.explained.add(optionId);
      res.json({
        reference: input.data.reference,
        maxWalkMinutes: limit,
        optionId,
        eligibleIds: eligible.journeys.map((j) => j.id),
        text,
        source,
        snapshot: { input: e.input, value: e.value },
      });
    }),
  );
  router.post(
    '/select',
    run(async (req, res) => {
      const input = JourneySelection.safeParse(req.body);
      if (!input.success) throw new HandoffError(400, 'Selecție invalidă.');
      res.json(
        store.select(
          req.get('X-Flow-Journey-Session') ?? '',
          input.data.reference,
          res.locals.identity,
          input.data.optionId,
        ),
      );
    }),
  );
  return router;
}
