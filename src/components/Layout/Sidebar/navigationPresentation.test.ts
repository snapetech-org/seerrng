import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationSections } from './navigation';
import { getNavigationSectionsForTheme } from './navigationPresentation';

const originalOrder = [
  'discover-home',
  'movies',
  'series',
  'requests',
  'blocklist',
  'issues',
  'users',
  'settings',
];

test('SeerrOrig flattens navigation and restores the upstream core order', () => {
  const [original] = getNavigationSectionsForTheme(
    navigationSections,
    'seerrOrig'
  );

  assert.equal(original.id, 'original');
  assert.equal(original.headingKey, undefined);
  assert.deepEqual(
    original.links.slice(0, originalOrder.length).map(({ id }) => id),
    originalOrder
  );
  assert.deepEqual(
    original.links.slice(originalOrder.length).map(({ id }) => id),
    navigationSections
      .flatMap((section) => section.links)
      .map(({ id }) => id)
      .filter((id) => !originalOrder.includes(id))
  );
});

test('SeerrNGJ retains the grouped SeerrNG navigation order', () => {
  assert.strictEqual(
    getNavigationSectionsForTheme(navigationSections, 'seerrNGJ'),
    navigationSections
  );
});
