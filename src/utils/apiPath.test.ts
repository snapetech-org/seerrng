import { expect, it } from 'vitest';
import { encodeApiPathSegment, getBookRouteId } from './apiPath';

it('retains Open Library route normalization', () => {
  expect(
    getBookRouteId([{ provider: 'openlibrary', value: '/works/ol123w' }])
  ).toBe('OL123W');
});
it('preserves service zero and case-sensitive provider-scoped book identity', () => {
  const id = 'bookshelf:0:aGM6NDQ2Njgw';
  expect(
    getBookRouteId([
      { provider: 'readarr', value: 'hc:446680' },
      { provider: 'bookshelf', value: id },
    ])
  ).toBe(id);
  expect(
    encodeApiPathSegment(
      getBookRouteId([{ provider: 'bookshelf', value: id }])!
    )
  ).toBe('bookshelf%3A0%3AaGM6NDQ2Njgw');
});
it('does not turn an unscoped backend-local or unrelated identifier into a book route', () => {
  expect(
    getBookRouteId([{ provider: 'readarr', value: '101' }])
  ).toBeUndefined();
  expect(
    getBookRouteId([{ provider: 'comicvine', value: '123' }])
  ).toBeUndefined();
  expect(getBookRouteId()).toBeUndefined();
});
it('preserves the established first routable identifier when aliases coexist', () => {
  expect(
    getBookRouteId([
      { provider: 'bookshelf', value: 'bookshelf:1:NDI3NTc4' },
      { provider: 'openlibrary', value: 'OL1W' },
    ])
  ).toBe('bookshelf:1:NDI3NTc4');
});
