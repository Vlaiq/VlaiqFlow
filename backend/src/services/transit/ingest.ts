import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeGtfs } from './gtfsParser';
import { writeTransitDigest } from './transitData';

// CLI invoked by scripts/fetch-smtt-gtfs.mjs after safe ZIP/CSV decoding.
const [tablesFile, provenanceFile, archiveFile] = process.argv.slice(2);
if (!tablesFile || !provenanceFile || !archiveFile) throw new Error('Expected tables, provenance and archive files');
const provenance = JSON.parse(readFileSync(provenanceFile, 'utf8'));
if (statSync(tablesFile).size > 256 * 1024 * 1024 || statSync(archiveFile).size > 64 * 1024 * 1024) throw new Error('Ingestion input size limit');
const archive = readFileSync(archiveFile);
if (archive.length > 64 * 1024 * 1024 || provenance.source !== 'https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip' ||
    provenance.quality !== undefined || createHash('sha256').update(archive).digest('hex') !== provenance.sha256 || archive.length !== provenance.archiveBytes)
  throw new Error('Archive provenance/checksum mismatch');
const digest = normalizeGtfs(JSON.parse(readFileSync(tablesFile, 'utf8')), {
  source: provenance.source, fetchedAt: provenance.fetchedAt, sha256: provenance.sha256, archiveBytes: provenance.archiveBytes,
});
const target = fileURLToPath(new URL('../../../../shared/src/data/smtt-gtfs-digest.json', import.meta.url));
writeTransitDigest(digest, target);
console.log(JSON.stringify(digest.metadata, null, 2));
