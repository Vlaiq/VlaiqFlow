import { AIReply, type BuddySnapshot, type CosmeticId, type Difficulty, type MissionId, type PublicMission, type MissionResult } from '../../../../shared/src/buddy/contracts';
export interface BuddyChatReply extends AIReply { source: 'gemini' | 'test-fixture'; mission: PublicMission | null; difficulty: Difficulty; hint: string | null }
export interface BuddyClient {
  state(signal: AbortSignal): Promise<BuddySnapshot>;
  chat(message: string, locale: 'ro' | 'en', signal: AbortSignal): Promise<BuddyChatReply>;
  start(missionId: MissionId, difficulty: Difficulty, signal: AbortSignal): Promise<PublicMission>;
  answer(instanceId: string, choice: string, signal: AbortSignal): Promise<MissionResult>;
  hint(signal: AbortSignal): Promise<{ text: string }>;
  purchase(cosmeticId: CosmeticId, signal: AbortSignal): Promise<BuddySnapshot>;
  equip(cosmeticId: CosmeticId, signal: AbortSignal): Promise<BuddySnapshot>;
  speech(signal: AbortSignal): Promise<Blob>;
  end(): Promise<void>;
}
/** Caller supplies the host's in-memory Auth0 access-token getter after identity handoff. */
export function createBuddyClient(token: () => Promise<string>, base = ''): BuddyClient {
  async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
    const accessToken = await token();
    signal?.throwIfAborted();
    const response = await fetch(`${base}/api/buddy/${path}`, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { Authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error?.message ?? 'Buddy nu este disponibil. Încearcă din nou.');
    }
    if (path === 'speech') return await response.blob() as T;
    return response.json() as Promise<T>;
  }
  return {
    state: s => request('state', s),
    chat: async (message, locale, s) => { const r = await request<BuddyChatReply>('chat', s, { message, locale }); AIReply.parse({ text: r.text, action: r.action }); return r; },
    start: (missionId, difficulty, s) => request('missions/start', s, { missionId, difficulty }),
    answer: (instanceId, choice, s) => request('missions/answer', s, { instanceId, choice }),
    hint: s => request('missions/hint', s, {}),
    purchase: (cosmeticId, s) => request('cosmetics/purchase', s, { cosmeticId }),
    equip: (cosmeticId, s) => request('cosmetics/equip', s, { cosmeticId }),
    speech: s => request('speech', s, {}),
    end: () => request('session/end', AbortSignal.timeout(2000), {}).then(() => {}),
  };
}
