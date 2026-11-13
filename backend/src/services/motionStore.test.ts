import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MotionPoint } from '@vlaiq/shared';
import { MotionStore } from './motionStore';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'vlaiq-motion-'));
  dirs.push(dir);
  const file = join(dir, 'ledger.json');
  return { store: new MotionStore(file), file };
}
function points(start: number, meters = 220, seconds = 120): MotionPoint[] {
  return Array.from({ length: 25 }, (_, i) => ({
    lat: 45.75 + ((meters / 111195) * i) / 24,
    lng: 21.22,
    accuracy: 4,
    timestamp: start + (seconds * 1000 * i) / 24,
    segment: 0,
  }));
}
describe('server reward ledger', () => {
  it('awards exactly once when the same session is submitted repeatedly', () => {
    const { store } = setup(),
      now = Date.now(),
      session = store.start('owner', 'walk', now);
    const a = store.finish('owner', session.id, points(now), now + 120000);
    const b = store.finish('owner', session.id, points(now), now + 121000);
    expect(a.wallet.balance).toBe(10);
    expect(b.wallet.balance).toBe(10);
    expect(b.wallet.transactions).toHaveLength(1);
  });
  it('persists summaries and derives totals from the ledger without retaining GPS points', () => {
    const { store, file } = setup(),
      now = Date.now(),
      session = store.start('owner', 'walk', now);
    store.finish('owner', session.id, points(now), now + 120000);
    expect(new MotionStore(file).wallet('owner', now).balance).toBe(10);
    expect(readFileSync(file, 'utf8')).not.toContain('"lat"');
    expect(readFileSync(file, 'utf8')).not.toContain('"lng"');
  });
  it('rejects artificial future timestamps and instant completion', () => {
    const { store } = setup(),
      now = Date.now(),
      session = store.start('owner', 'walk', now);
    expect(store.finish('owner', session.id, points(now), now + 1000).evaluation.coins).toBe(0);
  });
  it('never awards cancelled sessions or another browser session', () => {
    const { store } = setup(),
      now = Date.now(),
      session = store.start('owner', 'walk', now);
    store.cancel('owner', session.id);
    expect(() => store.finish('owner', session.id, points(now), now + 120000)).toThrow('anulată');
    expect(() => store.finish('other', session.id, points(now), now + 120000)).toThrow();
    expect(store.wallet('owner').balance).toBe(0);
  });
  it('enforces the daily cap even across different activity IDs', () => {
    const { store } = setup(),
      start = Date.UTC(2026, 10, 13, 9);
    for (let i = 0; i < 3; i++) {
      const now = start + i * 300000;
      const s = store.start('owner', 'cycle', now);
      store.finish('owner', s.id, points(now, 1800, 240), now + 240000);
    }
    expect(store.wallet('owner', start).balance).toBe(80);
    expect(store.wallet('owner', start).dailyEarned).toBe(80);
  });
});
