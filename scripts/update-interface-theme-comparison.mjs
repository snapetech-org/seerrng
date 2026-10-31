import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const previewPath = `${repositoryRoot}docs/interface-themes/theme-comparison.html`;
const stylesheets = [
  {
    embeddedName: 'shared.css',
    sourcePath: 'src/styles/interfaceThemes/shared.css',
  },
  {
    embeddedName: 'seerrOrig.css',
    sourcePath: 'themes/seerrOrig/theme.css',
  },
  {
    embeddedName: 'seerrNGJ.css',
    sourcePath: 'themes/seerrNGJ/theme.css',
  },
];
let preview = readFileSync(previewPath, 'utf8');

for (const { embeddedName, sourcePath } of stylesheets) {
  const openingTag = `<style data-profile-stylesheet="${embeddedName}">`;
  const occurrenceCount = preview.split(openingTag).length - 1;

  if (occurrenceCount !== 1) {
    throw new Error(
      `Expected exactly one embedded stylesheet block for ${embeddedName}; found ${occurrenceCount}`
    );
  }

  const start = preview.indexOf(openingTag);
  const end = preview.indexOf('</style>', start);
  const fullSourcePath = `${repositoryRoot}${sourcePath}`;

  if (end === -1) {
    throw new Error(
      `Could not find the end of the ${embeddedName} style block`
    );
  }

  const source = readFileSync(fullSourcePath, 'utf8');
  const embedded = `${openingTag}\n${source}</style>`;
  preview = `${preview.slice(0, start)}${embedded}${preview.slice(end + 8)}`;
}

writeFileSync(previewPath, preview);
