import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chunksRoot = path.join(root, '.next', 'static', 'chunks');
const baselinePath = path.join(root, 'performance', 'bundle-baseline.json');

const readBudget = (name, fallback, minimum = 0) => {
  const rawValue = process.env[name];
  const value = rawValue === undefined ? fallback : Number(rawValue);
  if (!Number.isFinite(value) || value < minimum) {
    console.error(`${name} must be a finite number >= ${minimum}.`);
    process.exit(1);
  }
  return value;
};

const maxChunkBytes = readBudget('MAX_BUNDLE_CHUNK_KB', 1024, 1) * 1024;
const maxTotalBytes = readBudget('MAX_BUNDLE_TOTAL_MB', 12, 1) * 1024 * 1024;

const collectFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(filePath) : [filePath];
  });
};

const assets = collectFiles(chunksRoot).filter((filePath) =>
  filePath.endsWith('.js')
);
if (assets.length === 0) {
  console.error(
    `No Next.js JavaScript chunks found under ${chunksRoot}. Run pnpm build:next first.`
  );
  process.exit(1);
}

// Translation catalogs are loaded on demand, one language per visitor, so they
// are reported separately instead of counting toward the shared-code budget.
const MIN_CATALOG_CHUNK_BYTES = 64 * 1024;
const MIN_CATALOG_MESSAGE_KEYS = 1000;
const isLocaleCatalogChunk = (filePath, bytes) =>
  bytes >= MIN_CATALOG_CHUNK_BYTES &&
  (fs.readFileSync(filePath, 'utf8').match(/"components\.[A-Za-z]/g) ?? [])
    .length >= MIN_CATALOG_MESSAGE_KEYS;

const allSizes = assets.map((filePath) => {
  const bytes = fs.statSync(filePath).size;
  return { filePath, bytes, catalog: isLocaleCatalogChunk(filePath, bytes) };
});
const sizes = allSizes.filter((asset) => !asset.catalog);
const catalogBytes = allSizes
  .filter((asset) => asset.catalog)
  .reduce((total, asset) => total + asset.bytes, 0);
const totalBytes = sizes.reduce((total, asset) => total + asset.bytes, 0);
const oversized = sizes.filter((asset) => asset.bytes > maxChunkBytes);

for (const asset of oversized) {
  console.error(
    `Bundle budget exceeded: ${path.relative(root, asset.filePath)} is ${(asset.bytes / 1024).toFixed(1)} KB (limit ${(maxChunkBytes / 1024).toFixed(1)} KB).`
  );
}
if (totalBytes > maxTotalBytes) {
  console.error(
    `Total bundle budget exceeded: ${(totalBytes / 1024 / 1024).toFixed(2)} MB (limit ${(maxTotalBytes / 1024 / 1024).toFixed(2)} MB).`
  );
}

if (process.argv.includes('--write-baseline')) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), totalBytes }, null, 2)}\n`
  );
} else if (fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const maxGrowth = readBudget('MAX_BUNDLE_GROWTH', 0.1);
  if (
    baseline.totalBytes > 0 &&
    totalBytes > baseline.totalBytes * (1 + maxGrowth)
  ) {
    console.error(
      `Bundle growth budget exceeded: ${((totalBytes / baseline.totalBytes - 1) * 100).toFixed(1)}% growth (limit ${(maxGrowth * 100).toFixed(1)}%).`
    );
    process.exit(1);
  }
}

const largest = [...sizes].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
console.log(
  `Checked ${sizes.length} JavaScript chunks (${(totalBytes / 1024 / 1024).toFixed(2)} MB total); ${allSizes.length - sizes.length} on-demand translation chunks (${(catalogBytes / 1024 / 1024).toFixed(2)} MB) are reported separately.`
);
for (const asset of largest) {
  console.log(
    `  ${(asset.bytes / 1024).toFixed(1)} KB ${path.relative(root, asset.filePath)}`
  );
}

if (oversized.length > 0 || totalBytes > maxTotalBytes) process.exit(1);
