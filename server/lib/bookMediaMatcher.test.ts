import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import ReadarrAPI from '@server/api/servarr/readarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { User } from '@server/entity/User';
import downloadTracker, {
  type DownloadingItem,
} from '@server/lib/downloadtracker';
import { resolveLiveDownloadToken } from '@server/lib/liveDownloadTokens';
import { aliasDownloadId } from '@server/lib/mediaResponse';
import { Permission } from '@server/lib/permissions';
import { getSettings, type ReadarrSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import {
  findBookMediaForBookResults,
  findBookMediaForSearchDocs,
} from './bookMediaMatcher';

setupTestDb();

async function seedIdentity(provider: MediaIdentifierProvider, value: string) {
  const media = await getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status: MediaStatus.AVAILABLE,
    })
  );
  await getRepository(MediaIdentifier).save(
    new MediaIdentifier({ media, provider, value })
  );
  return media;
}

describe('Bookshelf scoped catalog matching (issue #382)', () => {
  it('resolves the exact Bookshelf identity without any ISBN', async () => {
    const id = makeBookshelfBookId(1, 'fixture-a');
    const media = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, id);
    const matches = await findBookMediaForBookResults([{ id }]);
    assert.equal(matches.get(id)?.id, media.id);
  });
  it('keeps equal foreign IDs from separate service namespaces distinct', async () => {
    const first = makeBookshelfBookId(1, 'fixture-a');
    const second = makeBookshelfBookId(2, 'fixture-a');
    const a = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, first);
    const b = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, second);
    const matches = await findBookMediaForBookResults([
      { id: first },
      { id: second },
    ]);
    assert.equal(matches.get(first)?.id, a.id);
    assert.equal(matches.get(second)?.id, b.id);
  });
  it('prefers exact catalog identity over a conflicting ISBN match', async () => {
    const id = makeBookshelfBookId(1, 'fixture-a');
    const exact = await seedIdentity(MediaIdentifierProvider.BOOKSHELF, id);
    const other = await seedIdentity(
      MediaIdentifierProvider.ISBN,
      '9780306406157'
    );
    const matches = await findBookMediaForBookResults([
      { id, isbn13: '9780306406157' },
    ]);
    assert.notEqual(exact.id, other.id);
    assert.equal(matches.get(id)?.id, exact.id);
  });
  it('uses normalized valid ISBN fallback when no exact identity exists', async () => {
    const id = makeBookshelfBookId(1, 'missing-work');
    const media = await seedIdentity(
      MediaIdentifierProvider.ISBN,
      '9780306406157'
    );
    const matches = await findBookMediaForBookResults([
      { id, isbnCandidates: [{ isbn: '0-306-40615-2' }] },
    ]);
    assert.equal(matches.get(id)?.id, media.id);
  });
  it('rejects a Bookshelf ID falsely labelled as Open Library', async () => {
    const id = makeBookshelfBookId(1, 'fixture-a');
    await seedIdentity(MediaIdentifierProvider.BOOKSHELF, id);
    const matches = await findBookMediaForBookResults([
      { id, provider: 'openlibrary' },
    ]);
    assert.equal(matches.size, 0);
  });
  it('retains normalized Open Library matching and rejects invalid ISBN fallback', async () => {
    const media = await seedIdentity(
      MediaIdentifierProvider.OPENLIBRARY,
      'OL123W'
    );
    const matched = await findBookMediaForBookResults([
      { id: '/works/OL123W', provider: 'openlibrary' },
    ]);
    assert.equal(matched.get('OL123W')?.id, media.id);
    const unmatched = await findBookMediaForBookResults([
      { id: makeBookshelfBookId(1, 'missing-work'), isbn13: '9781234567890' },
    ]);
    assert.equal(unmatched.size, 0);
  });
});

describe('ChaptarrNG bare and qualified catalog ids', () => {
  // Service 1 is a Hardcover ChaptarrNG, 2 a Goodreads one, 3 plain Readarr.
  const services = [
    { id: 1, hostname: 'hc.chaptarr.test', dialect: 'hc' as const },
    { id: 2, hostname: 'gr.chaptarr.test', dialect: 'gr' as const },
    { id: 3, hostname: 'readarr.test', dialect: null },
  ];
  let originalReadarr: ReadarrSettings[];

  beforeEach(() => {
    const settings = getSettings();
    originalReadarr = settings.readarr;
    settings.readarr = services.map(
      ({ id, hostname }) =>
        ({
          id,
          name: hostname,
          hostname,
          port: 8787,
          apiKey: 'key',
          useSsl: false,
          serviceType: 'audiobook',
        }) as ReadarrSettings
    );
    // The dialect each service's library ids were read with.
    mock.method(
      ReadarrAPI,
      'getKnownLibraryIdDialect',
      (url: string) =>
        services.find(({ hostname }) => url.includes(hostname))?.dialect
    );
  });

  afterEach(() => {
    getSettings().readarr = originalReadarr;
    mock.restoreAll();
  });

  it('matches an old bare-id row to the qualified library book', async () => {
    const media = await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      makeBookshelfBookId(1, '459744')
    );
    const qualified = makeBookshelfBookId(1, 'hc:459744');
    const matches = await findBookMediaForBookResults([{ id: qualified }]);
    assert.equal(matches.get(qualified)?.id, media.id);
  });

  it('matches a qualified row to an old bare-id link', async () => {
    const media = await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      makeBookshelfBookId(2, 'gr:90439420')
    );
    const bare = makeBookshelfBookId(2, '90439420');
    const matches = await findBookMediaForBookResults([{ id: bare }]);
    assert.equal(matches.get(bare)?.id, media.id);
  });

  it('prefers the exact row over an alias row', async () => {
    const qualified = makeBookshelfBookId(1, 'hc:459744');
    const exact = await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      qualified
    );
    await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      makeBookshelfBookId(1, '459744')
    );
    const matches = await findBookMediaForBookResults([{ id: qualified }]);
    assert.equal(matches.get(qualified)?.id, exact.id);
  });

  it('never matches across dialects or services', async () => {
    // A bare number on the Hardcover service is a Hardcover work ...
    await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      makeBookshelfBookId(1, '459744')
    );
    // ... and a bare number on the Goodreads service a Goodreads work.
    await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      makeBookshelfBookId(2, '459745')
    );
    // Plain Readarr ids have no qualified spelling.
    await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      makeBookshelfBookId(3, '459746')
    );
    const ids = [
      makeBookshelfBookId(1, 'gr:459744'),
      makeBookshelfBookId(2, 'hc:459745'),
      makeBookshelfBookId(2, 'gr:459744'),
      makeBookshelfBookId(1, 'hc:459745'),
      makeBookshelfBookId(3, 'hc:459746'),
    ];
    const matches = await findBookMediaForBookResults(
      ids.map((id) => ({ id }))
    );
    assert.equal(matches.size, 0);
  });

  it('does not bridge ids before the service dialect is known', async () => {
    mock.restoreAll();
    mock.method(ReadarrAPI, 'getKnownLibraryIdDialect', () => undefined);
    await seedIdentity(
      MediaIdentifierProvider.BOOKSHELF,
      makeBookshelfBookId(1, '459744')
    );
    const matches = await findBookMediaForBookResults([
      { id: makeBookshelfBookId(1, 'hc:459744') },
    ]);
    assert.equal(matches.size, 0);
  });
});

describe('owned library matching with duplicate media rows (issue #625)', () => {
  const bookRow = (fields: Partial<Media>, identifier: string) =>
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
      ...fields,
      identifiers: [
        new MediaIdentifier({
          provider: MediaIdentifierProvider.BOOKSHELF,
          value: identifier,
          canonical: true,
        }),
      ],
    });

  it('matches every book in a library larger than one lookup batch', async () => {
    const ids = Array.from({ length: 260 }, (_, i) =>
      makeBookshelfBookId(1, `hc:${1000 + i}`)
    );
    await getRepository(Media).save(
      ids.map((id, i) =>
        bookRow(
          {
            audiobookServiceId: 1,
            audiobookExternalServiceId: i + 1,
            availableAudiobookServiceIds: [1],
          },
          id
        )
      )
    );
    const matches = await findBookMediaForBookResults(
      ids.map((id) => ({ id, provider: 'bookshelf' as const }))
    );
    assert.equal(matches.size, ids.length);
    assert.ok(matches.get(ids[259]));
  });

  it('carries files and the Audiobookshelf item from a duplicate row for the same Chaptarr record', async () => {
    const id = makeBookshelfBookId(1, '292354');
    const scoped = await getRepository(Media).save(
      bookRow(
        {
          audiobookServiceId: 1,
          audiobookExternalServiceId: 2096,
          availableAudiobookServiceIds: [1],
        },
        id
      )
    );
    const scanned = await getRepository(Media).save(
      bookRow(
        {
          serviceId: 0,
          externalServiceId: 2802,
          audiobookServiceId: 1,
          audiobookExternalServiceId: 2096,
          audiobookLibraryServiceId: 1,
          audiobookLibraryItemId: 'abs-martian',
          availableEbookServiceIds: [],
          availableAudiobookServiceIds: [1],
        },
        makeBookshelfBookId(0, '292354')
      )
    );
    assert.notEqual(scoped.id, scanned.id);
    const matches = await findBookMediaForBookResults([
      { id, provider: 'bookshelf' },
    ]);
    assert.equal(matches.get(id)?.id, scoped.id);
    assert.equal(matches.get(id)?.audiobookLibraryItemId, 'abs-martian');
  });

  it(
    'keeps book live-download tokens valid after projecting duplicate file observations',
    async () => {
      const id = makeBookshelfBookId(1, 'active-download');
      const serviceId = 0;
      const externalServiceId = 9876;
      const downloadId = 'a'.repeat(40);
      const user = new User({ id: 92, permissions: Permission.REQUEST });
      const download: DownloadingItem = {
        mediaType: MediaType.BOOK,
        externalId: externalServiceId,
        size: 100,
        sizeLeft: 40,
        status: 'downloading',
        timeLeft: '1 hour',
        estimatedCompletionTime: new Date('2026-11-12T00:00:00Z'),
        title: 'Private.Release.Name-GROUP',
        downloadId,
        protocol: 'torrent',
        downloadClient: 'Private qBittorrent',
      };
      const primary = await getRepository(Media).save(
        bookRow(
          { serviceId, externalServiceId, status: MediaStatus.AVAILABLE },
          id
        )
      );
      await getRepository(Media).save(
        bookRow(
          { serviceId, externalServiceId, status: MediaStatus.AVAILABLE },
          makeBookshelfBookId(0, 'active-download')
        )
      );
      const getBookProgress = mock.method(
        downloadTracker,
        'getBookProgress',
        (serverId: number, recordId: number) =>
          serverId === serviceId && recordId === externalServiceId
            ? [download]
            : []
      );

      try {
        const media = (
          await findBookMediaForBookResults(
            [{ id, provider: 'bookshelf' }],
            user
          )
        ).get(id);
        const liveDownload = media?.downloadStatus?.[0];

        assert.equal(media?.id, primary.id);
        assert.equal(liveDownload?.downloadId, aliasDownloadId(downloadId));
        assert.equal(
          resolveLiveDownloadToken(liveDownload?.liveDownloadToken, user.id),
          downloadId
        );
      } finally {
        getBookProgress.mock.restore();
      }
    }
  );

  it('keeps the exact row when a duplicate has no better evidence or belongs to another service', async () => {
    const id = makeBookshelfBookId(1, '427578');
    const exact = await getRepository(Media).save(
      bookRow(
        {
          audiobookServiceId: 1,
          audiobookExternalServiceId: 2214,
          availableAudiobookServiceIds: [1],
        },
        id
      )
    );
    await getRepository(Media).save([
      bookRow(
        {
          status: MediaStatus.UNKNOWN,
          audiobookServiceId: 1,
          audiobookExternalServiceId: 2214,
          availableAudiobookServiceIds: [],
        },
        makeBookshelfBookId(0, '427578')
      ),
      bookRow(
        {
          audiobookServiceId: 9,
          audiobookExternalServiceId: 2214,
          audiobookLibraryServiceId: 1,
          audiobookLibraryItemId: 'abs-other-server',
          availableAudiobookServiceIds: [9],
        },
        makeBookshelfBookId(9, '427578')
      ),
    ]);
    const matches = await findBookMediaForBookResults([
      { id, provider: 'bookshelf' },
    ]);
    assert.equal(matches.get(id)?.id, exact.id);
  });
});

describe('Open Library search result matching', () => {
  it('looks up every work id before any ISBN fallback', async () => {
    const owned = await seedIdentity(
      MediaIdentifierProvider.OPENLIBRARY,
      'OL2W'
    );
    // a popular work first in the page, with a full ISBN budget of editions
    const isbns = Array.from({ length: 200 }, (_, index) => {
      const body = `978${String(index).padStart(9, '0')}`;
      const sum = [...body].reduce(
        (total, digit, position) =>
          total + Number(digit) * (position % 2 ? 3 : 1),
        0
      );
      return `${body}${(10 - (sum % 10)) % 10}`;
    });
    const matches = await findBookMediaForSearchDocs([
      { key: '/works/OL1W', title: 'Popular', isbn: isbns },
      { key: '/works/OL2W', title: 'Owned' },
    ]);
    assert.equal(matches.get('OL2W')?.id, owned.id);
    assert.equal(matches.has('OL1W'), false);
  });

  it('matches a work through an owned edition ISBN', async () => {
    const owned = await seedIdentity(
      MediaIdentifierProvider.ISBN,
      '9780306406157'
    );
    const matches = await findBookMediaForSearchDocs([
      { key: '/works/OL3W', title: 'Owned elsewhere', isbn: ['0306406152'] },
    ]);
    assert.equal(matches.get('OL3W')?.id, owned.id);
  });
});
