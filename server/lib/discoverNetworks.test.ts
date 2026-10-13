import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DiscoverNetworkData } from '@server/constants/discover';
import {
  isSafeDiscoverNetworkLogoPath,
  parseDiscoverNetworkList,
  readDiscoverNetworkList,
} from './discoverNetworks';

const network = (id: number): DiscoverNetworkData => ({
  id,
  name: `Network ${id}`,
  logoPath: `/network-${id}.png`,
});

describe('Discover network list data', () => {
  it('preserves list order and normalizes safe network records', () => {
    const parsed = parseDiscoverNetworkList(
      JSON.stringify([
        { ...network(8), name: '  Network Eight  ', extra: 'discarded' },
        { ...network(3), logoTone: 'white' },
      ])
    );

    assert.deepStrictEqual(parsed, {
      value: JSON.stringify([
        { ...network(8), name: 'Network Eight' },
        { ...network(3), logoTone: 'white' },
      ]),
    });
  });

  it('accepts an unset default and an explicit empty list as distinct values', () => {
    assert.deepStrictEqual(parseDiscoverNetworkList(''), { value: '' });
    assert.deepStrictEqual(parseDiscoverNetworkList('[]'), { value: '[]' });
  });

  it('enforces the 50 network limit and rejects duplicate IDs', () => {
    const maximum = Array.from({ length: 50 }, (_, index) =>
      network(index + 1)
    );
    const tooMany = [...maximum, network(51)];
    const tooManyResult = parseDiscoverNetworkList(JSON.stringify(tooMany));
    const duplicateResult = parseDiscoverNetworkList(
      JSON.stringify([network(1), network(1)])
    );

    assert.equal(
      'value' in parseDiscoverNetworkList(JSON.stringify(maximum)),
      true
    );
    assert.ok('error' in tooManyResult);
    assert.ok('error' in duplicateResult);
    if ('error' in tooManyResult) {
      assert.match(tooManyResult.error, /limited to 50 entries/);
    }
    if ('error' in duplicateResult) {
      assert.match(duplicateResult.error, /IDs must be unique/);
    }
  });

  it('accepts 50 networks at the individual field limits', () => {
    const maximum = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      name: '\\'.repeat(100),
      logoPath: `/${'a'.repeat(199)}`,
      logoTone: 'white' as const,
    }));

    const parsed = parseDiscoverNetworkList(JSON.stringify(maximum));

    assert.ok('value' in parsed);
  });

  it('rejects unsafe IDs, names, logo paths and logo tones', () => {
    const invalidEntries: unknown[] = [
      { ...network(0) },
      { ...network(Number.MAX_SAFE_INTEGER + 1) },
      { ...network(1), name: '  ' },
      { ...network(1), name: 'A'.repeat(101) },
      { ...network(1), name: 'Bad\nName' },
      { ...network(1), logoPath: 'https://image.tmdb.org/logo.png' },
      { ...network(1), logoPath: '//cdn.example/logo.png' },
      { ...network(1), logoPath: '/../private.png' },
      { ...network(1), logoTone: 'invert' },
    ];

    for (const entry of invalidEntries) {
      const parsed = parseDiscoverNetworkList(JSON.stringify([entry]));
      assert.ok('error' in parsed, JSON.stringify(entry));
    }
  });

  it('falls back to defaults on malformed saved data without conflating []', () => {
    const defaults = [network(1), network(2)];
    const malformed = readDiscoverNetworkList('{broken', defaults);
    const explicitlyEmpty = readDiscoverNetworkList('[]', defaults);
    const unset = readDiscoverNetworkList('', defaults);

    assert.deepStrictEqual(malformed, {
      networks: defaults,
      usesDefaults: true,
      isMalformed: true,
    });
    assert.deepStrictEqual(explicitlyEmpty, {
      networks: [],
      usesDefaults: false,
      isMalformed: false,
    });
    assert.deepStrictEqual(unset, {
      networks: defaults,
      usesDefaults: true,
      isMalformed: false,
    });
  });

  it('accepts only safe image filenames in TMDB logo paths', () => {
    assert.equal(isSafeDiscoverNetworkLogoPath('/network_logo-1.png'), true);
    assert.equal(isSafeDiscoverNetworkLogoPath('/'), false);
    assert.equal(isSafeDiscoverNetworkLogoPath('/..'), false);
    assert.equal(isSafeDiscoverNetworkLogoPath('/foo/bar.png'), false);
    assert.equal(isSafeDiscoverNetworkLogoPath('/%2e%2e%2fsecret'), false);
  });
});
