import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { getSettings } from '@server/lib/settings';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearProwlarrSearchControlsForTests,
  consumeProwlarrGrabHandle,
  createProwlarrGrabHandle,
  isIndexerDetailsVisible,
  reserveProwlarrIndexerSearches,
} from './prowlarrSearchControls';

test('global Prowlarr setting gates indexer details and users can hide their own', (t) => {
  const settings = getSettings();
  const previous = settings.prowlarr.showIndexerDetails;
  t.after(() => {
    settings.prowlarr.showIndexerDetails = previous;
  });

  settings.prowlarr.showIndexerDetails = false;
  assert.equal(isIndexerDetailsVisible(new User()), false);
  assert.equal(
    isIndexerDetailsVisible(
      new User({ settings: new UserSettings({ showIndexerDetails: true }) })
    ),
    false
  );
  settings.prowlarr.showIndexerDetails = true;
  assert.equal(isIndexerDetailsVisible(new User()), true);
  assert.equal(
    isIndexerDetailsVisible(
      new User({ settings: new UserSettings({ showIndexerDetails: true }) })
    ),
    true
  );
  assert.equal(
    isIndexerDetailsVisible(
      new User({ settings: new UserSettings({ showIndexerDetails: false }) })
    ),
    false
  );
});

test('per-indexer search limits are scoped to each user and rolling minute', () => {
  clearProwlarrSearchControlsForTests();
  assert.equal(
    reserveProwlarrIndexerSearches(1, [5], { 5: 2 }, 12, 1_000),
    true
  );
  assert.equal(
    reserveProwlarrIndexerSearches(1, [5], { 5: 2 }, 12, 2_000),
    true
  );
  assert.equal(
    reserveProwlarrIndexerSearches(1, [5], { 5: 2 }, 12, 3_000),
    false
  );
  assert.equal(
    reserveProwlarrIndexerSearches(2, [5], { 5: 2 }, 12, 3_000),
    true
  );
  assert.equal(
    reserveProwlarrIndexerSearches(1, [5], { 5: 2 }, 12, 62_001),
    true
  );
  clearProwlarrSearchControlsForTests();
});

test('Prowlarr grab handles are single use, expire, and belong to one user', () => {
  clearProwlarrSearchControlsForTests();
  const release = {
    guid: 'https://indexer.example/release/5',
    indexerId: 5,
  };
  const handle = createProwlarrGrabHandle(1, 'movie', release, 1_000);

  assert.equal(consumeProwlarrGrabHandle(handle, 2, 2_000), undefined);
  assert.deepEqual(consumeProwlarrGrabHandle(handle, 1, 2_000), {
    userId: 1,
    category: 'movie',
    release,
    expiresAt: 601_000,
  });
  assert.equal(consumeProwlarrGrabHandle(handle, 1, 2_001), undefined);

  const expiring = createProwlarrGrabHandle(1, 'tv', release, 1_000);
  assert.equal(consumeProwlarrGrabHandle(expiring, 1, 601_000), undefined);
  clearProwlarrSearchControlsForTests();
});
