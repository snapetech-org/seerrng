#!/usr/bin/env node
// SeerrNG documentation inventory validation; maintained by snapetech contributors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const comparison = path.join(root, 'docs/feature-comparison.md');
const text = fs.readFileSync(comparison, 'utf8');
const rows = text
  .split('\n')
  .filter((line) => /^\| .+\| \[Guide\]\(/.test(line));
const seen = new Set();
const guides = new Set();
const errors = [];
for (const row of rows) {
  const cells = row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
  const title = cells[0];
  if (seen.has(title)) errors.push(`Duplicate capability: ${title}`);
  seen.add(title);
  if (cells.length !== 4 || cells.some((cell) => !cell)) {
    errors.push(`Incomplete comparison row: ${title}`);
    continue;
  }
  const match = cells[3].match(/^\[Guide\]\((\.\/[^)#]+\.mdx?)\)$/);
  if (!match) {
    errors.push(`Guide must be an in-repo Markdown document: ${title}`);
    continue;
  }
  const target = path.resolve(path.dirname(comparison), match[1]);
  if (
    !target.startsWith(path.join(root, 'docs') + path.sep) ||
    !fs.existsSync(target)
  ) {
    errors.push(`Missing guide: ${title}: ${match[1]}`);
    continue;
  }
  guides.add(target);
}
if (!rows.length) errors.push('No comparison capabilities found.');
const upstreamLinks = new Set();
for (const target of guides) {
  const source = fs.readFileSync(target, 'utf8');
  const parts = source.split(/^## Sources and attribution\s*$/m);
  const label = path.relative(root, target);
  if (parts.length !== 2) {
    errors.push(`${label}: exactly one attribution footer is required.`);
    continue;
  }
  const footer = parts[1];
  if (/^#{1,2} /m.test(footer))
    errors.push(`${label}: attribution must be the final section.`);
  if (
    !footer.includes('/NOTICE.md') ||
    !footer.includes('/UPSTREAM_ATTRIBUTION.md')
  )
    errors.push(`${label}: licensing and source-ledger links are required.`);
  if (!footer.includes('feature-comparison.md'))
    errors.push(`${label}: missing comparison return link.`);
  const references = (value) =>
    value.match(
      /https:\/\/github\.com\/seerr-team\/seerr\/(?:issues|pull)\/\d+/g
    ) ?? [];
  for (const url of references(parts[0])) {
    if (!footer.includes(url))
      errors.push(`${label}: existing source missing from footer: ${url}`);
  }
  for (const url of references(footer)) upstreamLinks.add(url);
}
const ledger = fs.readFileSync(
  path.join(root, 'UPSTREAM_ATTRIBUTION.md'),
  'utf8'
);
for (const url of upstreamLinks) {
  if (!ledger.includes(url))
    errors.push(`Upstream source missing from public ledger: ${url}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Feature comparison: ${rows.length} capabilities, ${guides.size} linked guides, ${upstreamLinks.size} upstream records; attribution and coverage valid.`
  );
}
