import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseDiscoverCompanyList,
  readDiscoverCompanyList,
} from '../src/discoverCompanies.ts';
import { defaultDiscoverNetworks } from '../src/discoverNetworks.ts';
import { defaultDiscoverStudios } from '../src/discoverStudios.ts';

test('Lumen uses the same built-in Discover company defaults', () => {
  assert.equal(defaultDiscoverNetworks.length, 22);
  assert.equal(defaultDiscoverNetworks[0].id, 213);
  assert.equal(defaultDiscoverStudios.length, 11);
  assert.equal(
    defaultDiscoverStudios.find(({ id }) => id === 9993).logoPath,
    '/images/company-logos/dc-studios.png'
  );
});

test('configured company rows preserve defaults, explicit emptiness, and order', () => {
  const defaults = defaultDiscoverStudios;
  assert.equal(
    readDiscoverCompanyList('', defaults, 'studio').companies,
    defaults
  );
  assert.deepEqual(readDiscoverCompanyList('[]', defaults, 'studio'), {
    companies: [],
    isMalformed: false,
  });

  const custom = [
    { id: 12, name: 'Second', logoPath: '/second.png' },
    { id: 11, name: 'First', logoPath: '/first.png', logoTone: 'white' },
  ];
  assert.deepEqual(
    readDiscoverCompanyList(JSON.stringify(custom), defaults, 'studio'),
    { companies: custom, isMalformed: false }
  );
});

test('invalid company data falls back to defaults and rejects unsafe paths', () => {
  const defaults = defaultDiscoverNetworks;
  for (const value of [
    '{bad json',
    JSON.stringify([
      { id: 1, name: 'Unsafe', logoPath: '//example.org/logo.png' },
    ]),
    JSON.stringify([
      { id: 1, name: 'Unsafe', logoPath: '/images/company-logos/x.png' },
    ]),
    JSON.stringify([
      { id: 1, name: 'Duplicate', logoPath: '/one.png' },
      { id: 1, name: 'Duplicate', logoPath: '/two.png' },
    ]),
  ]) {
    assert.deepEqual(readDiscoverCompanyList(value, defaults, 'network'), {
      companies: defaults,
      isMalformed: true,
    });
  }
  assert.equal(
    parseDiscoverCompanyList(
      JSON.stringify([{ id: 1, name: 'Valid', logoPath: '/valid.png' }]),
      'network'
    )?.[0].name,
    'Valid'
  );
});
