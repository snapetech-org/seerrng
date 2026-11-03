import { MediaStatus, MediaType } from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { runWithRequestAdmission } from '@server/entity/MediaRequest';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

class TestScanner extends BaseScanner<never> {
  public constructor() {
    super('Test Scan');
  }

  public begin(): string | undefined {
    return this.startRun();
  }

  public finish(sessionId: string): void {
    this.endRun(sessionId);
  }

  public isRunning(): boolean {
    return this.running;
  }

  public scanMusic(mbId: string): Promise<void> {
    return this.processMusic(mbId, { processing: true });
  }

  public scanBook(value: string): Promise<void> {
    return this.processBook(MediaIdentifierProvider.ISBN, value, {
      processing: true,
    });
  }

  public scanLibraryBook(
    provider: MediaIdentifierProvider,
    value: string,
    options: Parameters<BaseScanner<never>['processBook']>[2]
  ): Promise<void> {
    return this.processBook(provider, value, options);
  }
}

setupTestDb();

describe('BaseScanner run admission', () => {
  it('rejects an overlapping invocation without replacing the active run', () => {
    const scanner = new TestScanner();
    const firstSessionId = scanner.begin();

    assert.ok(firstSessionId);
    assert.strictEqual(scanner.isRunning(), true);
    assert.strictEqual(scanner.begin(), undefined);

    scanner.finish(firstSessionId);
    assert.strictEqual(scanner.isRunning(), false);
    assert.ok(scanner.begin());
  });

  it('shares canonical music admission with request creation', async () => {
    const scanner = new TestScanner();
    const mbId = 'scanner-request-admission';
    const key = `request-canonical:music:${mbId}`;
    let releaseBlocker: () => void = () => undefined;
    let markEntered: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const blocker = runWithRequestAdmission([key], async () => {
      markEntered();
      await new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });
    });
    await entered;

    const scan = scanner.scanMusic(mbId);
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(
      await getRepository(Media).countBy({
        mediaType: MediaType.MUSIC,
        mbId,
      }),
      0
    );

    releaseBlocker();
    await Promise.all([blocker, scan]);
    assert.strictEqual(
      await getRepository(Media).countBy({
        mediaType: MediaType.MUSIC,
        mbId,
      }),
      1
    );
  });

  it('rolls back new book media when identifier persistence fails', async () => {
    const scanner = new TestScanner();
    await dataSource.query(`
      CREATE TRIGGER fail_scanner_identifier_insert
      BEFORE INSERT ON media_identifier
      BEGIN
        SELECT RAISE(FAIL, 'forced identifier failure');
      END
    `);

    try {
      await assert.rejects(
        scanner.scanBook('9780547928227'),
        /forced identifier failure/i
      );
    } finally {
      await dataSource.query('DROP TRIGGER fail_scanner_identifier_insert');
    }

    assert.strictEqual(
      await getRepository(Media).countBy({ mediaType: MediaType.BOOK }),
      0
    );
  });

  // A request made from the Bookshelf catalog stores only the catalog id
  // (e.g. a Goodreads-based "bookshelf:1:..." value), while Bookshelf may add
  // the book under a different metadata id (e.g. Hardcover). The request flow
  // records the service and the Bookshelf book id on the media, so the scan
  // must match on that link instead of creating a second media row.
  for (const format of ['audiobook', 'ebook'] as const) {
    it(`matches a requested ${format} by its Bookshelf service and book id`, async () => {
      const scanner = new TestScanner();
      const requested = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.PROCESSING,
          ...(format === 'audiobook'
            ? { audiobookServiceId: 2, audiobookExternalServiceId: 101362 }
            : { serviceId: 2, externalServiceId: 101362 }),
        })
      );
      await getRepository(MediaIdentifier).save(
        new MediaIdentifier({
          media: requested,
          provider: MediaIdentifierProvider.BOOKSHELF,
          value: 'bookshelf:1:Z3I6Njg4Mjk5',
        })
      );

      await scanner.scanLibraryBook(
        MediaIdentifierProvider.ISBN,
        '9780375402975',
        {
          serviceId: 2,
          externalServiceId: 101362,
          title: 'Congo',
          hasFile: true,
          bookServiceType: format,
          secondaryIdentifiers: [
            { provider: MediaIdentifierProvider.READARR, value: '380571' },
          ],
        }
      );

      const books = await getRepository(Media).find({
        where: { mediaType: MediaType.BOOK },
        relations: { identifiers: true },
      });
      assert.strictEqual(books.length, 1, 'scan created a duplicate book');
      assert.strictEqual(books[0].id, requested.id);
      assert.strictEqual(books[0].status, MediaStatus.AVAILABLE);
      assert.deepStrictEqual(
        books[0].identifiers.map((i) => `${i.provider}:${i.value}`).sort(),
        [
          'bookshelf:bookshelf:1:Z3I6Njg4Mjk5',
          'isbn:9780375402975',
          'readarr:380571',
        ]
      );
    });
  }

  it('does not match a book linked to the same id on another service', async () => {
    const scanner = new TestScanner();
    const other = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.PROCESSING,
        audiobookServiceId: 3,
        audiobookExternalServiceId: 101362,
      })
    );

    await scanner.scanLibraryBook(
      MediaIdentifierProvider.ISBN,
      '9780375402975',
      {
        serviceId: 2,
        externalServiceId: 101362,
        title: 'Congo',
        hasFile: true,
        bookServiceType: 'audiobook',
      }
    );

    assert.strictEqual(
      await getRepository(Media).countBy({ mediaType: MediaType.BOOK }),
      2
    );
    const untouched = await getRepository(Media).findOneByOrFail({
      id: other.id,
    });
    assert.strictEqual(untouched.status, MediaStatus.PROCESSING);
  });
});
