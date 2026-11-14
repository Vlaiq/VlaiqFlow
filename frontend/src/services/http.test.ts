import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, OFFLINE_MESSAGE, TIMEOUT_MESSAGE } from './http';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('turns a dropped connection into a Romanian message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/api/x')).rejects.toThrow(OFFLINE_MESSAGE);
  });
  it('turns a timeout into a Romanian message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    await expect(apiFetch('/api/x')).rejects.toThrow(TIMEOUT_MESSAGE);
  });
  it('keeps a cancellation as AbortError, so callers can ignore it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
