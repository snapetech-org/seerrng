import { MediaRequestStatus } from '@server/constants/media';
import BookRequestSearch from '@server/entity/BookRequestSearch';
import MediaRequest from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import requestDispatchManager from '@server/lib/requestDispatch';
import {
  RequestStatusStage,
  getRequestStatus,
} from '@server/lib/requestStatus';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import BinderyAPI, { type BinderyBook } from '@server/api/bindery';
import BookOrbitAPI from '@server/api/bookorbit';
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
let knownDialect: 'hc' | 'gr' | undefined;
let getEditionsImpl: (
  bookId: number
) => Promise<ReadarrEdition[]> = async () => [];
let getEditionsCallCount = 0;
Object.defineProperty(ReadarrAPI.prototype, 'getBooks', {
  set() {},
  get() {
    return async () => {
      getBooksCallCount += 1;
      if (knownDialect)
        Object.assign(this, {
          chaptarrDialect: knownDialect,
          chaptarrCapabilities: {
            contract: 'chaptarrng-seerr-bookshelf',
            contractVersion: 1,
            providerIdDialect: knownDialect,
            features: { formatScopedFacade: true },
          },
        });
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
  for (const serviceType of ['ebook', 'audiobook'] as const) {
    it(`keeps downloaded unmonitored ${serviceType} books available`, async () => {
      configureReadarr([{ serviceType }]);
      getBooksImpl = async () => [
        fakeReadarrBook({
          monitored: false,
          editions: [
            {
              foreignEditionId: 'edition-id',
              title: 'Test Book',
              isbn13: '9780306406157',
              asin: 'b012345678',
              monitored: false,
            },
          ],
          statistics: {
            bookFileCount: 0,
            ebookFileCount: serviceType === 'ebook' ? 1 : 0,
            audiobookFileCount: serviceType === 'audiobook' ? 1 : 0,
            totalBookCount: 1,
          },
        }),
      ];
      await readarrScanner.run();
      const media = await getRepository(Media).findOneOrFail({
        where: { mediaType: MediaType.BOOK },
      });
      assert.strictEqual(media.status, MediaStatus.AVAILABLE);
      assert.strictEqual(
        serviceType === 'ebook'
          ? media.externalServiceId
          : media.audiobookExternalServiceId,
        1
      );
      assert.ok(
        await getRepository(MediaIdentifier).findOneBy({
          provider: MediaIdentifierProvider.ASIN,
          value: 'B012345678',
          media: { id: media.id },
        })
      );
    });
  }

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
    knownDialect = undefined;
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

  it('scans BookOrbit content files by format and supported work identifiers', async () => {
    const media = await seedBook('9780306406157', MediaStatus.UNKNOWN);
    configureReadarr([
      {
        backend: 'bookorbit',
        bookorbitUsername: 'requester',
        serviceType: 'both',
        syncEnabled: true,
      },
    ]);
    const formats: string[] = [];
    mock.method(
      BookOrbitAPI.prototype,
      'getImportedBooks',
      async (format: 'ebook' | 'audiobook') => {
        formats.push(format);
        return [
          {
            id: 55,
            title: 'Test Book',
            authors: ['Writer'],
            isbn13: '9780306406157',
            files: [
              {
                id: format === 'ebook' ? 8 : 9,
                format: format === 'ebook' ? 'epub' : 'm4b',
                role: 'content',
              },
            ],
          },
        ];
      }
    );
    await readarrScanner.run();
    const updated = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.deepEqual(formats, ['ebook', 'audiobook']);
    assert.equal(updated.status, MediaStatus.AVAILABLE);
    assert.equal(updated.externalServiceId, 55);
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
    media.availableEbookServiceIds = [10];
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
    media.availableEbookServiceIds = [10];
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
  it('preserves confirmed files when an item metadata failure makes the scan incomplete', async () => {
    const media = await seedBook('9780261103573', MediaStatus.AVAILABLE);
    media.serviceId = 10;
    media.externalServiceId = 100;
    media.availableEbookServiceIds = [10];
    await getRepository(Media).save(media);
    configureReadarr([{ id: 10, serviceType: 'ebook' }]);
    getBooksImpl = async () => [fakeReadarrBook({ editions: [] })];
    getEditionsImpl = async () => {
      throw new Error('fixture metadata unavailable');
    };
    await readarrScanner.run();
    const updated = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updated.status, MediaStatus.AVAILABLE);
    assert.deepEqual(updated.availableEbookServiceIds, [10]);
  });
  for (const format of ['ebook', 'audiobook'] as const)
    it(`upgrade split rows preserve ${format} requests while recording inventory on the catalog row`, async () => {
      const current = format === 'ebook' ? 0 : 1;
      const other = 1 - current;
      const field =
        format === 'ebook'
          ? 'availableEbookServiceIds'
          : 'availableAudiobookServiceIds';
      const requested = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.UNKNOWN,
          status4k: MediaStatus.UNKNOWN,
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.BOOKSHELF,
              value: makeBookshelfBookId(current, '427578'),
              canonical: true,
            }),
          ],
        })
      );
      await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
          [field]: [current],
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.BOOKSHELF,
              value: makeBookshelfBookId(other, '427578'),
              canonical: true,
            }),
            new MediaIdentifier({
              provider: MediaIdentifierProvider.ISBN,
              value: '9780306406157',
              canonical: false,
            }),
          ],
        })
      );
      const requester = await getRepository(User).findOneByOrFail({ id: 1 });
      const history = await getRepository(MediaRequest).save(
        new MediaRequest({
          type: MediaType.BOOK,
          media: requested,
          requestedBy: requester,
          status: MediaRequestStatus.COMPLETED,
          is4k: false,
          bookFormat: format,
        })
      );
      configureReadarr([{ id: current, serviceType: format }]);
      knownDialect = 'hc';
      getBooksImpl = async () => [
        fakeReadarrBook({
          foreignBookId: '427578',
          editions: [
            {
              foreignEditionId: 'edition-1',
              title: 'Test Book',
              monitored: true,
              isbn13: '9780306406157',
            },
          ],
        }),
      ];
      await readarrScanner.run();
      const updated = await getRepository(Media).findOneByOrFail({
        id: requested.id,
      });
      assert.equal(updated.status, MediaStatus.AVAILABLE);
      assert.deepEqual(updated[field], [current]);
      assert.equal(
        (
          await getRepository(MediaRequest).findOneOrFail({
            where: { id: history.id },
            relations: { media: true },
          })
        ).media.id,
        requested.id
      );
      assert.equal(
        await getRepository(Media).count({
          where: { mediaType: MediaType.BOOK },
        }),
        2
      );
    });
  for (const format of ['ebook', 'audiobook'] as const)
    it(`upgrade single bare ${format} identity survives a qualified Hardcover scan`, async () => {
      const current = format === 'ebook' ? 0 : 1;
      const field =
        format === 'ebook'
          ? 'availableEbookServiceIds'
          : 'availableAudiobookServiceIds';
      const requested = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.UNKNOWN,
          status4k: MediaStatus.UNKNOWN,
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.BOOKSHELF,
              value: makeBookshelfBookId(current, '446680'),
              canonical: true,
            }),
          ],
        })
      );
      configureReadarr([{ id: current, serviceType: format }]);
      knownDialect = 'hc';
      getBooksImpl = async () => [
        fakeReadarrBook({
          foreignBookId: 'hc:446680',
          editions: [
            {
              foreignEditionId: 'edition-2',
              title: 'Test Book',
              monitored: true,
            },
          ],
        }),
      ];
      await readarrScanner.run();
      const updated = await getRepository(Media).findOneByOrFail({
        id: requested.id,
      });
      assert.equal(updated.status, MediaStatus.AVAILABLE);
      assert.deepEqual(updated[field], [current]);
      assert.equal(
        await getRepository(Media).count({
          where: { mediaType: MediaType.BOOK },
        }),
        1
      );
    });
  for (const format of ['ebook', 'audiobook'] as const)
    it(`keeps a requested ${format} row stored under the bare Readarr id processing`, async () => {
      const requested = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.PROCESSING,
          status4k: MediaStatus.UNKNOWN,
          ...(format === 'ebook'
            ? { serviceId: 0, externalServiceId: 132 }
            : { audiobookServiceId: 0, audiobookExternalServiceId: 132 }),
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.READARR,
              value: '431561',
              canonical: true,
            }),
            new MediaIdentifier({
              provider: MediaIdentifierProvider.ISBN,
              value: '9780000000011',
            }),
          ],
        })
      );
      configureReadarr([{ id: 0, serviceType: format }]);
      knownDialect = 'hc';
      // ChaptarrNG library reads are qualified now; the book is monitored
      // and still waiting for a release.
      getBooksImpl = async () => [
        fakeReadarrBook({
          id: 132,
          foreignBookId: 'hc:431561',
          monitored: true,
          editions: [
            { foreignEditionId: 'hc:9', title: 'Test Book', monitored: true },
          ],
          statistics: { bookFileCount: 0, totalBookCount: 1 },
        }),
      ];
      await readarrScanner.run();
      const updated = await getRepository(Media).findOneOrFail({
        where: { id: requested.id },
        relations: { identifiers: true },
      });
      assert.equal(updated.status, MediaStatus.PROCESSING);
      assert.equal(
        await getRepository(Media).count({
          where: { mediaType: MediaType.BOOK },
        }),
        1
      );
      assert.ok(
        updated.identifiers.some(
          (identifier) =>
            identifier.provider === MediaIdentifierProvider.READARR &&
            identifier.value === 'hc:431561'
        )
      );
    });
  it('keeps a bare-id row observed when only another server lists the work', async () => {
    // Requested from the audiobook server's catalog (bookshelf:1:<bare>); the
    // audiobook library cannot list the work, the ebook server tracks it.
    const requested = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
        serviceId: 0,
        externalServiceId: 273,
        audiobookServiceId: 1,
        audiobookExternalServiceId: 132,
        identifiers: [
          new MediaIdentifier({
            provider: MediaIdentifierProvider.BOOKSHELF,
            value: makeBookshelfBookId(1, '431561'),
            canonical: true,
          }),
          new MediaIdentifier({
            provider: MediaIdentifierProvider.READARR,
            value: '431561',
          }),
          new MediaIdentifier({
            provider: MediaIdentifierProvider.ISBN,
            value: '9780000000011',
          }),
        ],
      })
    );
    configureReadarr([
      { id: 0, serviceType: 'ebook' },
      { id: 1, serviceType: 'audiobook' },
    ]);
    knownDialect = 'hc';
    let call = 0;
    getBooksImpl = async () =>
      ++call === 1
        ? [
            fakeReadarrBook({
              id: 273,
              foreignBookId: 'hc:431561',
              monitored: true,
              editions: [
                {
                  foreignEditionId: 'hc:9',
                  title: 'Test Book',
                  monitored: true,
                },
              ],
              statistics: { bookFileCount: 0, totalBookCount: 1 },
            }),
          ]
        : [];
    await readarrScanner.run();
    assert.equal(
      (await getRepository(Media).findOneByOrFail({ id: requested.id })).status,
      MediaStatus.PROCESSING
    );
    assert.equal(
      await getRepository(Media).count({
        where: { mediaType: MediaType.BOOK },
      }),
      1
    );
  });
  it('upgrade aliases receive and lose only the currently verified ebook file evidence', async () => {
    configureReadarr([{ id: 0, serviceType: 'ebook' }]);
    knownDialect = 'hc';
    const rows = [];
    for (const id of ['427578', 'hc:427578'])
      rows.push(
        await getRepository(Media).save(
          new Media({
            tmdbId: 0,
            mediaType: MediaType.BOOK,
            status: MediaStatus.UNKNOWN,
            status4k: MediaStatus.UNKNOWN,
            availableAudiobookServiceIds: [9],
            identifiers: [
              new MediaIdentifier({
                provider: MediaIdentifierProvider.BOOKSHELF,
                value: makeBookshelfBookId(0, id),
                canonical: true,
              }),
            ],
          })
        )
      );
    let count = 1;
    getBooksImpl = async () => [
      fakeReadarrBook({
        foreignBookId: '427578',
        editions: [
          { foreignEditionId: 'e', title: 'Test Book', monitored: true },
        ],
        statistics: { bookFileCount: count, totalBookCount: 1 },
      }),
    ];
    await readarrScanner.run();
    for (const row of rows)
      assert.deepEqual(
        (await getRepository(Media).findOneByOrFail({ id: row.id }))
          .availableEbookServiceIds,
        [0]
      );
    count = 0;
    await readarrScanner.run();
    for (const row of rows) {
      const updated = await getRepository(Media).findOneByOrFail({
        id: row.id,
      });
      assert.deepEqual(updated.availableEbookServiceIds, []);
      assert.deepEqual(updated.availableAudiobookServiceIds, [9]);
    }
  });
  it('upgrade reconciliation never claims a bare Readarr identity from a different server', async () => {
    const other = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
        serviceId: 2,
        identifiers: [
          new MediaIdentifier({
            provider: MediaIdentifierProvider.READARR,
            value: '427578',
            canonical: true,
          }),
          new MediaIdentifier({
            provider: MediaIdentifierProvider.BOOKSHELF,
            value: makeBookshelfBookId(2, '427578'),
            canonical: true,
          }),
        ],
      })
    );
    configureReadarr([{ id: 1, serviceType: 'ebook' }]);
    knownDialect = 'hc';
    getBooksImpl = async () => [
      fakeReadarrBook({
        foreignBookId: '427578',
        editions: [
          { foreignEditionId: 'e', title: 'Test Book', monitored: true },
        ],
      }),
    ];
    await readarrScanner.run();
    const unchanged = await getRepository(Media).findOneByOrFail({
      id: other.id,
    });
    assert.equal(unchanged.status, MediaStatus.UNKNOWN);
    assert.equal(unchanged.serviceId, 2);
    assert.equal(
      await getRepository(Media).count({
        where: { mediaType: MediaType.BOOK },
      }),
      2
    );
  });
  it('upgrade file evidence survives optional edition enrichment failure', async () => {
    const legacy = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
        identifiers: [
          new MediaIdentifier({
            provider: MediaIdentifierProvider.BOOKSHELF,
            value: makeBookshelfBookId(1, '446680'),
            canonical: true,
          }),
        ],
      })
    );
    configureReadarr([{ id: 1, serviceType: 'audiobook' }]);
    knownDialect = 'hc';
    getBooksImpl = async () => [
      fakeReadarrBook({
        foreignBookId: 'hc:446680',
        editions: [],
        statistics: { bookFileCount: 1, totalBookCount: 1 },
      }),
    ];
    getEditionsImpl = async () => {
      throw new Error('fixture edition metadata unavailable');
    };
    await readarrScanner.run();
    const updated = await getRepository(Media).findOneByOrFail({
      id: legacy.id,
    });
    assert.equal(updated.status, MediaStatus.AVAILABLE);
    assert.deepEqual(updated.availableAudiobookServiceIds, [1]);
    assert.equal(
      await getRepository(Media).count({
        where: { mediaType: MediaType.BOOK },
      }),
      1
    );
  });

  for (const serviceType of ['ebook', 'audiobook'] as const) {
    it(`keeps case-sensitive opaque work identities separate for ${serviceType}`, async () => {
      const foreignIds = ['googlebooks:AbC123', 'googlebooks:abc123'];
      const rows = await getRepository(Media).save(
        foreignIds.map(
          (foreignBookId) =>
            new Media({
              tmdbId: 0,
              mediaType: MediaType.BOOK,
              status: MediaStatus.PROCESSING,
              identifiers: [
                new MediaIdentifier({
                  provider: MediaIdentifierProvider.BOOKSHELF,
                  value: makeBookshelfBookId(1, foreignBookId),
                  canonical: true,
                }),
              ],
            })
        )
      );
      configureReadarr([{ id: 1, serviceType }]);
      getBooksImpl = async () =>
        foreignIds.map((foreignBookId, i) =>
          fakeReadarrBook({
            id: 800 + i,
            foreignBookId,
            title: `Distinct work ${i}`,
            editions: [],
            monitored: true,
            statistics: { bookFileCount: i === 0 ? 1 : 0, totalBookCount: 1 },
          })
        );
      await readarrScanner.run();
      const owned = await getRepository(Media).findOneByOrFail({
        id: rows[0].id,
      });
      const missing = await getRepository(Media).findOneByOrFail({
        id: rows[1].id,
      });
      assert.equal(owned.status, MediaStatus.AVAILABLE);
      assert.notEqual(missing.status, MediaStatus.AVAILABLE);
      assert.deepEqual(
        serviceType === 'ebook'
          ? missing.availableEbookServiceIds
          : missing.availableAudiobookServiceIds,
        []
      );
      assert.equal(
        serviceType === 'ebook'
          ? missing.externalServiceId
          : missing.audiobookExternalServiceId,
        801
      );
    });
  }

  for (const emptyFirst of [false, true]) {
    it(`duplicate same-format records pool file evidence (empty record ${emptyFirst ? 'first' : 'last'})`, async () => {
      const requested = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.PROCESSING,
          status4k: MediaStatus.UNKNOWN,
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.BOOKSHELF,
              value: makeBookshelfBookId(1, '714600'),
              canonical: true,
            }),
          ],
        })
      );
      configureReadarr([{ id: 1, serviceType: 'ebook' }]);
      knownDialect = 'hc';
      const withFiles = fakeReadarrBook({
        id: 2038,
        title: 'Fourth Wing',
        foreignBookId: 'hc:714600',
        titleSlug: 'fourth-wing_5',
        monitored: true,
        editions: [],
        statistics: {
          bookFileCount: 1,
          ebookFileCount: 1,
          audiobookFileCount: 0,
          totalBookCount: 1,
        },
      });
      const empty = fakeReadarrBook({
        id: 2215,
        title: 'Fourth Wing',
        foreignBookId: 'hc:714600',
        titleSlug: 'fourth-wing_5_copy_53281849',
        monitored: false,
        editions: [],
        statistics: {
          bookFileCount: 0,
          ebookFileCount: 0,
          audiobookFileCount: 0,
          totalBookCount: 0,
        },
      });
      getBooksImpl = async () =>
        emptyFirst ? [empty, withFiles] : [withFiles, empty];

      await readarrScanner.run();

      const updated = await getRepository(Media).findOneByOrFail({
        id: requested.id,
      });
      assert.equal(updated.status, MediaStatus.AVAILABLE);
      assert.deepEqual(updated.availableEbookServiceIds, [1]);
      assert.equal(updated.serviceId, 1);
      assert.equal(updated.externalServiceId, 2038);
      assert.equal(updated.externalServiceSlug, 'fourth-wing_5');
      assert.equal(
        await getRepository(Media).count({
          where: { mediaType: MediaType.BOOK },
        }),
        1
      );
    });
  }

  describe('rows linked to a scanned record but scoped to another catalog server', () => {
    // A request for an ebook made from the audiobook catalog owns a row whose
    // identity is bookshelf:1:* while its ebook link names server 0, record 250.
    // The ebook scan resolves identity to the bookshelf:0:* sibling instead.
    const seedSplitRows = async (link = 250) => {
      const requested = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
          serviceId: 0,
          externalServiceId: link,
          audiobookServiceId: 1,
          audiobookExternalServiceId: 2031,
          availableAudiobookServiceIds: [1],
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.BOOKSHELF,
              value: makeBookshelfBookId(1, '428290'),
              canonical: true,
            }),
          ],
        })
      );
      const sibling = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.UNKNOWN,
          status4k: MediaStatus.UNKNOWN,
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.BOOKSHELF,
              value: makeBookshelfBookId(0, '428290'),
              canonical: true,
            }),
          ],
        })
      );
      return { requested, sibling };
    };
    const seedRequest = async (
      media: Media,
      preferredEditionId: string | null = null
    ) => {
      const requester = await getRepository(User).findOneByOrFail({ id: 1 });
      return getRepository(MediaRequest).save(
        new MediaRequest({
          type: MediaType.BOOK,
          media,
          requestedBy: requester,
          status: MediaRequestStatus.COMPLETED,
          is4k: false,
          bookFormat: 'ebook',
          preferredEditionId,
          serviceTargets: [
            {
              serviceType: 'readarr',
              format: 'ebook',
              serverId: 0,
              status: MediaStatus.PROCESSING,
              externalServiceId: 250,
            },
          ],
        })
      );
    };
    const stageOf = async (id: number) =>
      getRequestStatus(
        await getRepository(MediaRequest).findOneOrFail({
          where: { id },
          relations: { media: true },
        }),
        { downloads: [], servarrHistory: undefined }
      ).stage;
    let files = 1;
    beforeEach(() => {
      files = 1;
      mock.method(requestDispatchManager, 'enqueue', async () => undefined);
      mock.method(ReadarrAPI.prototype, 'getEditionCatalog', async () => []);
      configureReadarr([{ id: 0, serviceType: 'ebook' }]);
      knownDialect = 'hc';
      getBooksImpl = async () => [
        fakeReadarrBook({
          id: 250,
          foreignBookId: 'hc:428290',
          editions: [
            {
              foreignEditionId: 'gr:18846563-ebook',
              title: 'Test Book',
              monitored: true,
            },
          ],
          statistics: { bookFileCount: files, totalBookCount: 1 },
        }),
      ];
      getEditionsImpl = async () => [
        {
          foreignEditionId: 'gr:18846563-ebook',
          title: 'Test Book',
          monitored: true,
        },
        {
          foreignEditionId: 'hc:edition:31497360-ebook',
          title: 'Test Book',
          monitored: false,
        },
      ];
    });

    it('publishes the record file evidence to the linked row and keeps it across scans', async () => {
      const { requested, sibling } = await seedSplitRows();
      const request = await seedRequest(requested);
      assert.equal(await stageOf(request.id), RequestStatusStage.LIBRARY);

      for (let scan = 0; scan < 2; scan += 1) {
        await readarrScanner.run();
        const row = await getRepository(Media).findOneByOrFail({
          id: requested.id,
        });
        assert.deepEqual(row.availableEbookServiceIds, [0]);
        assert.deepEqual(row.availableAudiobookServiceIds, [1]);
        assert.equal(row.status, MediaStatus.AVAILABLE);
        assert.deepEqual(
          (await getRepository(Media).findOneByOrFail({ id: sibling.id }))
            .availableEbookServiceIds,
          [0]
        );
        assert.equal(await stageOf(request.id), RequestStatusStage.AVAILABLE);
      }

      files = 0;
      await readarrScanner.run();
      assert.deepEqual(
        (await getRepository(Media).findOneByOrFail({ id: requested.id }))
          .availableEbookServiceIds,
        []
      );
      assert.equal(await stageOf(request.id), RequestStatusStage.LIBRARY);
    });

    it('does not touch a row linked to a different record on the same server', async () => {
      const { requested } = await seedSplitRows(999);
      await readarrScanner.run();
      const row = await getRepository(Media).findOneByOrFail({
        id: requested.id,
      });
      assert.equal(row.availableEbookServiceIds, null);
      assert.equal(row.externalServiceId, 999);
    });

    it('keeps an exact-edition request open when another edition is on disk', async () => {
      const { requested } = await seedSplitRows();
      const request = await seedRequest(requested, '31497360');
      await readarrScanner.run();
      assert.deepEqual(
        (await getRepository(Media).findOneByOrFail({ id: requested.id }))
          .availableEbookServiceIds,
        [0]
      );
      const fresh = await getRepository(MediaRequest).findOneByOrFail({
        id: request.id,
      });
      assert.equal(fresh.serviceTargets?.[0]?.status, MediaStatus.PROCESSING);
      assert.notEqual(await stageOf(request.id), RequestStatusStage.AVAILABLE);
    });
  });

  describe('exact-edition requests completed outside their search', () => {
    beforeEach(() =>
      mock.method(requestDispatchManager, 'enqueue', async () => undefined)
    );
    // The edition check asks Chaptarr for its catalog; tests have no network, so
    // answer with an empty catalog and fall back to the monitored editions.
    beforeEach(() => {
      mock.method(ReadarrAPI.prototype, 'getEditionCatalog', async () => []);
    });
    const seedStuckRequest = async (format: 'ebook' | 'audiobook') => {
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.PROCESSING,
          status4k: MediaStatus.UNKNOWN,
          identifiers: [
            new MediaIdentifier({
              provider: MediaIdentifierProvider.ISBN,
              value: '9780000000001',
              canonical: true,
            }),
          ],
        })
      );
      const requester = await getRepository(User).findOneByOrFail({ id: 1 });
      return getRepository(MediaRequest).save(
        new MediaRequest({
          type: MediaType.BOOK,
          media,
          requestedBy: requester,
          status: MediaRequestStatus.COMPLETED,
          is4k: false,
          bookFormat: format,
          preferredEditionId: '31540799',
          serviceTargets: [
            {
              serviceType: 'readarr',
              format,
              serverId: 0,
              status: MediaStatus.PROCESSING,
              externalServiceId: 1,
              externalServiceSlug: '747398',
            },
          ],
        })
      );
    };
    const targetStatus = async (id: number) =>
      (await getRepository(MediaRequest).findOneByOrFail({ id }))
        .serviceTargets?.[0]?.status;

    const configureOwnedEdition = (format: 'ebook' | 'audiobook' = 'ebook') => {
      configureReadarr([{ serviceType: format }]);
      knownDialect = 'hc';
      getBooksImpl = async () => [
        fakeReadarrBook({
          editions: [
            {
              foreignEditionId: `hc:edition:31540799-${format}`,
              title: 'Test Book',
              isbn13: '9780000000001',
              monitored: true,
            },
          ],
        }),
      ];
      getEditionsImpl = async () => [
        {
          foreignEditionId: `hc:edition:31540799-${format}`,
          title: 'Test Book',
          monitored: true,
        },
      ];
    };
    it('keeps a both-format request approved while the other format is missing', async () => {
      configureOwnedEdition();
      const request = await seedStuckRequest('ebook');
      await getRepository(MediaRequest).update(request.id, {
        status: MediaRequestStatus.APPROVED,
        bookFormat: 'both',
        serviceTargets: [
          ...request.serviceTargets!,
          {
            serviceType: 'readarr',
            format: 'audiobook',
            serverId: 1,
            externalServiceId: 1,
            status: MediaStatus.PROCESSING,
          },
        ],
      });
      await readarrScanner.run();
      const fresh = await getRepository(MediaRequest).findOneByOrFail({
        id: request.id,
      });
      assert.equal(fresh.status, MediaRequestStatus.APPROVED);
      assert.deepEqual(
        fresh.serviceTargets?.map((t) => t.status),
        [MediaStatus.AVAILABLE, MediaStatus.PROCESSING]
      );
    });
    it('does not overwrite cancellation during edition metadata I/O', async () => {
      configureOwnedEdition();
      const request = await seedStuckRequest('ebook');
      mock.method(ReadarrAPI.prototype, 'getEditionCatalog', async () => {
        await getRepository(MediaRequest).update(request.id, {
          status: MediaRequestStatus.DECLINED,
        });
        return [{ foreignEditionId: 'hc:edition:31540799-ebook', owned: true }];
      });
      await readarrScanner.run();
      assert.equal(
        (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
          .status,
        MediaRequestStatus.DECLINED
      );
      assert.equal(await targetStatus(request.id), MediaStatus.PROCESSING);
    });
    it('does not overwrite a retargeted request after edition metadata I/O', async () => {
      configureOwnedEdition();
      const request = await seedStuckRequest('ebook');
      mock.method(ReadarrAPI.prototype, 'getEditionCatalog', async () => {
        await getRepository(MediaRequest).update(request.id, {
          serviceTargets: request.serviceTargets!.map((t) => ({
            ...t,
            externalServiceId: 9999,
          })),
        });
        return [{ foreignEditionId: 'hc:edition:31540799-ebook', owned: true }];
      });
      await readarrScanner.run();
      const fresh = await getRepository(MediaRequest).findOneByOrFail({
        id: request.id,
      });
      assert.equal(fresh.serviceTargets?.[0]?.externalServiceId, 9999);
      assert.equal(fresh.serviceTargets?.[0]?.status, MediaStatus.PROCESSING);
    });
    it('leaves a changed service authority unpromoted after metadata I/O', async () => {
      configureOwnedEdition();
      const request = await seedStuckRequest('ebook');
      mock.method(ReadarrAPI.prototype, 'getEditionCatalog', async () => {
        getSettings().readarr[0].apiKey = 'rotated-fixture-key';
        return [{ foreignEditionId: 'hc:edition:31540799-ebook', owned: true }];
      });
      await readarrScanner.run();
      assert.equal(await targetStatus(request.id), MediaStatus.PROCESSING);
    });
    it('leaves an active search operation in control of its format and service', async () => {
      configureOwnedEdition();
      const request = await seedStuckRequest('ebook');
      await getRepository(BookRequestSearch).save(
        new BookRequestSearch({
          requestId: request.id,
          serviceId: 0,
          format: 'ebook',
          state: 'monitoring',
          bookId: 1,
        })
      );
      await readarrScanner.run();
      assert.equal(await targetStatus(request.id), MediaStatus.PROCESSING);
    });
    it('does not complete a reused numeric book ID for a different work', async () => {
      configureOwnedEdition();
      const request = await seedStuckRequest('ebook');
      await getRepository(MediaIdentifier).delete({
        media: { id: request.media.id },
      });
      await getRepository(MediaIdentifier).save(
        new MediaIdentifier({
          media: request.media,
          provider: MediaIdentifierProvider.BOOKSHELF,
          value: makeBookshelfBookId(0, 'hc:original-work'),
          canonical: true,
        })
      );
      mock.method(ReadarrAPI.prototype, 'getEditionCatalog', async () => [
        { foreignEditionId: 'hc:edition:31540799-ebook', owned: true },
      ]);
      await readarrScanner.run();
      assert.equal(await targetStatus(request.id), MediaStatus.PROCESSING);
    });
    it('reconciles every eligible request across a bounded query batch', async () => {
      configureOwnedEdition();
      const first = await seedStuckRequest('ebook');
      const requester = await getRepository(User).findOneByOrFail({ id: 1 });
      const rest = await getRepository(MediaRequest).save(
        Array.from(
          { length: 104 },
          () =>
            new MediaRequest({
              type: MediaType.BOOK,
              media: first.media,
              requestedBy: requester,
              status: MediaRequestStatus.COMPLETED,
              is4k: false,
              bookFormat: 'ebook',
              preferredEditionId: first.preferredEditionId,
              serviceTargets: first.serviceTargets,
            })
        )
      );
      await readarrScanner.run();
      for (const id of [first.id, rest[99].id, rest[103].id])
        assert.equal(await targetStatus(id), MediaStatus.AVAILABLE);
    });

    for (const format of ['ebook', 'audiobook'] as const) {
      it(`marks a ${format} target available when its exact edition is on disk`, async () => {
        configureReadarr([{ serviceType: format }]);
        knownDialect = 'hc';
        const request = await seedStuckRequest(format);
        getEditionsImpl = async () => [
          {
            foreignEditionId: `hc:edition:31540799-${format}`,
            title: 'Test Book',
            monitored: true,
          },
        ];
        getBooksImpl = async () => [
          fakeReadarrBook({
            editions: [
              {
                foreignEditionId: `hc:edition:31540799-${format}`,
                title: 'Test Book',
                isbn13: '9780000000001',
                monitored: true,
              },
            ],
          }),
        ];
        await readarrScanner.run();
        assert.equal(await targetStatus(request.id), MediaStatus.AVAILABLE);
      });

      it(`leaves a ${format} target processing when a different edition is on disk`, async () => {
        configureReadarr([{ serviceType: format }]);
        knownDialect = 'hc';
        const request = await seedStuckRequest(format);
        getEditionsImpl = async () => [
          {
            foreignEditionId: `hc:edition:99999999-${format}`,
            title: 'Test Book',
            monitored: true,
          },
        ];
        getBooksImpl = async () => [
          fakeReadarrBook({
            editions: [
              {
                foreignEditionId: `hc:edition:99999999-${format}`,
                title: 'Test Book',
                isbn13: '9780000000001',
                monitored: true,
              },
            ],
          }),
        ];
        await readarrScanner.run();
        assert.equal(await targetStatus(request.id), MediaStatus.PROCESSING);
      });
    }
  });
});
