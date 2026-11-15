import { EventEmitter } from 'node:events';
import type { ReadStream } from 'node:tty';
import { expect, it } from 'vitest';
import { readPrivateToken } from './privateToken';

function terminal() {
  const input = Object.assign(new EventEmitter(), {
    isTTY: true, isRaw: false, paused: false,
    setRawMode(value: boolean) { this.isRaw = value; },
    resume() { this.paused = false; }, pause() { this.paused = true; },
  });
  const signals = new EventEmitter();
  let printed = '';
  const output = { write: (value: string) => { printed += value; return true; } };
  const read = () => readPrivateToken(input as unknown as ReadStream, output, signals);
  const cleaned = () => {
    expect(input.isRaw).toBe(false); expect(input.paused).toBe(true);
    expect(input.listenerCount('data')).toBe(0);
    expect(input.listenerCount('error')).toBe(0);
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  };
  return { input, signals, read, cleaned, printed: () => printed };
}
it('accepts a Windows-style CRLF paste in memory without echoing it', async () => {
  const t = terminal(), pending = t.read();
  t.input.emit('data', Buffer.from('privateHeader.privatePayload.privateSignature\r\n'));
  expect(await pending).toBe('privateHeader.privatePayload.privateSignature');
  expect(t.printed()).not.toContain('privateHeader'); t.cleaned();
});
it('handles backspace without exposing the edited token', async () => {
  const t = terminal(), pending = t.read();
  t.input.emit('data', 'one.two.wrong\u007f\u007f\u007f\u007f\u007fthree\r');
  expect(await pending).toBe('one.two.three');
  expect(t.printed()).not.toContain('wrong'); t.cleaned();
});
it('cancels Ctrl+C and restores terminal state and signal handlers', async () => {
  const t = terminal(), pending = t.read();
  t.input.emit('data', 'private\u0003');
  await expect(pending).rejects.toThrow('cancelled');
  expect(t.printed()).not.toContain('private'); t.cleaned();
});
it('restores the terminal on process termination', async () => {
  const t = terminal(), pending = t.read(); t.signals.emit('SIGTERM');
  await expect(pending).rejects.toThrow('cancelled'); t.cleaned();
});
it('refuses malformed or oversized input without reflecting it', async () => {
  for (const value of ['private invalid\r', 'x'.repeat(20001)]) {
    const t = terminal(), pending = t.read(); t.input.emit('data', value);
    await expect(pending).rejects.toThrow('Invalid or oversized');
    expect(t.printed()).not.toContain(value); t.cleaned();
  }
});
it('refuses redirected input instead of falling back to insecure files/echo', async () => {
  await expect(readPrivateToken({ isTTY: false } as ReadStream)).rejects.toThrow('interactive local terminal');
});
it('cleans up on terminal EOF and rejects an empty token', async () => {
  for (const event of ['end', 'data']) {
    const t = terminal(), pending = t.read(); t.input.emit(event, '\r');
    await expect(pending).rejects.toThrow(); t.cleaned();
  }
});
