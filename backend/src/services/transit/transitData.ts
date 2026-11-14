import { readFileSync, statSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TransitIndex } from './gtfsIndex';
import type { TransitUnavailableReason } from '../../../../shared/src/schemas/transit';
import { validateDigest } from './gtfsParser';

/** Validate first, then replace in the same directory. Any earlier error preserves the old file. */
export function writeTransitDigest(input: unknown, target: string) {
  const digest = validateDigest(input), temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temporary, 'wx', 0o644);
    try { writeFileSync(fd, JSON.stringify(digest) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, target);
  } finally { rmSync(temporary, { force: true }); }
}

/** Explicit startup/reload hook: keep the returned index and reuse it for all requests. */
export function loadTransitIndex(path = fileURLToPath(new URL('../../../../shared/src/data/smtt-gtfs-digest.json', import.meta.url))):
  { index: TransitIndex; reason: null } | { index: null; reason: TransitUnavailableReason } {
  try {
    if (statSync(path).size > 128 * 1024 * 1024) return { index: null, reason: 'GTFS_INVALID' };
    return { index: new TransitIndex(JSON.parse(readFileSync(path, 'utf8'))), reason: null };
  } catch (error) {
    return { index: null, reason: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'GTFS_UNAVAILABLE' : 'GTFS_INVALID' };
  }
}
