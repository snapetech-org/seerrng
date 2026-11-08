import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  bookLanguageAllowed,
  normalizeBookLanguage,
  parseAllowedBookLanguages,
} from './bookLanguagePolicy';
it('normalizes provider names, ISO aliases and Open Library keys', () => {
  for (const language of ['en', 'ENG', 'English', '/languages/eng'])
    assert.equal(normalizeBookLanguage(language), 'eng');
  assert.deepEqual(
    parseAllowedBookLanguages(['fra', 'fr', 'fre', 'German', 'deu']),
    ['fre', 'ger']
  );
});
it('rejects malformed, unknown, oversized and executable query inputs', () => {
  for (const value of [
    null,
    'eng',
    {},
    ['zzz'],
    ['eng OR *:*'],
    Array(51).fill('eng'),
    [null],
    ['eng,fre'],
  ])
    assert.equal(parseAllowedBookLanguages(value), undefined);
});
it('keeps unrestricted defaults and rejects unknown/disallowed restricted metadata', () => {
  assert.equal(bookLanguageAllowed(undefined, []), true);
  for (const value of [undefined, [], ['spa'], ['unknown'], ['eng OR *:*']])
    assert.equal(bookLanguageAllowed(value, ['eng']), false);
  assert.equal(bookLanguageAllowed(['English'], ['eng']), true);
});
