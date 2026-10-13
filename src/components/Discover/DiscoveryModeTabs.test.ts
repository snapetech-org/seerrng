import { describe, expect, it } from 'vitest';
import {
  discoveryMediaTypeForPath,
  safeSwipeReturnTo,
} from './DiscoveryModeTabs';

describe('discoveryMediaTypeForPath', () => {
  it.each([
    ['/discover/movies', 'movie'],
    ['/discover/movies/genre/18', 'movie'],
    ['/discover/tv/network/1', 'tv'],
    ['/discover/books', 'book'],
    ['/discover/audiobooks', 'audiobook'],
  ] as const)('identifies the media type for %s', (pathname, mediaType) => {
    expect(discoveryMediaTypeForPath(pathname)).toBe(mediaType);
  });

  it.each(['/discover', '/discover/magazines', '/discover/movieshelf'])(
    'does not add Swipe to unrelated route %s',
    (pathname) => {
      expect(discoveryMediaTypeForPath(pathname)).toBeUndefined();
    }
  );
});

describe('safeSwipeReturnTo', () => {
  it.each([
    '/discover/movies?sortBy=popularity.desc',
    '/discover/tv/genre/18?language=en',
    '/discover/books?format=all',
    '/discover/audiobooks?search=mystery',
  ])('preserves in-app discovery context for %s', (returnTo) => {
    expect(safeSwipeReturnTo(returnTo)).toBe(returnTo);
  });

  it.each([
    'https://example.com/discover/movies',
    '//example.com/discover/movies',
    '/swipe',
    '/settings',
    '/discover/unknown',
    '/\\example.com/discover/movies',
  ])('rejects unsafe or unrelated destination %s', (returnTo) => {
    expect(safeSwipeReturnTo(returnTo)).toBeUndefined();
  });
});
