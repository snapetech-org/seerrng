import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDiscoverNavigationPath,
  getDiscoverNavigationState,
  isDiscoverNavigationContextId,
  storeDiscoverNavigationContext,
  type DiscoverNavigationItem,
} from './discoverNavigation';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
}

const items: DiscoverNavigationItem[] = [
  { id: 10, mediaType: 'movie' },
  { id: 10, mediaType: 'tv' },
  { id: 11, mediaType: 'movie' },
];

describe('Discover detail navigation context', () => {
  it('preserves visible order and media identity across mixed movie and TV lists', () => {
    const storage = new MemoryStorage();
    const contextId = 'discover_context_01';

    assert.equal(
      storeDiscoverNavigationContext(
        contextId,
        items,
        { id: 10, mediaType: 'tv' },
        storage as unknown as Storage
      ),
      true
    );
    assert.deepEqual(
      getDiscoverNavigationState(
        contextId,
        { id: 10, mediaType: 'tv' },
        storage as unknown as Storage
      ),
      {
        previous: { id: 10, mediaType: 'movie' },
        next: { id: 11, mediaType: 'movie' },
      }
    );
  });

  it('omits the unavailable direction at the first and last results', () => {
    const storage = new MemoryStorage();
    const contextId = 'discover_context_02';
    storeDiscoverNavigationContext(
      contextId,
      items,
      items[0],
      storage as unknown as Storage
    );

    assert.deepEqual(
      getDiscoverNavigationState(
        contextId,
        items[0],
        storage as unknown as Storage
      ),
      { next: items[1] }
    );
    assert.deepEqual(
      getDiscoverNavigationState(
        contextId,
        items[2],
        storage as unknown as Storage
      ),
      { previous: items[1] }
    );
  });

  it('does not expose navigation without a valid stored origin and current item', () => {
    const storage = new MemoryStorage();
    const contextId = 'discover_context_03';
    storeDiscoverNavigationContext(
      contextId,
      items,
      items[0],
      storage as unknown as Storage
    );

    assert.equal(
      getDiscoverNavigationState(
        undefined,
        items[0],
        storage as unknown as Storage
      ),
      undefined
    );
    assert.equal(
      getDiscoverNavigationState(
        contextId,
        { id: 999, mediaType: 'movie' },
        storage as unknown as Storage
      ),
      undefined
    );
    assert.equal(
      getDiscoverNavigationState(
        'missing_context_01',
        items[0],
        storage as unknown as Storage
      ),
      undefined
    );
  });

  it('rejects malformed identifiers, tampered records, and contexts without the clicked item', () => {
    const storage = new MemoryStorage();
    const contextId = 'discover_context_04';

    assert.equal(isDiscoverNavigationContextId(contextId), true);
    assert.equal(isDiscoverNavigationContextId(''), false);
    assert.equal(isDiscoverNavigationContextId('../movie/1'), false);
    assert.equal(
      storeDiscoverNavigationContext(
        contextId,
        items,
        { id: 999, mediaType: 'movie' },
        storage as unknown as Storage
      ),
      false
    );
    storage.setItem(
      `seerrng:discover-navigation:${contextId}`,
      JSON.stringify({ version: 1, items: [{ id: 0, mediaType: 'movie' }] })
    );
    assert.equal(
      getDiscoverNavigationState(
        contextId,
        items[0],
        storage as unknown as Storage
      ),
      undefined
    );
  });

  it('contains blocked storage operations and creates detail paths without exposing the list', () => {
    const blockedStorage = {
      get length() {
        throw new Error('storage denied');
      },
      getItem() {
        throw new Error('storage denied');
      },
      setItem() {
        throw new Error('storage denied');
      },
      removeItem() {
        throw new Error('storage denied');
      },
      key() {
        throw new Error('storage denied');
      },
    } as unknown as Storage;

    assert.equal(
      storeDiscoverNavigationContext(
        'discover_context_05',
        items,
        items[0],
        blockedStorage
      ),
      false
    );
    assert.equal(
      getDiscoverNavigationState(
        'discover_context_05',
        items[0],
        blockedStorage
      ),
      undefined
    );
    assert.equal(
      getDiscoverNavigationPath(items[1], 'discover_context_05'),
      '/tv/10?discoverContext=discover_context_05'
    );
  });
});

describe('Discover detail navigation bounds', () => {
  it('keeps a window around the clicked item when a list exceeds the stored limit', () => {
    const storage = new MemoryStorage();
    const contextId = 'discover_context_10';
    const longList: DiscoverNavigationItem[] = Array.from(
      { length: 6000 },
      (_, index) => ({ id: index + 1, mediaType: 'movie' as const })
    );
    const clicked = longList[5500];

    assert.equal(
      storeDiscoverNavigationContext(
        contextId,
        longList,
        clicked,
        storage as unknown as Storage
      ),
      true
    );
    assert.deepEqual(
      getDiscoverNavigationState(
        contextId,
        clicked,
        storage as unknown as Storage
      ),
      { previous: longList[5499], next: longList[5501] }
    );
    const stored = JSON.parse(
      storage.getItem(`seerrng:discover-navigation:${contextId}`) ?? '{}'
    ) as { items: DiscoverNavigationItem[] };
    assert.equal(stored.items.length, 5000);
  });

  it('ignores duplicate entries', () => {
    const storage = new MemoryStorage();
    const contextId = 'discover_context_11';
    const duplicated: DiscoverNavigationItem[] = [
      { id: 1, mediaType: 'movie' },
      { id: 1, mediaType: 'movie' },
      { id: 2, mediaType: 'movie' },
    ];

    assert.equal(
      storeDiscoverNavigationContext(
        contextId,
        duplicated,
        duplicated[0],
        storage as unknown as Storage
      ),
      true
    );
    assert.deepEqual(
      getDiscoverNavigationState(
        contextId,
        duplicated[0],
        storage as unknown as Storage
      ),
      { next: { id: 2, mediaType: 'movie' } }
    );
  });

  it('evicts the oldest contexts beyond the stored context limit', () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < 20; index += 1) {
      assert.equal(
        storeDiscoverNavigationContext(
          `discover_context_${String(index).padStart(2, '0')}`,
          items,
          items[0],
          storage as unknown as Storage
        ),
        true
      );
    }

    assert.ok(storage.length <= 12);
    assert.notEqual(
      getDiscoverNavigationState(
        'discover_context_19',
        items[0],
        storage as unknown as Storage
      ),
      undefined
    );
  });
});
