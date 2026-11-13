import { z } from 'zod';

export const IntegrationStatus = z.enum(['configured', 'not_configured']);

export const HealthResponse = z.object({
  status: z.literal('ok'),
  time: z.string(),
  integrations: z.object({
    routing: IntegrationStatus,
    gemini: IntegrationStatus,
    tts: IntegrationStatus,
    database: IntegrationStatus,
  }),
  parkingsLoaded: z.number().int().nonnegative(),
  timparkFeatures: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** spec §9 — one error shape for every endpoint. */
export const ApiError = z.object({
  error: z.object({
    code: z.enum(['INVALID_INPUT', 'PROVIDER_TIMEOUT', 'RATE_LIMITED', 'UNAVAILABLE', 'NOT_CONFIGURED', 'NOT_FOUND']),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
