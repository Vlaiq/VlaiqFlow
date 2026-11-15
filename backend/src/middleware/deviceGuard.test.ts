import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { DEVICE_ISSUER, deviceGuard, requireIdentity } from './identity';

describe('no-sign-in device identity (FLOW_ACCOUNTS=local)', () => {
  let server: Server, base: string;
  beforeAll(async () => {
    const app = express();
    app.get('/me', deviceGuard, requireIdentity, (_req, res) => res.json(res.locals.identity));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const a = server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const call = (headers: Record<string, string> = {}) => fetch(`${base}/me`, { headers });

  it('turns a random UUID v4 header into an identity the stores already understand', async () => {
    const id = '3f2b8c1e-9d4a-4c7b-8e2f-1a2b3c4d5e6f';
    const res = await call({ 'X-Flow-Device': id.toUpperCase() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issuer: DEVICE_ISSUER, subject: `device|${id}` });
  });
  it('refuses a missing, malformed or non-v4 ID, and ignores bearer tokens', async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ 'X-Flow-Device': 'not-a-uuid' })).status).toBe(401);
    expect((await call({ 'X-Flow-Device': '3f2b8c1e-9d4a-1c7b-8e2f-1a2b3c4d5e6f' })).status).toBe(401);
    expect((await call({ Authorization: 'Bearer anything' })).status).toBe(401);
  });
});
