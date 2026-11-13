import 'dotenv/config';
import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const Env = z.object({
  // Not "PORT": tools that launch the frontend set PORT, and the backend must not pick it up.
  API_PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  ORS_API_KEY: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  ELEVENLABS_API_KEY: optionalSecret,
  DATABASE_URL: optionalSecret,
});

const env = Env.parse(process.env);

export const config = {
  port: env.API_PORT,
  corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  orsApiKey: env.ORS_API_KEY,
  geminiApiKey: env.GEMINI_API_KEY,
  elevenLabsApiKey: env.ELEVENLABS_API_KEY,
  databaseUrl: env.DATABASE_URL,
} as const;
