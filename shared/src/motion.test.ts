import { describe, expect, it } from 'vitest';
import { evaluateMotion, MotionSubmission, type MotionPoint } from './motion';

function trace(distance = 220, seconds = 120): MotionPoint[] {
  return Array.from({ length: 25 }, (_, i) => ({
    lat: 45.75 + ((distance / 111195) * i) / 24,
    lng: 21.22,
    accuracy: 4,
    timestamp: 1700000000000 + (seconds * 1000 * i) / 24,
    segment: 0,
  }));
}
describe('deterministic activity eligibility', () => {
  it('gives no coins to a stationary phone or shaking without GPS displacement', () => {
    const points = trace(0);
    expect(evaluateMotion('walk', points).coins).toBe(0);
    expect(evaluateMotion('run', points).distance).toBe(0);
  });
  it('does not credit a GPS teleport', () => {
    const points = trace();
    points[10] = { ...points[10]!, lat: 46.5 };
    const result = evaluateMotion('walk', points);
    expect(result.discarded).toBeGreaterThan(0);
    expect(result.distance).toBeLessThan(250);
  });
  it('rejects inaccurate observations', () => {
    const result = evaluateMotion(
      'walk',
      trace().map((p) => ({ ...p, accuracy: 150 })),
    );
    expect(result.status).toBe('rejected');
    expect(result.coins).toBe(0);
  });
  it('accepts plausible walking without requiring accelerometer data', () => {
    expect(evaluateMotion('walk', trace()).status).toBe('eligible');
    expect(evaluateMotion('walk', trace()).coins).toBe(10);
  });
  it('accepts a mounted bicycle with no motion sensor and caps rewards independently of speed', () => {
    const result = evaluateMotion('cycle', trace(1800, 240));
    expect(result.status).toBe('eligible');
    expect(result.coins).toBe(40);
  });
  it('does not connect observations across pauses or long gaps', () => {
    const points = trace();
    expect(
      evaluateMotion(
        'walk',
        points.map((p, i) => ({ ...p, segment: i })),
      ).distance,
    ).toBe(0);
    expect(
      evaluateMotion(
        'walk',
        points.map((p, i) => ({ ...p, timestamp: p.timestamp + i * 30000 })),
      ).distance,
    ).toBe(0);
  });
  it('does not reward GPS noise or a very short session', () => {
    expect(evaluateMotion('walk', trace(3)).coins).toBe(0);
    expect(evaluateMotion('walk', trace(60, 30)).coins).toBe(0);
  });
  it('does not accept client-selected coin amounts or a simulation flag', () => {
    const payload = { id: 'd3a5f7c2-0812-4b8e-bf5f-b4ca607bad7b', points: trace() };
    expect(MotionSubmission.safeParse({ ...payload, coins: 99999 }).success).toBe(false);
    expect(MotionSubmission.safeParse({ ...payload, demo: true }).success).toBe(false);
    expect(MotionSubmission.safeParse(payload).success).toBe(true);
  });
});
