import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// Production-only cache manifest. It contains build artifacts, never runtime data.
const dist = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
const source = fileURLToPath(new URL('../frontend/public/service-worker.js', import.meta.url));
const assets = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (/\.(?:js|css|woff2?)$/.test(entry.name) && !entry.name.endsWith('.map')) assets.push(path);
  }
}
visit(join(dist, 'assets'));
assets.sort();
const hash = createHash('sha256').update(readFileSync(join(dist, 'index.html')));
for (const path of assets) hash.update(readFileSync(path));
const template = readFileSync(source, 'utf8');
hash.update(template);
for (const name of ['offline.html', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) {
  hash.update(readFileSync(join(dist, name)));
}
const version = `vlaiq-shell-${hash.digest('hex').slice(0, 16)}`;
const paths = assets.map(path => `/${relative(dist, path).replaceAll('\\', '/')}`);
const worker = template
  .replace("const VERSION = 'vlaiq-shell-v1';", `const VERSION = ${JSON.stringify(version)};`)
  .replace('const BUILT_FILES = [];', `const BUILT_FILES = ${JSON.stringify(paths)};`);
writeFileSync(join(dist, 'service-worker.js'), worker);
console.log(`PWA shell prepared: ${paths.length} public build assets, ${version}`);
