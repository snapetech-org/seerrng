import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
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
  begin() {
    return this.startRun();
  }
  finish(sessionId: string) {
    this.endRun(sessionId);
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

// A shared book row is linked to an ebook server and an audiobook server, and a
// scan processes both. The idle server's pass must not downgrade the status the
// busy server's pass reported.
const requestBook = async (bookFormat: 'ebook' | 'audiobook') => {
  const media = await read();
  const requestedBy = await getRepository(User).findOneOrFail({
    where: { email: 'friend@seerr.dev' },
  });
  // Insert without listeners so the request dispatch queue stays out of the scan.
  await getRepository(MediaRequest)
    .createQueryBuilder()
    .insert()
    .values({
      type: MediaType.BOOK,
      status: MediaRequestStatus.APPROVED,
      media,
      requestedBy,
      is4k: false,
      bookFormat,
    })
    .callListeners(false)
    .execute();
  await getRepository(Media)
    .createQueryBuilder()
    .update()
    .set({ status: MediaStatus.PROCESSING })
    .where('id = :id', { id: media.id })
    .callListeners(false)
    .execute();
};
const ebookIdle = {
  bookServiceType: 'ebook',
  serviceId: 0,
  externalServiceId: 10,
  hasFile: false,
  processing: false,
} as const;
const audiobookBusy = {
  bookServiceType: 'audiobook',
  serviceId: 1,
  externalServiceId: 20,
  hasFile: false,
  processing: true,
} as const;
const runScan = async (
  scanner: BookScanner,
  passes: ProcessOptions[],
  afterEachPass?: (media: Media) => void
): Promise<void> => {
  const sessionId = scanner.begin();
  assert.ok(sessionId);
  try {
    for (const pass of passes) {
      await scanner.scan(pass);
      afterEachPass?.(await read());
    }
  } finally {
    scanner.finish(sessionId);
  }
};

for (const order of ['ebook first', 'audiobook first'] as const)
  it(`an idle ebook server cannot downgrade an audiobook-only request being processed (${order})`, async () => {
    const scanner = new BookScanner();
    await runScan(scanner, [audiobookBusy, ebookIdle]);
    await requestBook('audiobook');
    for (let i = 0; i < 3; i++) {
      await runScan(
        scanner,
        order === 'ebook first'
          ? [ebookIdle, audiobookBusy]
          : [audiobookBusy, ebookIdle],
        (media) => assert.equal(media.status, MediaStatus.PROCESSING)
      );
    }
    // Stopping the audiobook search is not hidden by the ebook pass.
    await runScan(scanner, [
      ebookIdle,
      { ...audiobookBusy, processing: false },
    ]);
    assert.equal((await read()).status, MediaStatus.UNKNOWN);
  });

it('the book becomes available when the audiobook file appears', async () => {
  const scanner = new BookScanner();
  await runScan(scanner, [audiobookBusy, ebookIdle]);
  await requestBook('audiobook');
  await runScan(scanner, [
    ebookIdle,
    { ...audiobookBusy, hasFile: true, processing: false },
  ]);
  const media = await read();
  assert.equal(media.status, MediaStatus.AVAILABLE);
  assert.equal(isRequestedBookFormatAvailable(media, 'audiobook'), true);
});

it('an ebook-only request still goes unknown when nothing is processing', async () => {
  const scanner = new BookScanner();
  await runScan(scanner, [audiobookBusy, ebookIdle]);
  await requestBook('ebook');
  await runScan(scanner, [ebookIdle, { ...audiobookBusy, processing: false }]);
  assert.equal((await read()).status, MediaStatus.UNKNOWN);
});
