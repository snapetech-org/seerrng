import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import Media from '@server/entity/Media';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasAvailableBookFormat,
  isActiveBookFormatRequest,
  isRequestedBookFormatAvailable,
} from './bookAvailability';

const bookMedia = (overrides: Partial<Media> = {}) =>
  new Media({
    mediaType: MediaType.BOOK,
    tmdbId: 0,
    status: MediaStatus.AVAILABLE,
    status4k: MediaStatus.UNKNOWN,
    ...overrides,
  });

test('book availability follows the selected format', () => {
  const ebookOnly = bookMedia({
    serviceId: 1,
    externalServiceId: 10,
    availableEbookServiceIds: [1],
  });

  assert.equal(hasAvailableBookFormat(ebookOnly, 'ebook'), true);
  assert.equal(hasAvailableBookFormat(ebookOnly, 'audiobook'), false);
  assert.equal(isRequestedBookFormatAvailable(ebookOnly, 'ebook'), true);
  assert.equal(isRequestedBookFormatAvailable(ebookOnly, 'audiobook'), false);
  assert.equal(isRequestedBookFormatAvailable(ebookOnly, 'both'), false);

  const both = bookMedia({
    serviceId: 1,
    externalServiceId: 10,
    audiobookServiceId: 2,
    audiobookExternalServiceId: 20,
    availableEbookServiceIds: [1],
    availableAudiobookServiceIds: [2],
  });
  assert.equal(isRequestedBookFormatAvailable(both, 'both'), true);
});

test('a service link alone does not make a processing book available', () => {
  const processing = bookMedia({
    status: MediaStatus.PROCESSING,
    serviceId: 1,
    externalServiceId: 10,
    audiobookServiceId: 2,
    audiobookExternalServiceId: 20,
  });

  assert.equal(isRequestedBookFormatAvailable(processing, 'ebook'), false);
  assert.equal(isRequestedBookFormatAvailable(processing, 'audiobook'), false);
  assert.equal(isRequestedBookFormatAvailable(processing, 'both'), false);
});

test('Audiobookshelf library presence satisfies audiobook requests only', () => {
  const audiobookOnly = bookMedia({
    audiobookLibraryServiceId: 1,
    audiobookLibraryItemId: 'li_audiobook_1',
  });

  assert.equal(hasAvailableBookFormat(audiobookOnly, 'audiobook'), true);
  assert.equal(hasAvailableBookFormat(audiobookOnly, 'ebook'), false);
  assert.equal(isRequestedBookFormatAvailable(audiobookOnly, 'both'), false);
});

test('manager records never provide file evidence, even with global availability', () => {
  const media = bookMedia({
    serviceId: 0,
    externalServiceId: 10,
    audiobookServiceId: 2,
    audiobookExternalServiceId: 20,
    availableEbookServiceIds: [0],
  });
  assert.equal(hasAvailableBookFormat(media, 'ebook'), true);
  assert.equal(hasAvailableBookFormat(media, 'audiobook'), false);
  assert.equal(isRequestedBookFormatAvailable(media, 'both'), false);
  media.availableEbookServiceIds = [];
  assert.equal(hasAvailableBookFormat(media, 'ebook'), false);
});

test('partial library state retains only formats backed by actual files', () => {
  const media = bookMedia({
    status: MediaStatus.PARTIALLY_AVAILABLE,
    availableEbookServiceIds: [0],
    audiobookServiceId: 1,
    audiobookExternalServiceId: 10,
  });
  assert.equal(hasAvailableBookFormat(media, 'ebook'), true);
  assert.equal(hasAvailableBookFormat(media, 'audiobook'), false);
});
test('provider handoff remains requested while acquiring files, without blocking a different missing format', () => {
  const request = {
    status: MediaRequestStatus.COMPLETED,
    bookFormat: 'audiobook' as const,
    serviceTargets: [
      {
        serviceType: 'readarr' as const,
        format: 'audiobook' as const,
        status: MediaStatus.PROCESSING,
      },
    ],
  };
  assert.equal(isActiveBookFormatRequest(request, 'audiobook'), true);
  assert.equal(isActiveBookFormatRequest(request, 'ebook'), false);
  assert.equal(
    isActiveBookFormatRequest(
      { ...request, status: MediaRequestStatus.DECLINED },
      'audiobook'
    ),
    false
  );
  assert.equal(
    isActiveBookFormatRequest(
      {
        ...request,
        serviceTargets: [
          { ...request.serviceTargets[0], status: MediaStatus.AVAILABLE },
        ],
      },
      'audiobook'
    ),
    false
  );
});
