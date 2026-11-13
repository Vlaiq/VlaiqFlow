import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TimparkSnapshot } from '@vlaiq/shared';

// Snapshot written by `pnpm data:city` (scripts/fetch-city-data.mjs). The app never calls the City Hall live.
const TIMPARK_FILE = fileURLToPath(new URL('../../../shared/src/data/timpark.json', import.meta.url));

function loadTimpark(): TimparkSnapshot | null {
  if (!existsSync(TIMPARK_FILE)) {
    console.warn(`[city] ${TIMPARK_FILE} not found. Run \`pnpm data:city\`.`);
    return null;
  }
  const parsed = TimparkSnapshot.safeParse(JSON.parse(readFileSync(TIMPARK_FILE, 'utf8')));
  if (!parsed.success) {
    console.error('[city] Timpark snapshot does not match the schema:', parsed.error.issues.slice(0, 5));
    return null;
  }
  console.log(`[city] Timpark: ${parsed.data.data.features.length} features, version ${parsed.data.data.version}, fetched ${parsed.data.fetchedAt}`);
  return parsed.data;
}

const timpark = loadTimpark();

export const cityData = {
  timpark: () => timpark,
  timparkCount: () => timpark?.data.features.length ?? 0,
};
