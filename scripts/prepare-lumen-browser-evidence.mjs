import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(
  process.env.LUMEN_BROWSER_EVIDENCE_SOURCE ||
    path.join(repo, 'lumen/test-results')
);
const destination = process.env.LUMEN_BROWSER_EVIDENCE_DESTINATION;

if (!destination) {
  throw new Error(
    'Set LUMEN_BROWSER_EVIDENCE_DESTINATION before preparing evidence.'
  );
}

const safeName = (name) => {
  const normalized = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '');
  const safe = normalized || 'evidence';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)
    ? `_${safe}`
    : safe;
};

async function copyDirectory(from, to) {
  await mkdir(to, { recursive: true });
  const used = new Set();

  for (const entry of await readdir(from, { withFileTypes: true })) {
    const base = safeName(entry.name);
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}__${suffix++}`;
    used.add(name);

    const sourcePath = path.join(from, entry.name);
    const destinationPath = path.join(to, name);
    if (entry.isDirectory()) await copyDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) await copyFile(sourcePath, destinationPath);
  }
}

await mkdir(destination, { recursive: true });
try {
  await copyDirectory(source, destination);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  console.log('No Lumen browser evidence was generated.');
}
