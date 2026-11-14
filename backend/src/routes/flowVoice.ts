import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { FLOW_AGENT } from '../../../shared/src/flowVoice';
import { config } from '../config';

const SpeechInput = z
  .object({ text: z.string().trim().min(1).max(240), locale: z.enum(['ro', 'en']) })
  .strict();
const Token = z.object({ token: z.string().min(1), conversation_id: z.string().min(1) });
export interface VoiceDependencies {
  key: () => string | undefined;
  fetch: typeof fetch;
  origins: readonly string[];
}
export function createFlowVoiceRouter(
  deps: VoiceDependencies = {
    key: () => config.elevenLabsApiKey,
    fetch: (...args) => fetch(...args),
    origins: config.corsOrigins,
  },
) {
  const router = Router();
  // FLOW has no user accounts. Require a same/allow-listed browser origin plus a non-simple
  // request header, and bound both IP and process-wide provider work. This is not account auth.
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (!origin || !deps.origins.includes(origin) || req.get('x-flow-voice') !== '1')
      return res
        .status(403)
        .json({
          error: {
            code: 'FORBIDDEN',
            message: 'Deschide FLOW de la adresa configurată pe server ca să pornești vocea.',
          },
        });
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: 36,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) =>
        res
          .status(429)
          .json({
            error: {
              code: 'RATE_LIMITED',
              message: 'Prea multe cereri vocale. Reîncearcă într-un minut.',
            },
          }),
    }),
  );
  let pending = 0;
  const cache = new Map<string, { bytes: Buffer; expires: number }>();
  router.post(
    '/session',
    rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false }),
    async (req, res) => {
      if (!z.object({}).strict().safeParse(req.body).success)
        return res
          .status(400)
          .json({ error: { code: 'INVALID_INPUT', message: 'Cerere vocală invalidă.' } });
      const key = deps.key();
      if (!key)
        return res.status(503).json({
          error: {
            code: 'NOT_CONFIGURED',
            message:
              'FLOW Voice nu este configurat pe server (lipsește cheia ElevenLabs). Planificarea manuală funcționează în continuare.',
          },
        });
      if (pending >= 4)
        return res.status(503).json({
          error: {
            code: 'BUSY',
            message: 'FLOW Voice este ocupat acum. Reîncearcă în câteva secunde.',
          },
        });
      pending++;
      const ctrl = new AbortController();
      const abort = () => {
        if (!res.writableEnded) ctrl.abort();
      };
      res.once('close', abort);
      const timeout = setTimeout(() => ctrl.abort(), 6500);
      try {
        const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/token');
        url.searchParams.set('agent_id', FLOW_AGENT.id);
        // Pin the immutable tested version. Branch HEAD and traffic deployments cannot change it.
        url.searchParams.set('version_id', FLOW_AGENT.version);
        const upstream = await deps.fetch(url, {
          headers: { 'xi-api-key': key },
          signal: ctrl.signal,
        });
        if (!upstream.ok) {
          // Status only: the key and the provider body never reach logs or clients.
          console.warn(`[voice] ElevenLabs refused the conversation token: HTTP ${upstream.status}`);
          const rejected = [401, 403, 404].includes(upstream.status);
          return res.status(503).json({
            error: rejected
              ? {
                  code: 'PROVIDER_REJECTED',
                  message:
                    'ElevenLabs a refuzat conexiunea: cheia de pe server nu are acces la agentul FLOW.',
                }
              : {
                  code: 'SERVICE_UNAVAILABLE',
                  message: 'ElevenLabs nu răspunde acum. Reîncearcă.',
                },
          });
        }
        const data = Token.parse(await upstream.json());
        if (!ctrl.signal.aborted)
          res.json({ conversationToken: data.token, agentVersion: FLOW_AGENT.version });
      } catch {
        if (!res.destroyed)
          res.status(ctrl.signal.aborted ? 504 : 503).json({
            error: {
              code: ctrl.signal.aborted ? 'TIMEOUT' : 'SERVICE_UNAVAILABLE',
              message: 'Nu putem conecta FLOW Voice. Reîncearcă.',
            },
          });
      } finally {
        pending--;
        clearTimeout(timeout);
        res.off('close', abort);
      }
    },
  );
  router.post('/speech', async (req, res) => {
    const input = SpeechInput.safeParse(req.body);
    if (!input.success)
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Indicație invalidă.' } });
    const key = deps.key();
    if (!key || pending >= 4) return res.sendStatus(503);
    const { text, locale } = input.data;
    const cacheKey = JSON.stringify([FLOW_AGENT.voice, FLOW_AGENT.navigationModel, locale, text]);
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return res.type('audio/mpeg').send(hit.bytes);
    const ctrl = new AbortController();
    const abort = () => {
      if (!res.writableEnded) ctrl.abort();
    };
    res.once('close', abort);
    const timer = setTimeout(() => ctrl.abort(), 2200);
    pending++;
    try {
      const response = await deps.fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${FLOW_AGENT.voice}?output_format=mp3_44100_128&enable_logging=false`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text,
            model_id: FLOW_AGENT.navigationModel,
            language_code: locale,
          }),
          signal: ctrl.signal,
        },
      );
      if (!response.ok || !response.headers.get('content-type')?.includes('audio/'))
        throw new Error('provider');
      // Bounded even when the upstream omits or lies about Content-Length.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('empty');
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > 1_000_000) {
          await reader.cancel();
          throw new Error('oversize');
        }
        chunks.push(part.value);
      }
      if (ctrl.signal.aborted || !length) throw new Error('cancelled');
      const bytes = Buffer.concat(chunks);
      for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
      if (cache.size >= 32) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { bytes, expires: Date.now() + 15 * 60_000 });
      res.type('audio/mpeg').send(bytes);
    } catch {
      if (!res.destroyed) res.sendStatus(503);
    } finally {
      pending--;
      clearTimeout(timer);
      res.off('close', abort);
    }
  });
  return router;
}
