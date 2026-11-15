import { z } from 'zod';

export const Difficulty = z.enum(['beginner', 'intermediate', 'advanced']);
export type Difficulty = z.infer<typeof Difficulty>;
export const MissionId = z.enum(['city-balance', 'green-route', 'smart-parking', 'energy', 'time-tradeoff', 'misconception']);
export type MissionId = z.infer<typeof MissionId>;
export const CityStrategy = z.enum(['nearest', 'balanced', 'transit']);
export type CityStrategy = z.infer<typeof CityStrategy>;
export const BuddyAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ANSWER_QUESTION') }).strict(),
  z.object({ type: z.literal('START_MISSION'), missionId: MissionId }).strict(),
  z.object({ type: z.literal('REQUEST_HINT') }).strict(),
  z.object({ type: z.literal('CHANGE_DIFFICULTY'), difficulty: Difficulty }).strict(),
  z.object({ type: z.literal('EXPLAIN_RESULT') }).strict(),
  z.object({ type: z.literal('NEXT_MISSION') }).strict(),
  z.object({ type: z.literal('SHOW_PROGRESS') }).strict(),
  z.object({ type: z.literal('SHOW_CITY') }).strict(),
  z.object({ type: z.literal('OPEN_WORKSHOP') }).strict(),
  z.object({ type: z.literal('REQUEST_NAVIGATION_HANDOFF') }).strict(),
]);
export const AIReply = z.object({ text: z.string().trim().min(1).max(1800), action: BuddyAction }).strict();
export type AIReply = z.infer<typeof AIReply>;
export const ChatInput = z.object({ message: z.string().trim().min(1).max(1200), locale: z.enum(['ro', 'en']).default('ro') }).strict();
export const MissionInput = z.object({ missionId: MissionId, difficulty: Difficulty }).strict();
export const MissionAnswer = z.object({ instanceId: z.string().uuid(), choice: z.string().min(1).max(48) }).strict();
export const CosmeticId = z.enum(['mint', 'ocean', 'sunrise', 'leaf-antenna', 'star-badge', 'pulse-light']);
export type CosmeticId = z.infer<typeof CosmeticId>;
export const CosmeticInput = z.object({ cosmeticId: CosmeticId }).strict();
export const COSMETICS: ReadonlyArray<{ id: CosmeticId; name: string; price: number; category: 'color' | 'antenna' | 'badge' | 'light'; color?: string }> = [
  { id: 'mint', name: 'Mentă originală', price: 0, category: 'color', color: '#72e5b0' },
  { id: 'ocean', name: 'Albastru Bega', price: 15, category: 'color', color: '#79c9f2' },
  { id: 'sunrise', name: 'Răsărit urban', price: 15, category: 'color', color: '#f3c276' },
  { id: 'leaf-antenna', name: 'Antena frunză', price: 10, category: 'antenna' },
  { id: 'star-badge', name: 'Insigna explorator', price: 10, category: 'badge' },
  { id: 'pulse-light', name: 'Inimă luminoasă', price: 10, category: 'light' },
];
export interface PublicMission {
  instanceId: string; id: MissionId; version: number; difficulty: Difficulty;
  title: string; question: string; options: { id: string; label: string; detail: string }[];
  scenario?: { drivers: number; capacity: number; seed: number };
}
export interface MissionResult {
  instanceId: string; correct: boolean; explanation: string;
  reward: { status: 'credited' | 'already-earned' | 'daily-limit' | 'unavailable' | 'ineligible'; coins: number };
  city?: import('./city').CityOutcome;
}
export interface BuddyProgress {
  completed: { missionId: MissionId; version: number; completedAt: string }[];
  difficulty: Difficulty; correctInRow: number; level: string;
}
export interface BuddyAppearance { color: 'mint' | 'ocean' | 'sunrise'; antenna: boolean; badge: boolean; pulse: boolean }
export const DEFAULT_APPEARANCE: BuddyAppearance = { color: 'mint', antenna: false, badge: false, pulse: false };
export interface BuddySnapshot {
  progress: BuddyProgress; appearance: BuddyAppearance; owned: CosmeticId[];
  balance: number | null; persistence: 'account' | 'test-fixture';
}
export interface BuddyIdentity {
  /** Populated exclusively by a verified JWT adapter, never by a request body. */
  issuer: string; subject: string; nickname?: string;
}
export interface BuddyAIContext {
  difficulty: Difficulty; mission: PublicMission | null; result: MissionResult | null;
  completed: MissionId[];
}
export interface BuddyAIService {
  readonly source: 'gemini' | 'test-fixture';
  reply(input: z.infer<typeof ChatInput>, context: BuddyAIContext,
    history: { role: 'user' | 'assistant'; text: string }[], signal: AbortSignal): Promise<AIReply>;
}
export interface BuddyMissionEngine {
  start(id: MissionId, difficulty: Difficulty): PublicMission;
  evaluate(mission: PublicMission, choice: string): Omit<MissionResult, 'reward'>;
  hint(mission: PublicMission): string;
}
export interface BuddyProgressRepository {
  load(identity: BuddyIdentity): Promise<BuddySnapshot>;
}
export interface BuddyCosmeticsRepository {
  purchase(identity: BuddyIdentity, cosmeticId: CosmeticId): Promise<BuddySnapshot>;
  equip(identity: BuddyIdentity, cosmeticId: CosmeticId): Promise<BuddySnapshot>;
}
export interface BuddyWalletGateway {
  /** Implement with the SAME row-locked transaction as progress. It owns prices and amounts. */
  complete(identity: BuddyIdentity, mission: PublicMission, result: Omit<MissionResult, 'reward'>): Promise<MissionResult>;
}
export type BuddyAudioState = 'off' | 'listening' | 'preparing' | 'playing' | 'paused' | 'error';
export interface BuddyAudioBridge {
  supported: boolean;
  listen(locale: 'ro' | 'en', onTranscript: (text: string) => void): Promise<void>;
  speak(text: string, locale: 'ro' | 'en'): Promise<void>;
  stop(): void;
  dispose(): void;
}
export const learningLevel = (count: number) => count >= 6 ? 'City Strategist' : count >= 4 ? 'Mobility Thinker' : count >= 2 ? 'Eco Explorer' : 'Green Beginner';
