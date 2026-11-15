import type { ReadStream, WriteStream } from 'node:tty';
import type { EventEmitter } from 'node:events';

/** Interactive TTY only. No token file, echo, environment value, shell argument or transcript. */
export function readPrivateToken(
  input: ReadStream = process.stdin,
  output: Pick<WriteStream, 'write'> = process.stdout,
  signals: Pick<EventEmitter, 'once' | 'off'> = process,
): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function')
    return Promise.reject(new Error('Use an interactive local terminal for hidden token entry; pipes and token files are refused.'));
  return new Promise((resolve, reject) => {
    let value = '', finished = false;
    const wasRaw = input.isRaw;
    const finish = (error?: string) => {
      if (finished) return;
      finished = true;
      input.off('data', data);
      input.off('end', ended);
      input.off('error', ended);
      signals.off('SIGINT', cancelled);
      signals.off('SIGTERM', cancelled);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      const token = value;
      value = '';
      if (error) reject(new Error(error));
      else if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
        reject(new Error('Expected a JWT access token only. Nothing was saved or printed.'));
      else resolve(token);
    };
    const cancelled = () => finish('Token entry cancelled. Nothing was saved or printed.');
    const ended = () => finish('Terminal input ended. Nothing was saved or printed.');
    const data = (chunk: Buffer | string) => {
      for (const char of chunk.toString()) {
        if (finished) return;
        if (char === '\u0003') return cancelled();
        if (char === '\r' || char === '\n') return finish();
        if (char === '\b' || char === '\u007f') { value = value.slice(0, -1); continue; }
        if (!/[A-Za-z0-9_.-]/.test(char) || value.length >= 20000)
          return finish('Invalid or oversized token input. Nothing was saved or printed.');
        value += char;
      }
    };
    input.on('data', data);
    input.once('end', ended);
    input.once('error', ended);
    signals.once('SIGINT', cancelled);
    signals.once('SIGTERM', cancelled);
    input.setRawMode(true);
    input.resume();
    output.write('Paste your own Auth0 access token here (hidden), then Enter. Ctrl+C cancels: ');
  });
}
