// Developer CLI only. No listener, auth bypass, persistence or production route.
import 'dotenv/config';
import { GeminiBuddy } from './gemini';
import { BuddySpeech } from './elevenSpeech';

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.log(JSON.stringify({ gemini: 'BLOCKED', reason: 'GEMINI_API_KEY absent' })); return; }
  const configured = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';
  const ai = new GeminiBuddy(key, configured);
  const start = performance.now();
  const models = await ai.availableModels();
  if (!models.includes(configured)) { console.log(JSON.stringify({ gemini: 'BLOCKED', reason: 'Configured model absent from official project model listing', configured, models })); return; }
  console.log(JSON.stringify({ modelListing: 'PASS', configured, listedModels: models.length }));
  const result = await ai.reply({ message: 'De ce frânarea regenerativă nu recuperează toată energia? Explică pe scurt, fără să propui un quiz.', locale: 'ro' },
    { difficulty: 'beginner', mission: null, result: null, completed: [] }, [], AbortSignal.timeout(18000));
  console.log(JSON.stringify({ gemini: 'PASS', model: configured, latencyMs: Math.round(performance.now() - start), response: result }));
  if (process.env.BUDDY_SMOKE_VOICE === '1' && process.env.ELEVENLABS_API_KEY && process.env.BUDDY_VOICE_ID) {
    const voice = new BuddySpeech(process.env.ELEVENLABS_API_KEY, process.env.BUDDY_VOICE_ID);
    const audio = await voice.synthesize('Salut! Sunt FLOW Buddy.', AbortSignal.timeout(15000));
    console.log(JSON.stringify({ elevenLabsTTS: audio.length > 500 ? 'PASS' : 'FAIL', bytes: audio.length, twoWayVoice: 'NOT TESTED' }));
  }
}
main().catch(e => {
  // Provider error bodies can contain request details: log only a bounded status/name.
  console.log(JSON.stringify({ provider: 'BLOCKED', errorType: e?.name ?? 'Error', status: Number.isInteger(e?.status) ? e.status : undefined }));
  process.exitCode = 1;
});
