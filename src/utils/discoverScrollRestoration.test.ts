import { deepStrictEqual, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import {
  DISCOVER_SCROLL_HISTORY_KEY,
  getDiscoverScrollEntry,
  getScrollRestorationAction,
  isMediaDetailPath,
  readDiscoverScrollEntry,
  saveDiscoverScrollEntry,
} from './discoverScrollRestoration';

describe('discover scroll restoration', () => {
  const entry = {
    path: '/discover/movies?sortBy=popularity.desc',
    scrollY: 4200,
    itemCount: 80,
  };

  it('recognizes only the corresponding media detail route', () => {
    strictEqual(isMediaDetailPath('/movie/123', 'movie'), true);
    strictEqual(isMediaDetailPath('/tv/123', 'movie'), false);
    strictEqual(isMediaDetailPath('/movie/123', 'movieOrTv'), true);
    strictEqual(isMediaDetailPath('/tv/123?from=list', 'movieOrTv'), true);
    strictEqual(isMediaDetailPath('/book/OL123W', 'movieOrTv'), false);
    strictEqual(isMediaDetailPath('/book/OL123W?from=list', 'book'), true);
    strictEqual(isMediaDetailPath('/discover/books', 'book'), false);
    strictEqual(isMediaDetailPath('/comic/4050', 'comic'), true);
    strictEqual(isMediaDetailPath('/movie/4050', 'comic'), false);
  });

  it('reads valid restoration data only for the matching history entry', () => {
    const state = { [DISCOVER_SCROLL_HISTORY_KEY]: entry };

    deepStrictEqual(getDiscoverScrollEntry(state, entry.path), entry);
    deepStrictEqual(
      getDiscoverScrollEntry(
        {
          [DISCOVER_SCROLL_HISTORY_KEY]: {
            ...entry,
            shuffleSeed: 'x'.repeat(128),
          },
        },
        entry.path
      ),
      { ...entry, shuffleSeed: 'x'.repeat(128) }
    );
    strictEqual(getDiscoverScrollEntry(state, '/discover/movies'), undefined);
    strictEqual(
      getDiscoverScrollEntry(
        {
          [DISCOVER_SCROLL_HISTORY_KEY]: {
            ...entry,
            scrollY: Number.NaN,
          },
        },
        entry.path
      ),
      undefined
    );
    strictEqual(
      getDiscoverScrollEntry(
        {
          [DISCOVER_SCROLL_HISTORY_KEY]: {
            ...entry,
            shuffleSeed: 'x'.repeat(129),
          },
        },
        entry.path
      ),
      undefined
    );
  });

  it('loads enough infinite-scroll results before restoring the offset', () => {
    strictEqual(
      getScrollRestorationAction({
        entry,
        itemCount: 20,
        isLoading: false,
        isReachingEnd: false,
      }),
      'load-more'
    );
    strictEqual(
      getScrollRestorationAction({
        entry,
        itemCount: 20,
        isLoading: true,
        isReachingEnd: false,
      }),
      'none'
    );
    strictEqual(
      getScrollRestorationAction({
        entry,
        itemCount: 80,
        isLoading: false,
        isReachingEnd: false,
      }),
      'restore'
    );
  });
});

describe('history entry persistence', () => {
  it('retains the list seed and offset after Next replaces history state, isolating fresh visits', () => {
    const values = new Map<string, string>();
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      'window'
    );
    const browser = {
      history: { state: { key: 'first' } },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: browser,
    });
    try {
      for (const path of [
        '/discover/movies',
        '/discover/tv',
        '/discover/books',
      ]) {
        const entry = {
          path,
          scrollY: 4200,
          itemCount: 80,
          shuffleSeed: 'original-order',
        };
        browser.history.state = { key: path };
        saveDiscoverScrollEntry(entry);
        browser.history.state = { key: 'detail' };
        strictEqual(readDiscoverScrollEntry(path), undefined);
        browser.history.state = { key: path };
        deepStrictEqual(readDiscoverScrollEntry(path), entry);
        strictEqual(readDiscoverScrollEntry(`${path}?sortBy=new`), undefined);
        browser.history.state = { key: 'fresh-visit' };
        strictEqual(readDiscoverScrollEntry(path), undefined);
      }
    } finally {
      if (originalWindow)
        Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
