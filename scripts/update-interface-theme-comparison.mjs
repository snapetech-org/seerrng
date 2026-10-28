import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const previewPath = `${repositoryRoot}docs/interface-themes/theme-comparison.html`;
const stylesheets = ['shared.css', 'seerrOrig.css', 'seerrNGJ.css'];
let preview = readFileSync(previewPath, 'utf8');

for (const stylesheet of stylesheets) {
  const openingTag = `<style data-profile-stylesheet="${stylesheet}">`;
  const occurrenceCount = preview.split(openingTag).length - 1;

  if (occurrenceCount !== 1) {
    throw new Error(
      `Expected exactly one embedded stylesheet block for ${stylesheet}; found ${occurrenceCount}`
    );
  }

  const start = preview.indexOf(openingTag);
  const end = preview.indexOf('</style>', start);
  const sourcePath = `${repositoryRoot}src/styles/interfaceThemes/${stylesheet}`;

  if (end === -1) {
    throw new Error(`Could not find the end of the ${stylesheet} style block`);
  }

  const source = readFileSync(sourcePath, 'utf8');
  const embedded = `${openingTag}\n${source}</style>`;
  preview = `${preview.slice(0, start)}${embedded}${preview.slice(end + 8)}`;
}

writeFileSync(previewPath, preview);
