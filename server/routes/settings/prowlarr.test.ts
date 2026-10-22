import { defaultProwlarrCategoryMappings } from '@server/constants/prowlarr';
import type { ProwlarrSettings } from '@server/lib/settings';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseProwlarrSettings } from './prowlarr';

const existingSettings: ProwlarrSettings = {
  hostname: 'prowlarr.local',
  port: 9696,
  useSsl: false,
  baseUrl: '',
  apiKey: 'saved-test-api-key',
  categoryMappings: defaultProwlarrCategoryMappings(),
};

it('preserves the saved Prowlarr key when a connection test omits it', () => {
  const parsed = parseProwlarrSettings(
    { hostname: 'prowlarr.local', port: 9696, useSsl: false },
    existingSettings
  );

  assert.equal('error' in parsed, false);
  if (!('value' in parsed)) return;
  assert.equal(parsed.value.apiKey, 'saved-test-api-key');
});

it('clears the saved Prowlarr key when requested', () => {
  const parsed = parseProwlarrSettings(
    {
      hostname: 'prowlarr.local',
      port: 9696,
      useSsl: false,
      clearApiKey: true,
    },
    existingSettings
  );

  assert.equal('error' in parsed, false);
  if (!('value' in parsed)) return;
  assert.equal(parsed.value.apiKey, '');
});

it('validates category indexer assignments, per-user search limits, and visibility', () => {
  const parsed = parseProwlarrSettings(
    {
      indexerIdsByCategory: { movie: [4, 4, 8], adult: [] },
      searchLimitPerUserPerMinute: 8,
      searchLimitByIndexer: { 4: 3, 8: 5 },
      showIndexerDetails: true,
    },
    existingSettings
  );

  assert.equal('error' in parsed, false);
  if (!('value' in parsed)) return;
  assert.deepEqual(parsed.value.indexerIdsByCategory, {
    movie: [4, 8],
    adult: [],
  });
  assert.equal(parsed.value.searchLimitPerUserPerMinute, 8);
  assert.deepEqual(parsed.value.searchLimitByIndexer, { 4: 3, 8: 5 });
  assert.equal(parsed.value.showIndexerDetails, true);
});

it('rejects out-of-range indexer search limits and malformed assignments', () => {
  for (const value of [
    { searchLimitPerUserPerMinute: 0 },
    { searchLimitByIndexer: { 4: 61 } },
    { indexerIdsByCategory: { movie: ['4'] } },
    { showIndexerDetails: 'true' },
  ]) {
    assert.equal(
      'error' in parseProwlarrSettings(value, existingSettings),
      true
    );
  }
});
