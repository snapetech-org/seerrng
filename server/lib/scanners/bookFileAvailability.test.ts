import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import {
  hasAvailableBookFormat,
  isRequestedBookFormatAvailable,
} from '@server/lib/bookAvailability';
import BaseScanner, {
  type ProcessOptions,
} from '@server/lib/scanners/baseScanner';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { it } from 'node:test';
class BookScanner extends BaseScanner<never> {
  constructor() {
    super('Book format proof');
  }
  scan(options: ProcessOptions) {
    return this.processBook(MediaIdentifierProvider.ISBN, '9780261103573', {
      title: 'Format proof',
      ...options,
    });
  }
}
setupTestDb();
const read = () =>
  getRepository(Media).findOneByOrFail({ mediaType: MediaType.BOOK });
it('persists independent imported ebook and audiobook evidence through pending scans and removals', async () => {
  const scanner = new BookScanner();
  await scanner.scan({
    bookServiceType: 'ebook',
    serviceId: 0,
    externalServiceId: 10,
    hasFile: false,
    processing: true,
  });
  await scanner.scan({
    bookServiceType: 'audiobook',
    serviceId: 1,
    externalServiceId: 20,
    hasFile: false,
    processing: true,
  });
  let media = await read();
  assert.equal(media.status, MediaStatus.PROCESSING);
  assert.equal(hasAvailableBookFormat(media, 'ebook'), false);
  assert.equal(hasAvailableBookFormat(media, 'audiobook'), false);
  await scanner.scan({
    bookServiceType: 'ebook',
    serviceId: 0,
    externalServiceId: 10,
    hasFile: true,
  });
  await scanner.scan({
    bookServiceType: 'audiobook',
    serviceId: 1,
    externalServiceId: 20,
    hasFile: false,
    processing: true,
  });
  media = await read();
  assert.equal(media.status, MediaStatus.AVAILABLE);
  assert.deepEqual(media.availableEbookServiceIds, [0]);
  assert.deepEqual(media.availableAudiobookServiceIds, []);
  assert.equal(isRequestedBookFormatAvailable(media, 'both'), false);
  await scanner.scan({
    bookServiceType: 'audiobook',
    serviceId: 1,
    externalServiceId: 20,
    hasFile: true,
  });
  assert.equal(isRequestedBookFormatAvailable(await read(), 'both'), true);
  await scanner.scan({
    bookServiceType: 'ebook',
    serviceId: 0,
    externalServiceId: 10,
    hasFile: false,
    processing: true,
  });
  media = await read();
  assert.equal(hasAvailableBookFormat(media, 'ebook'), false);
  assert.equal(hasAvailableBookFormat(media, 'audiobook'), true);
  await scanner.scan({
    bookServiceType: 'audiobook',
    serviceId: 1,
    externalServiceId: 20,
    hasFile: false,
  });
  media = await read();
  assert.equal(media.status, MediaStatus.UNKNOWN);
  assert.deepEqual(media.availableEbookServiceIds, []);
  assert.deepEqual(media.availableAudiobookServiceIds, []);
});
it('one pending destination cannot erase an imported copy on another destination', async () => {
  const scanner = new BookScanner();
  await scanner.scan({ serviceId: 0, externalServiceId: 10, hasFile: true });
  await scanner.scan({
    serviceId: 2,
    externalServiceId: 30,
    hasFile: false,
    processing: true,
  });
  const media = await read();
  assert.equal(media.serviceId, 2);
  assert.deepEqual(media.availableEbookServiceIds, [0]);
  assert.equal(hasAvailableBookFormat(media, 'ebook'), true);
});
for (const source of ['audiobookshelf', 'plex'] as const)
  it(`a missing manager file cannot erase independently scanned ${source} audio`, async () => {
    const scanner = new BookScanner();
    await scanner.scan({
      bookServiceType: 'audiobook',
      hasFile: true,
      ...(source === 'plex'
        ? { ratingKey: '123' }
        : { audiobookLibrarySource: { serviceId: 0, itemId: 'li_fixture' } }),
    });
    await scanner.scan({
      bookServiceType: 'audiobook',
      serviceId: 1,
      externalServiceId: 20,
      hasFile: false,
      processing: true,
    });
    const media = await read();
    assert.equal(media.status, MediaStatus.AVAILABLE);
    assert.equal(hasAvailableBookFormat(media, 'audiobook'), true);
    assert.deepEqual(media.availableAudiobookServiceIds, []);
  });

it('an incomplete file observation preserves a previously confirmed copy', async () => {
  const scanner = new BookScanner();
  await scanner.scan({ serviceId: 0, externalServiceId: 10, hasFile: true });
  await scanner.scan({
    serviceId: 0,
    externalServiceId: 10,
    hasFile: false,
    bookFileObservationKnown: false,
    processing: true,
  });
  assert.equal(hasAvailableBookFormat(await read(), 'ebook'), true);
});
