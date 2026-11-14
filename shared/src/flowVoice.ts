import { z } from 'zod';

export const FLOW_AGENT = {
  id: 'agent_8701m7dvvhhyexj9771tqawz23vm',
  branch: 'agtbrch_7201m7dvvk3heh2rcra471qb03ms',
  version: 'agtvrsn_7001m7dwanv7fe385wxb8f4zbc6c',
  voice: 'neZC2DQ42NvDV1SyoMxN',
  navigationModel: 'eleven_flash_v2_5',
} as const;
export const VoiceMode = z.enum(['driving', 'walking', 'cycling']);
export type Mode = z.infer<typeof VoiceMode>;
export const VoicePriority = z.enum(['cheapest', 'least_walking', 'fastest', 'eco']);
export type Priority = z.infer<typeof VoicePriority>;
export type Environment = 'live' | 'demo';
export type Place = { label: string };
export type Preferences = {
  priority: Priority | null;
  max_walking_minutes: number | null;
  journey_mode: Mode;
};
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'MISSING_ORIGIN'
  | 'MISSING_DESTINATION'
  | 'AMBIGUOUS_LOCATION'
  | 'STALE_CONTEXT'
  | 'SERVICE_UNAVAILABLE'
  | 'NO_ROUTE'
  | 'NO_MATCH'
  | 'NAVIGATION_ACTIVE'
  | 'TIMEOUT';
export type ToolEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; candidates?: Place[] } };
export type Parking = {
  name: string;
  cost: { amount: number; currency: string; kind: 'estimated' } | null;
  availability: { kind: 'rule_model_estimate'; score: number | null } | null;
};
export type Journey = {
  journey_id: string;
  journey_mode: Mode;
  duration_minutes: number | null;
  distance_meters: number | null;
  walking_minutes: number | null;
  parking: Parking | null;
  reason: string | null;
};
export type Comparison = {
  environment: Environment;
  comparison_id: string;
  origin: Place;
  destination: Place;
  preferences: Preferences;
  journeys: Journey[];
  unavailable_modes: { mode: Mode; reason: string }[];
  provenance: {
    source: string;
    kind: 'municipal_snapshot' | 'routing' | 'rule_model' | 'demo';
    as_of?: string;
  }[];
  limitations: string[];
};
export type JourneyContext = {
  environment: Environment;
  origin: Place | null;
  destination: Place | null;
  preferences: Preferences;
  selected_journey: Journey | null;
  comparison: Comparison | null;
  navigation: {
    active: boolean;
    route_revision: string | null;
    remaining_distance_meters: number | null;
    remaining_duration_seconds: number | null;
    last_instruction: { text: string; current: boolean; route_revision: string } | null;
  };
};
export type PreferencesUpdated = {
  preferences: Preferences;
  changed_fields: (keyof Preferences)[];
};
export type JourneySelected = {
  environment: Environment;
  comparison_id: string;
  journey: Journey;
  map_highlighted: boolean;
};
export type NavigationSpeechEvent = {
  session_id: string;
  route_revision: string;
  event_id: string;
  step_id: string | null;
  phase: 'prepare' | 'now' | 'status';
  kind:
    | 'turn'
    | 'straight'
    | 'roundabout'
    | 'deviation'
    | 'recalculating'
    | 'parking_arrival'
    | 'walking_handoff'
    | 'arrival';
  text: string;
  locale: 'ro' | 'en';
  priority: 'urgent' | 'normal';
  expires_at_ms: number;
};
export const ContextInput = z.object({}).strict();
export const PreferenceInput = z
  .object({
    priority: VoicePriority.optional(),
    max_walking_minutes: z.number().int().min(0).max(180).optional(),
    journey_mode: VoiceMode.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Supply an update');
const placeText = z.string().trim().min(1).max(160);
export const CompareInput = z
  .object({
    origin_text: placeText.optional(),
    destination_text: placeText.optional(),
    journey_mode: VoiceMode.optional(),
  })
  .strict();
export const SelectInput = z
  .object({ comparison_id: z.string().min(1).max(200), journey_id: z.string().min(1).max(200) })
  .strict();
