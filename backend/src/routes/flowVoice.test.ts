import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createFlowVoiceRouter } from './flowVoice';
import { FLOW_AGENT } from '../../../shared/src/flowVoice';
let server: Server, base: string;
let key: string | undefined;
const upstream = vi.fn<typeof fetch>();
const origin = 'http://localhost:5173';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/voice', createFlowVoiceRouter({ key: () => key, fetch: upstream, origins: [origin] }));
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  if (address && typeof address === 'object') base = `http://127.0.0.1:${address.port}/voice`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Flow-Voice': '1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe('private FLOW Voice provider proxy', () => {
  it('rejects cross-origin/no browser intent, arbitrary agent IDs, and missing key without provider calls', async () => {
    expect((await post('session', {}, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post('session', {}, { 'X-Flow-Voice': '' })).status).toBe(403);
    expect((await post('session', { agent_id: 'attacker' })).status).toBe(400);
    const response = await post('session', {});
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('pins the immutable tested version server-side and returns no credentials', async () => {
    key = 'synthetic-secret-for-test';
    upstream.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: 'synthetic-token', conversation_id: 'synthetic-conversation' }),
      ),
    );
    const response = await post('session', {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversationToken: 'synthetic-token',
      agentVersion: FLOW_AGENT.version,
    });
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(String(url)).toContain(`version_id=${FLOW_AGENT.version}`);
    expect(String(url)).toContain(`agent_id=${FLOW_AGENT.id}`);
    expect(options?.headers).toEqual({ 'xi-api-key': key });
  });
  it('rejects malformed upstream tokens without leaking provider details', async () => {
    upstream.mockResolvedValueOnce(
      new Response(JSON.stringify({ token: '', secret: 'do not expose' })),
    );
    const response = await post('session', {});
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('do not expose');
  });
  it('uses a distinct Romanian HTTP TTS model, disables provider history, caches clips and validates text', async () => {
    expect((await post('speech', { text: 'x', locale: 'ro', voice_id: 'evil' })).status).toBe(400);
    upstream.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } }),
    );
    const input = { text: 'Indicație sintetică de test.', locale: 'ro' };
    const a = await post('speech', input),
      b = await post('speech', input);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.headers.get('content-type')).toContain('audio/mpeg');
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(String(url)).toContain('enable_logging=false');
    expect(JSON.parse(String(options?.body))).toEqual({
      text: input.text,
      model_id: 'eleven_flash_v2_5',
      language_code: 'ro',
    });
    expect((await a.arrayBuffer()).byteLength).toBe(3);
  });
  it('rate-limits repeated session issuance', async () => {
    const statuses: number[] = [];
    upstream.mockResolvedValue(new Response('{}', { status: 503 }));
    for (let i = 0; i < 5; i++) statuses.push((await post('session', {})).status);
    expect(statuses).toContain(429);
  });
});
