import { parse } from '@formatjs/icu-messageformat-parser';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  quoteIcuLiteral,
  scanApiMessageSources,
} from './api-message-source-lib.mjs';

test('authored API text cannot inject an ICU argument or rich text tag', () => {
  const source = "Expected {'name': '<custom>'}. It's a literal.";
  const nodes = parse(quoteIcuLiteral(source));
  assert(nodes.every((node) => node.type === 0));
  assert.equal(nodes.map((node) => node.value).join(''), source);
});

test('all current authored API/persisted-message sources have a recorded catalog identity', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const current = scanApiMessageSources(root);
  const recorded = JSON.parse(
    fs.readFileSync(
      path.join(root, 'config/i18n/api-message-sources.json'),
      'utf8'
    )
  );
  assert.deepEqual(current, recorded);
  assert(
    current.entries.some(
      (entry) => entry.source === 'A browser session is required.'
    )
  );
  assert(
    current.entries.some((entry) =>
      entry.callsites.some((site) => site.field === 'lastError')
    )
  );
  assert(
    current.entries.some(
      (entry) =>
        entry.source ===
        'Goodreads-compatible metadata source detected. SeerrNG supports this backend.'
    )
  );
  assert(
    current.entries.some((entry) => entry.source === 'Unknown HTTP error')
  );
  assert(
    current.entries.some((entry) => entry.source === 'Malformed CSV quoting.')
  );
  assert(
    current.opaque.some(
      (entry) =>
        entry.source === 'browser-session-not-established' &&
        entry.reason === 'stable protocol/control-flow code'
    )
  );
  assert(
    current.opaque.some(
      (entry) => entry.reason === 'stable protocol/control-flow code'
    )
  );
});
