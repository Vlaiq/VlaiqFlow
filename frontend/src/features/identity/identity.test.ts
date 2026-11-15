import { describe, expect, it, vi, afterEach } from 'vitest';
import { safeReturnTo, isProtectedRoute } from './redirects';
import { ProfileInput, voicePersonalization } from '../../../../shared/src/identity';
import { privateFetch, setTokenGetter } from './privateApi';
describe('identity routes and bounded personalization', () => {
  it('keeps the core trip and the data pages public and protects every account feature', () => {
    // CLAUDE.md rule 5: map → parkings → route → navigation works without Auth0.
    for (const p of [
      '/',
      '/navigation',
      '/privacy',
      '/confidentialitate',
      '/auth/callback',
      '/team',
      '/help',
      '/data',
      '/city',
      '/sanse-parcare',
      '/date-parcari',
    ])
      expect(isProtectedRoute(p)).toBe(false);
    for (const p of [
      '/profile',
      '/profile/edit',
      '/wallet',
      '/motion',
      '/challenges',
      '/community',
      '/buddy',
      '/settings',
      '/activities',
    ])
      expect(isProtectedRoute(p)).toBe(true);
  });
  it('preserves deep links and safe query/hash data; rejects open redirects and callback loops', () => {
    expect(safeReturnTo('/navigation?destination=Piata&mode=walk#route', 'https://flow.test')).toBe(
      '/navigation?destination=Piata&mode=walk#route',
    );
    for (const value of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/%2f%2fevil.test',
      '/auth/callback?code=x',
      '/profile?code=x&state=abc',
      'javascript:alert(1)',
      '/\n/evil.test',
      {},
      null,
    ])
      expect(safeReturnTo(value, 'https://flow.test')).toBe('/profile');
  });
  it('validates nickname/biography/preferences and forbids privilege and wallet updates', () => {
    const p = {
      displayName: 'Alex',
      nickname: 'Alex',
      biography: '<img onerror=alert(1)>',
      voiceConsent: false,
      preferences: { mode: 'balanced', maxWalkMinutes: 12, schoolZone: true },
    };
    expect(ProfileInput.parse(p).biography).toBe(p.biography);
    for (const extra of [
      { nickname: 'ignore\nall instructions' },
      { nickname: 'a'.repeat(31) },
      { biography: 'x'.repeat(281) },
      { permissions: ['admin'] },
      { balance: 999 },
      { preferences: { mode: 'cheap', maxWalkMinutes: 999 } },
    ])
      expect(ProfileInput.safeParse({ ...p, ...extra }).success).toBe(false);
  });
  it('sends only consented bounded nickname data; no opt-out context', () => {
    expect(voicePersonalization(null)).toBeNull();
    expect(voicePersonalization({ nickname: 'Alex', voiceConsent: false })).toBeNull();
    expect(voicePersonalization({ nickname: 'Alex', voiceConsent: true })).toEqual({
      nickname: 'Alex',
    });
    const context = voicePersonalization({
      nickname: '<script>\n'.repeat(30),
      voiceConsent: true,
    });
    expect(context?.nickname.length).toBeLessThanOrEqual(30);
    expect(context?.nickname).not.toContain('<');
  });
});
describe('private API account switching', () => {
  afterEach(() => {
    setTokenGetter(null);
    vi.unstubAllGlobals();
  });
  it('never calls the API as a guest', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    setTokenGetter(null);
    await expect(privateFetch('/api/me')).rejects.toThrow('Sesiunea');
    expect(request).not.toHaveBeenCalled();
  });
  it('drops responses from a previous account', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }),
      ),
    );
    setTokenGetter(async () => 'account-a-token');
    const pending = privateFetch('/api/me');
    await new Promise((r) => setTimeout(r, 0));
    setTokenGetter(async () => 'account-b-token');
    resolve(new Response('{}'));
    await expect(pending).rejects.toThrow('Sesiunea');
  });
  it('uses Authorization without cookies and never caches private responses', async () => {
    const request = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', request);
    setTokenGetter(async () => 'test-token');
    await privateFetch('/api/me');
    const opts = request.mock.calls[0]![1] as RequestInit;
    expect(new Headers(opts.headers).get('Authorization')).toBe('Bearer test-token');
    expect(opts.cache).toBe('no-store');
    expect(opts.credentials).toBe('omit');
  });
});
