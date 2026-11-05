import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import BinderyAPI, { type BinderyBook } from '@server/api/bindery';
import OpenLibraryAPI from '@server/api/openlibrary';
import type { ReadarrBook, ReadarrEdition } from '@server/api/servarr/readarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import type { ReadarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';

let getBooksImpl: () => Promise<ReadarrBook[]> = async () => [];
let getBooksCallCount = 0;
let getEditionsImpl: (
  bookId: number
) => Promise<ReadarrEdition[]> = async () => [];
let getEditionsCallCount = 0;
Object.defineProperty(ReadarrAPI.prototype, 'getBooks', {
  set() {},
  get() {
    return async () => {
      getBooksCallCount += 1;
      return getBooksImpl();
    };
  },
  configurable: true,
});
Object.defineProperty(ReadarrAPI.prototype, 'getEditions', {
  set() {},
  get() {
    return async (bookId: number) => {
      getEditionsCallCount += 1;
      return getEditionsImpl(bookId);
    };
  },
  configurable: true,
});

import { readarrScanner } from '@server/lib/scanners/readarr';

setupTestDb();

function configureReadarr(overrides: Partial<ReadarrSettings>[] = [{}]): void {
  const settings = getSettings();
  settings.readarr = overrides.map((o, i) => ({
    id: i,
    name: `Readarr ${i}`,
    hostname: 'localhost',
    port: 8787,
    apiKey: 'test-key',
    baseUrl: '',
    useSsl: false,
    activeProfileId: 1,
    activeMetadataProfileId: 1,
    activeDirectory: '/books',
    isDefault: i === 0,
    syncEnabled: true,
    preventSearch: false,
    externalUrl: '',
    tags: [],
    serviceType: 'ebook',
    ...o,
  })) as ReadarrSettings[];
}

function fakeReadarrBook(overrides: Partial<ReadarrBook> = {}): ReadarrBook {
  return {
    id: 1,
    title: 'Test Book',
    foreignBookId: 'readarr-book-id',
    titleSlug: 'test-book',
    monitored: true,
    added: '2024-01-01T00:00:00Z',
    editions: [
      {
        foreignEditionId: 'edition-id',
        title: 'Test Book',
        isbn13: '9780000000001',
        monitored: true,
      },
    ],
    statistics: {
      bookFileCount: 1,
      totalBookCount: 1,
    },
    ...overrides,
  };
}

async function seedBook(identifier: string, status = MediaStatus.PROCESSING) {
  const media = await getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status,
      status4k: MediaStatus.UNKNOWN,
      identifiers: [
        new MediaIdentifier({
          provider: MediaIdentifierProvider.ISBN,
          value: identifier,
          canonical: true,
        }),
      ],
    })
  );

  return media;
}

describe('Readarr Scanner', () => {
  beforeEach(() => {
    mock.restoreAll();
    mock.method(OpenLibraryAPI.prototype, 'searchBooks', async () => ({
      numFound: 0,
      start: 0,
      docs: [],
    }));
    mock.method(OpenLibraryAPI.prototype, 'getEdition', async () => {
      throw new Error('Edition not found');
    });
    getBooksImpl = async () => [];
    getBooksCallCount = 0;
    getEditionsImpl = async () => [];
    getEditionsCallCount = 0;
  });

  for (const serviceType of ['ebook', 'audiobook'] as const) {
    for (const hasIsbn of [false, true]) {
      it(`retains a catalog request media record when scanning ${serviceType} with ISBN=${hasIsbn}`, async () => {
        const requested = await getRepository(Media).save(
          new Media({
            tmdbId: 0,
            mediaType: MediaType.BOOK,
            status: MediaStatus.PROCESSING,
            status4k: MediaStatus.UNKNOWN,
            identifiers: [
              new MediaIdentifier({
                provider: MediaIdentifierProvider.BOOKSHELF,
                value: makeBookshelfBookId(1, '30'),
                canonical: true,
              }),
            ],
          })
        );
        configureReadarr([{ id: 1, serviceType }]);
        getBooksImpl = async () => [
          fakeReadarrBook({
            id: 31,
            foreignBookId: '30',
            editions: [
              {
                foreignEditionId: '41',
                title: 'Test Book',
                monitored: true,
                ...(hasIsbn ? { isbn13: '9780306406157' } : {}),
              },
            ],
          }),
        ];
        await readarrScanner.run();
        const media = await getRepository(Media).find({
          where: { mediaType: MediaType.BOOK },
        });
        assert.strictEqual(media.length, 1);
        assert.strictEqual(media[0].id, requested.id);
        assert.strictEqual(media[0].status, MediaStatus.AVAILABLE);
        assert.strictEqual(
          serviceType === 'ebook'
            ? media[0].externalServiceId
            : media[0].audiobookExternalServiceId,
          31
        );
      });
    }
  }

  it('does not claim a catalog identity belonging to a different server', async () => {
    const other = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
        identifiers: [
          new MediaIdentifier({
            provider: MediaIdentifierProvider.BOOKSHELF,
            value: makeBookshelfBookId(2, '30'),
            canonical: true,
          }),
        ],
      })
    );
    configureReadarr([{ id: 1 }]);
    getBooksImpl = async () => [
      fakeReadarrBook({ id: 31, foreignBookId: '30', editions: [] }),
    ];
    await readarrScanner.run();
    const unchanged = await getRepository(Media).findOneByOrFail({
      id: other.id,
    });
    assert.strictEqual(unchanged.externalServiceId, null);
    assert.strictEqual(
      await getRepository(Media).count({
        where: { mediaType: MediaType.BOOK },
      }),
      2
    );
  });

  it('resets PROCESSING to UNKNOWN when a book is not in any Readarr server', async () => {
    await seedBook('9780000000002');

    configureReadarr([{ syncEnabled: true }]);
    getBooksImpl = async () => [];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.status, MediaStatus.UNKNOWN);
  });

  it('keeps AVAILABLE books available when missing from Readarr', async () => {
    await seedBook('9780000000003', MediaStatus.AVAILABLE);

    configureReadarr([{ syncEnabled: true }]);
    getBooksImpl = async () => [];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
  });

  it('scans imported Bindery ebook and audiobook records into shared book availability', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
        identifiers: [
          new MediaIdentifier({
            provider: MediaIdentifierProvider.OPENLIBRARY,
            value: 'OL123W',
            canonical: true,
          }),
          new MediaIdentifier({
            provider: MediaIdentifierProvider.ISBN,
            value: '9780000000001',
          }),
        ],
      })
    );
    configureReadarr([
      { backend: 'bindery', serviceType: 'both', syncEnabled: true },
    ]);
    mock.method(
      BinderyAPI.prototype,
      'getPrimaryMetadataProvider',
      async () => 'openlibrary'
    );
    const scannedFormats: string[] = [];
    mock.method(
      BinderyAPI.prototype,
      'getImportedBooks',
      async (format: 'ebook' | 'audiobook') => {
        scannedFormats.push(format);
        return [
          {
            id: 55,
            foreignBookId: 'OL123W',
            title: 'Test Book',
            mediaType: format,
            isbns: ['9780000000001'],
          } satisfies BinderyBook,
        ];
      }
    );

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.deepEqual(scannedFormats, ['ebook', 'audiobook']);
    assert.equal(updated.status, MediaStatus.AVAILABLE);
    assert.equal(updated.serviceId, 0);
    assert.equal(updated.externalServiceId, 55);
    assert.equal(updated.audiobookServiceId, 0);
    assert.equal(updated.audiobookExternalServiceId, 55);
  });

  it('matches Bindery ISBN-provider book IDs as ISBN identities', async () => {
    const media = await seedBook('9780000000001');
    configureReadarr([
      { backend: 'bindery', serviceType: 'ebook', syncEnabled: true },
    ]);
    mock.method(
      BinderyAPI.prototype,
      'getPrimaryMetadataProvider',
      async () => 'isbn'
    );
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => [
      {
        id: 56,
        foreignBookId: '9780000000001',
        title: 'Test Book',
      } satisfies BinderyBook,
    ]);

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updated.status, MediaStatus.AVAILABLE);
    assert.equal(updated.serviceId, 0);
    assert.equal(updated.externalServiceId, 56);
  });

  it('skips orphan cleanup when any Readarr server has sync disabled', async () => {
    await seedBook('9780000000004');

    configureReadarr([
      { syncEnabled: true, id: 0, hostname: 'server-a' },
      { syncEnabled: false, id: 1, hostname: 'server-b' },
    ]);
    getBooksImpl = async () => [];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.status, MediaStatus.PROCESSING);
  });

  it('resets PROCESSING to UNKNOWN when a book is unmonitored with no files', async () => {
    await seedBook('9780000000005');

    configureReadarr([{ syncEnabled: true }]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        monitored: false,
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000005',
            monitored: false,
          },
        ],
        statistics: {
          bookFileCount: 0,
          totalBookCount: 1,
        },
      }),
    ];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.status, MediaStatus.UNKNOWN);
  });

  it('stores audiobook service data separately from ebook service data', async () => {
    const media = await seedBook('9780000000006');
    media.serviceId = 10;
    media.externalServiceId = 100;
    media.externalServiceSlug = 'ebook-slug';
    await getRepository(Media).save(media);

    configureReadarr([
      {
        id: 21,
        serviceType: 'audiobook',
        activeDirectory: '/audiobooks',
      },
    ]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        id: 210,
        titleSlug: 'audiobook-slug',
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000006',
            monitored: true,
          },
        ],
      }),
    ];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.serviceId, 10);
    assert.strictEqual(updated.externalServiceId, 100);
    assert.strictEqual(updated.externalServiceSlug, 'ebook-slug');
    assert.strictEqual(updated.audiobookServiceId, 21);
    assert.strictEqual(updated.audiobookExternalServiceId, 210);
    assert.strictEqual(updated.audiobookExternalServiceSlug, 'audiobook-slug');
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
  });

  it('stores ebook service data separately from audiobook service data', async () => {
    const media = await seedBook('9780000000009');
    media.audiobookServiceId = 21;
    media.audiobookExternalServiceId = 210;
    media.audiobookExternalServiceSlug = 'audiobook-slug';
    await getRepository(Media).save(media);

    configureReadarr([
      {
        id: 10,
        serviceType: 'ebook',
        activeDirectory: '/ebooks',
      },
    ]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        id: 110,
        titleSlug: 'ebook-slug',
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000009',
            monitored: true,
          },
        ],
      }),
    ];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.serviceId, 10);
    assert.strictEqual(updated.externalServiceId, 110);
    assert.strictEqual(updated.externalServiceSlug, 'ebook-slug');
    assert.strictEqual(updated.audiobookServiceId, 21);
    assert.strictEqual(updated.audiobookExternalServiceId, 210);
    assert.strictEqual(updated.audiobookExternalServiceSlug, 'audiobook-slug');
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
  });

  it('uses audiobook file statistics instead of aggregate availability', async () => {
    configureReadarr([
      {
        id: 31,
        serviceType: 'audiobook',
        activeDirectory: '/audiobooks',
      },
    ]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000010',
            monitored: true,
          },
        ],
        statistics: {
          bookFileCount: 1,
          ebookFileCount: 1,
          audiobookFileCount: 0,
          totalBookCount: 1,
        },
      }),
    ];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.status, MediaStatus.PROCESSING);
    assert.strictEqual(updated.audiobookServiceId, 31);
    assert.strictEqual(updated.serviceId, null);
  });

  it('uses ebook file statistics when the aggregate count is zero', async () => {
    configureReadarr([
      {
        id: 32,
        serviceType: 'ebook',
        activeDirectory: '/ebooks',
      },
    ]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000011',
            monitored: true,
          },
        ],
        statistics: {
          bookFileCount: 0,
          ebookFileCount: 1,
          audiobookFileCount: 0,
          totalBookCount: 1,
        },
      }),
    ];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    assert.strictEqual(updated.serviceId, 32);
    assert.strictEqual(updated.audiobookServiceId, null);
  });

  it('keeps an available ebook available while audiobook is still processing', async () => {
    const media = await seedBook('9780000000007', MediaStatus.AVAILABLE);
    media.serviceId = 10;
    media.externalServiceId = 100;
    media.externalServiceSlug = 'ebook-slug';
    await getRepository(Media).save(media);

    configureReadarr([
      {
        id: 21,
        serviceType: 'audiobook',
        activeDirectory: '/audiobooks',
      },
    ]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        id: 210,
        titleSlug: 'audiobook-slug',
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000007',
            monitored: true,
          },
        ],
        statistics: {
          bookFileCount: 0,
          totalBookCount: 1,
        },
      }),
    ];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(updated.serviceId, 10);
    assert.strictEqual(updated.externalServiceId, 100);
    assert.strictEqual(updated.audiobookServiceId, 21);
    assert.strictEqual(updated.audiobookExternalServiceId, 210);
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
  });

  it('scans ebook and audiobook services separately when they share an endpoint', async () => {
    await seedBook('9780000000008');

    configureReadarr([
      {
        id: 10,
        serviceType: 'ebook',
        activeDirectory: '/ebooks',
      },
      {
        id: 21,
        serviceType: 'audiobook',
        activeDirectory: '/audiobooks',
      },
    ]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        id: 210,
        titleSlug: 'shared-endpoint-book',
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000008',
            monitored: true,
          },
        ],
      }),
    ];

    await readarrScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { mediaType: MediaType.BOOK },
    });
    assert.strictEqual(getBooksCallCount, 2);
    assert.strictEqual(updated.serviceId, 10);
    assert.strictEqual(updated.externalServiceId, 210);
    assert.strictEqual(updated.audiobookServiceId, 21);
    assert.strictEqual(updated.audiobookExternalServiceId, 210);
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
  });

  it('hydrates missing Bookshelf editions and stores normalized ISBN identifiers', async () => {
    configureReadarr([{ syncEnabled: true }]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        editions: [],
      }),
    ];
    getEditionsImpl = async () => [
      {
        foreignEditionId: 'edition-id',
        title: 'Test Book',
        isbn13: '978-0-000-00000-2',
        monitored: true,
      },
    ];

    await readarrScanner.run();

    const identifiers = await getRepository(MediaIdentifier).find({
      where: {
        provider: MediaIdentifierProvider.ISBN,
        value: '9780000000002',
      },
      relations: { media: true },
    });

    assert.strictEqual(getEditionsCallCount, 1);
    assert.strictEqual(identifiers.length, 1);
    assert.strictEqual(identifiers[0].media.mediaType, MediaType.BOOK);
  });

  it('replaces an orphaned identifier instead of failing the book scan', async () => {
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        provider: MediaIdentifierProvider.READARR,
        value: 'orphaned-readarr-book',
        canonical: false,
      })
    );
    configureReadarr([{ syncEnabled: true }]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        foreignBookId: 'orphaned-readarr-book',
        editions: [],
      }),
    ];

    await readarrScanner.run();

    const identifiers = await getRepository(MediaIdentifier).find({
      where: {
        provider: MediaIdentifierProvider.READARR,
        value: 'orphaned-readarr-book',
      },
      relations: { media: true },
    });

    assert.strictEqual(identifiers.length, 1);
    assert.strictEqual(identifiers[0].media.mediaType, MediaType.BOOK);
  });

  it('does not attach a secondary Bookshelf identifier already linked to another book', async () => {
    const isbnMedia = await seedBook('9780000000009');
    const readarrMedia = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
        identifiers: [
          new MediaIdentifier({
            provider: MediaIdentifierProvider.READARR,
            value: 'readarr-duplicate',
            canonical: true,
          }),
        ],
      })
    );

    configureReadarr([{ syncEnabled: true }]);
    getBooksImpl = async () => [
      fakeReadarrBook({
        foreignBookId: 'readarr-duplicate',
        editions: [
          {
            foreignEditionId: 'edition-id',
            title: 'Test Book',
            isbn13: '9780000000009',
            monitored: true,
          },
        ],
      }),
    ];

    await readarrScanner.run();

    const readarrIdentifiers = await getRepository(MediaIdentifier).find({
      where: {
        provider: MediaIdentifierProvider.READARR,
        value: 'readarr-duplicate',
      },
      relations: { media: true },
    });
    const updatedIsbnMedia = await getRepository(Media).findOneOrFail({
      where: { id: isbnMedia.id },
    });

    assert.strictEqual(readarrIdentifiers.length, 1);
    assert.strictEqual(readarrIdentifiers[0].media.id, readarrMedia.id);
    assert.strictEqual(updatedIsbnMedia.externalServiceSlug, 'test-book');
  });
});
