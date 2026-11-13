import { z } from 'zod';
import { MotionResult, MotionWallet, type MotionMode, type MotionPoint } from '@vlaiq/shared';
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
async function call(path: string, body?: unknown) {
  const response = await fetch(`${BASE}/api/motion/${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  }).catch(() => { throw new Error('Nu putem contacta Motion. Verifică conexiunea și reîncearcă.'); });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? 'Serviciul Motion nu este disponibil.');
  return result;
}
export const motionApi = {
  wallet: async () => MotionWallet.parse(await call('wallet')),
  start: async (mode: MotionMode) =>
    z.object({ id: z.string().uuid(), startedAt: z.number() }).parse(await call('start', { mode })),
  finish: async (id: string, points: MotionPoint[]) =>
    MotionResult.parse(await call('finish', { id, points })),
  cancel: async (id: string) => {
    await call('cancel', { id });
  },
};
