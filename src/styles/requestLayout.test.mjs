import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('modal headings respect shared card padding without negative horizontal margins', () => {
  const modal = readFileSync(
    new URL('../components/Common/Modal/index.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    modal,
    /upstream\s*\? 'relative -mx-4 overflow-x-hidden px-4 pt-0\.5 sm:flex sm:items-center'\s*: 'relative min-w-0 pt-0\.5 sm:flex sm:items-center'/
  );
  assert.match(modal, /relative min-w-0 pt-0\.5 sm:flex sm:items-center/);
});

test('metadata profiles reuse the same control as destination and quality profiles', () => {
  const source = readFileSync(
    new URL(
      '../components/RequestModal/AdvancedRequester/index.tsx',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(source, /<RequestListboxControl\s+id="metadataProfile"/);
  assert.doesNotMatch(source, /<select\s+id="metadataProfile"/);
});
