import 'dotenv/config';
import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const Env = z.object({
  // Not "PORT": tools that launch the frontend set PORT, and the backend must not pick it up.
  API_PORT: z.coerce.number().int().positive().default(8787),
  API_HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  ORS_API_KEY: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  ELEVENLABS_API_KEY: optionalSecret,
  DATABASE_URL: optionalSecret,
  AUTH0_ISSUER_BASE_URL: z
    .string()
    .url()
    .refine(
      (v) => v.startsWith('https://') && v.endsWith('/'),
      'Auth0 issuer must use HTTPS and end in /',
    )
    .default('https://dev-3a2ijpzkw4p8cng6.us.auth0.com/'),
  AUTH0_AUDIENCE: z.string().url().default('https://api.vlaiqflow.app'),
  // Optional backend-controlled fallback. Never a client-provided role.
  FLOW_TEAM_CONTRIBUTORS_JSON: z
    .string()
    .default('[]')
    .transform((value, ctx) => {
      try {
        return z
          .array(
            z.object({ issuer: z.string().url(), subject: z.string().min(1).max(255) }).strict(),
          )
          .max(20)
          .parse(JSON.parse(value));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid backend contributor identity configuration',
        });
        return z.NEVER;
      }
    }),
});

const env = Env.parse(process.env);

export const config = {
  port: env.API_PORT,
  host: env.API_HOST,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  orsApiKey: env.ORS_API_KEY,
  geminiApiKey: env.GEMINI_API_KEY,
  elevenLabsApiKey: env.ELEVENLABS_API_KEY,
  databaseUrl: env.DATABASE_URL,
  auth0Issuer: env.AUTH0_ISSUER_BASE_URL,
  auth0Audience: env.AUTH0_AUDIENCE,
  teamContributors: env.FLOW_TEAM_CONTRIBUTORS_JSON,
} as const;
