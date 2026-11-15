import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

/** Separate Buddy speech; does not edit or invoke the pinned FLOW navigation agent. */
export class BuddySpeech {
  private client: ElevenLabsClient;
  constructor(key: string, private voiceId: string) {
    if (!key || !/^[a-zA-Z0-9]{10,64}$/.test(voiceId)) throw new Error('Buddy voice configuration required');
    this.client = new ElevenLabsClient({ apiKey: key });
  }
  async synthesize(text: string, signal: AbortSignal) {
    const stream = await this.client.textToSpeech.convert(this.voiceId, {
      text: text.slice(0, 1800), modelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128',
      voiceSettings: { stability: 0.55, similarityBoost: 0.75 },
    }, { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), maxRetries: 0, timeoutInSeconds: 12 });
    const reader = stream.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 2_000_000) throw new Error('Audio exceeds limit');
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const audio = new Uint8Array(size); let offset = 0;
    for (const c of chunks) { audio.set(c, offset); offset += c.length; }
    return audio;
  }
}
