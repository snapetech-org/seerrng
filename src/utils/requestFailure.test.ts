import { MediaRequestFailureReason, MediaType } from '@server/constants/media';
import { expect, it } from 'vitest';
import {
  getRequestFailureDescriptionId,
  getRequestFailureInfo,
  getRequestFailureSearchHref,
} from './requestFailure';

it('keeps failure explanations inside the allow-listed reason set', () => {
  expect(
    getRequestFailureInfo(MediaRequestFailureReason.TVDB_SEASON_MISMATCH)
  ).toEqual({
    messageKey: 'requestFailureTvdbSeasonMismatch',
    retryUnavailable: true,
    findAnotherListing: true,
  });
  expect(getRequestFailureInfo('raw provider response')).toBeNull();
  expect(getRequestFailureInfo(undefined)).toBeNull();
});

it('offers an alternate search only for a TV season mismatch with a title', () => {
  const reason = MediaRequestFailureReason.TVDB_SEASON_MISMATCH;

  expect(
    getRequestFailureSearchHref(reason, MediaType.TV, '  The Office  ')
  ).toBe('/search?query=The%20Office&type=tv');
  expect(
    getRequestFailureSearchHref(reason, MediaType.MOVIE, 'The Office')
  ).toBe(undefined);
  expect(getRequestFailureSearchHref(reason, MediaType.TV, '  ')).toBe(
    undefined
  );
  expect(
    getRequestFailureSearchHref(
      MediaRequestFailureReason.DISPATCH_FAILED,
      MediaType.TV,
      'The Office'
    )
  ).toBe(undefined);
});

it('names failure descriptions by request surface to avoid duplicate IDs', () => {
  expect(getRequestFailureDescriptionId(42, 'request-card')).toBe(
    'request-failure-reason-request-card-42'
  );
  expect(getRequestFailureDescriptionId(42, 'request-list')).not.toBe(
    getRequestFailureDescriptionId(42, 'request-card')
  );
});
