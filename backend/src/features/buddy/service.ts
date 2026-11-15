import { AIReply, type BuddyAIService, type BuddyAIContext, type BuddyIdentity, type BuddyMissionEngine, type BuddyProgressRepository, type BuddyWalletGateway, type Difficulty, type MissionId, type PublicMission, type MissionResult } from '../../../../shared/src/buddy/contracts';

interface Session {
  touched: number; mission: PublicMission | null; result: MissionResult | null;
  difficulty: Difficulty; initialized: boolean; history: { role: 'user' | 'assistant'; text: string }[]; busy: boolean;
}
export class BuddyService {
  private sessions = new Map<string, Session>();
  constructor(private ai: BuddyAIService, private missions: BuddyMissionEngine,
    private progress: BuddyProgressRepository, private wallet?: BuddyWalletGateway) {}
  private session(id: BuddyIdentity) {
    const now = Date.now();
    for (const [key, s] of this.sessions) if (now - s.touched > 30 * 60_000 && !s.busy) this.sessions.delete(key);
    const key = JSON.stringify([id.issuer, id.subject]);
    let s = this.sessions.get(key);
    if (!s) {
      if (this.sessions.size >= 500) throw Object.assign(new Error('Serviciul este ocupat.'), { status: 503 });
      s = { touched: now, mission: null, result: null, difficulty: 'beginner', initialized: false, history: [], busy: false };
      this.sessions.set(key, s);
    }
    s.touched = now;
    return s;
  }
  async start(id: BuddyIdentity, missionId: MissionId, difficulty: Difficulty) {
    const s = this.session(id);
    if (s.busy) throw Object.assign(new Error('Așteaptă răspunsul curent.'), { status: 409 });
    s.difficulty = difficulty; s.initialized = true;
    s.mission = this.missions.start(missionId, difficulty); s.result = null;
    return s.mission;
  }
  async answer(id: BuddyIdentity, instanceId: string, choice: string) {
    const s = this.session(id);
    if (s.busy) throw Object.assign(new Error('Așteaptă răspunsul curent.'), { status: 409 });
    if (!s.mission || s.mission.instanceId !== instanceId) throw Object.assign(new Error('Misiunea a expirat. Pornește una nouă.'), { status: 409 });
    if (s.result) return s.result;
    s.busy = true;
    try {
      const checked = this.missions.evaluate(s.mission, choice);
      const result: MissionResult = this.wallet ? await this.wallet.complete(id, s.mission, checked) : { ...checked, reward: { status: 'unavailable', coins: 0 } };
      s.result = result;
      s.difficulty = result.correct ? (await this.progress.load(id)).progress.difficulty : 'beginner';
      return result;
    } finally { s.busy = false; }
  }
  hint(id: BuddyIdentity) {
    const m = this.session(id).mission;
    if (!m) throw Object.assign(new Error('Pornește o misiune pentru un indiciu.'), { status: 409 });
    return { text: this.missions.hint(m) };
  }
  async chat(id: BuddyIdentity, input: Parameters<BuddyAIService['reply']>[0], signal: AbortSignal) {
    const s = this.session(id);
    if (s.busy) throw Object.assign(new Error('Așteaptă răspunsul curent.'), { status: 409 });
    s.busy = true;
    try {
      const p = await this.progress.load(id);
      if (!s.initialized) { s.difficulty = p.progress.difficulty; s.initialized = true; }
      const context: BuddyAIContext = { difficulty: s.difficulty, mission: s.mission, result: s.result, completed: p.progress.completed.map(c => c.missionId) };
      const reply = AIReply.parse(await this.ai.reply(input, context, s.history, signal));
      signal.throwIfAborted();
      const action = reply.action;
      // Only app-owned educational transitions. Navigation/workshop actions are proposals to the UI.
      if (action.type === 'CHANGE_DIFFICULTY') s.difficulty = action.difficulty;
      if (action.type === 'START_MISSION' || action.type === 'SHOW_CITY' || action.type === 'NEXT_MISSION') {
        const next = action.type === 'START_MISSION' ? action.missionId : action.type === 'SHOW_CITY' ? 'city-balance' : (['city-balance', 'green-route', 'smart-parking', 'energy', 'time-tradeoff', 'misconception'] as MissionId[]).find(m => !context.completed.includes(m)) ?? 'city-balance';
        s.mission = this.missions.start(next, s.difficulty); s.result = null;
      }
      s.history.push({ role: 'user', text: input.message }, { role: 'assistant', text: reply.text });
      s.history = s.history.slice(-8);
      return { ...reply, source: this.ai.source, mission: s.mission, difficulty: s.difficulty,
        hint: action.type === 'REQUEST_HINT' && s.mission ? this.missions.hint(s.mission) : null };
    } finally { s.busy = false; }
  }
  forget(id: BuddyIdentity) { this.sessions.delete(JSON.stringify([id.issuer, id.subject])); }
  spokenReply(id: BuddyIdentity) {
    const reply = this.session(id).history.filter(h => h.role === 'assistant').at(-1);
    if (!reply) throw Object.assign(new Error('Trimite mai întâi un mesaj lui Buddy.'), { status: 409 });
    return reply.text;
  }
}
