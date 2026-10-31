import { describe, expect, it } from 'vitest';
import { createApiMessageMatcher } from './apiMessageMatcher';

describe('source-bound API message matching', () => {
  const match = createApiMessageMatcher([
    ['literal', ['Use a file named config.json (not a URL).']],
    ['service', ['Failed to load ', '.']],
    ['specific', ['Failed to load Radarr item ', '.']],
    ['twoValues', ['Cannot move ', ' into ', '.']],
  ] as const);

  it('matches complete phrases and treats authored regex punctuation literally', () => {
    expect(match('Use a file named config.json (not a URL).')).toEqual({
      key: 'literal',
      values: {},
    });
    expect(
      match('prefix Use a file named config.json (not a URL).')
    ).toBeUndefined();
    expect(match('Use a file named configXjson (not a URL).')).toBeUndefined();
  });

  it('preserves captured provider, user and path values without interpretation', () => {
    const source =
      'Cannot move /books/كتاب {draft}.epub into <provider> & friends.';
    expect(match(source)).toEqual({
      key: 'twoValues',
      values: {
        value0: '/books/كتاب {draft}.epub',
        value1: '<provider> & friends',
      },
    });
    expect(source).toBe(
      'Cannot move /books/كتاب {draft}.epub into <provider> & friends.'
    );
  });

  it('uses the most specific authored template and leaves unknown output untouched', () => {
    expect(match('Failed to load Radarr item 42.')).toEqual({
      key: 'specific',
      values: { value0: '42' },
    });
    expect(match('A provider wrote its own custom message')).toBeUndefined();
    expect(match('Failed to load ' + 'x'.repeat(20_000) + '.')).toBeUndefined();
  });
});
