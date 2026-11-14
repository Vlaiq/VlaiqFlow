// One operator/build operation; no frontend or request-time fetching. No new npm dependency.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'vlaiq-gtfs-'));
const reader = join(root, 'scripts/lib/gtfs_archive.py');
const run = (file, args, cwd = root) => execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=1536` } });
try {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 4 && args[0] === '--archive' && args[2] === '--provenance'))
    throw new Error('Usage: node scripts/fetch-smtt-gtfs.mjs [--archive file.zip --provenance retrieval.json]');
  const archive = args.length ? resolve(args[1]) : join(temporary, 'smtt.zip');
  const provenance = args.length ? JSON.parse(readFileSync(resolve(args[3]), 'utf8')) : JSON.parse(run('python3', [reader, '--download', archive]));
  const meta = join(temporary, 'provenance.json'), tables = join(temporary, 'tables.json');
  writeFileSync(meta, JSON.stringify(provenance));
  run('python3', [reader, '--archive', archive, tables]);
  process.stdout.write(run('pnpm', ['-F', 'backend', 'exec', 'tsx', 'src/services/transit/ingest.ts', tables, meta, archive]));
} catch (error) {
  console.error(error.message, '\nPrevious digest preserved. No synthetic timetable was substituted.');
  process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
