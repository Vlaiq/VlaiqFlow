import { z } from 'zod';

export const MobilityPreferences = z
  .object({
    mode: z.enum(['balanced', 'cheap', 'less_walk']).default('balanced'),
    maxWalkMinutes: z
      .number()
      .int()
      .min(2, 'Alege între 2 și 30 de minute.')
      .max(30, 'Alege între 2 și 30 de minute.')
      .default(12),
    schoolZone: z.boolean().default(true),
  })
  .strict();
export const ProfileInput = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Completează numele afișat.')
      .max(80, 'Numele poate avea cel mult 80 de caractere.'),
    nickname: z
      .string()
      .trim()
      .min(1, 'Alege un nickname.')
      .max(30, 'Nickname-ul poate avea cel mult 30 de caractere.')
      .regex(/^[\p{L}\p{N} ._'-]+$/u, 'Folosește litere, cifre și spații.'),
    biography: z.string().trim().max(280, 'Biografia poate avea cel mult 280 de caractere.'),
    voiceConsent: z.boolean(),
    preferences: MobilityPreferences,
  })
  .strict();
export const Profile = ProfileInput.extend({
  avatarVersion: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;
export type ProfileInput = z.infer<typeof ProfileInput>;

/**
 * FLOW Voice memory: the last lines of the conversation, kept in the account only with the voice
 * consent from Settings, so a new session continues where the last one stopped. No audio, no GPS.
 */
export const VOICE_MEMORY_LINES = 40;
export const VoiceMemoryLine = z
  .object({
    id: z.string().min(1).max(80),
    who: z.enum(['user', 'agent']),
    text: z.string().trim().min(1).max(600),
    /** When the line was said (ISO); lets the agent say "data trecută am vorbit despre…". */
    at: z.string().datetime().optional(),
  })
  .strict();
export const VoiceMemory = z.object({ lines: z.array(VoiceMemoryLine).max(VOICE_MEMORY_LINES) }).strict();
export type VoiceMemoryLine = z.infer<typeof VoiceMemoryLine>;
export const TeamPresentation = z
  .object({
    headline: z.string().trim().min(3).max(120),
    story: z.string().trim().min(10).max(2000),
    photoUrl: z
      .string()
      .max(300)
      .refine(
        (s) => !s || /^\/team\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(s),
        'Folosește o fotografie din /team/.',
      ),
    members: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            responsibility: z.string().trim().min(1).max(120),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const DEFAULT_TEAM = {
  headline: 'Un oraș mai ușor de traversat.',
  story:
    'Suntem VLAIQ. La UniHack 2026 construim FLOW pentru o problemă de zi cu zi: cum ajungem la destinație cu mai puțin timp pierdut căutând o parcare și cu mai multe opțiuni de mobilitate verde. Conectăm datele orașului cu alegeri explicate, rute reale și progres personal.',
  photoUrl: '',
  members: [],
};

/** Only bounded name data, never instructions, email or biography, reaches the voice provider. */
export function voicePersonalization(profile: Pick<Profile, 'nickname' | 'voiceConsent'> | null) {
  if (!profile?.voiceConsent) return null;
  const nickname = profile.nickname
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} .'-]/gu, '')
    .slice(0, 30)
    .trim();
  return nickname ? { nickname } : null;
}
